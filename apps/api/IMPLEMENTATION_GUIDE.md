# Critical Security Fixes - Implementation Guide

## Priority 1: Admin Password Hashing

### Current Issue
Admin passwords are stored in plain text in environment variables and compared directly.

### Solution
Install bcrypt and implement proper password hashing.

```bash
cd apps/api
npm install bcrypt
```

Update `lib/admin.js` to hash admin passwords:

```javascript
import bcrypt from 'bcrypt';
import { env } from './http.js';

// At startup, hash the admin password (do this once)
let ADMIN_PASS_HASH = null;
async function getAdminHash() {
  if (!ADMIN_PASS_HASH) {
    // For production: pre-hash and store the hash in env instead
    ADMIN_PASS_HASH = await bcrypt.hash(env('PROCTOR_ADMIN_PASS'), 12);
  }
  return ADMIN_PASS_HASH;
}

async function adminLogin({ ip, json }) {
  const b = await json();
  const username = String(b.username || '').trim();
  const password = String(b.password || '');
  
  await assertAdminAllowed(ip);
  
  const validUser = username === env('PROCTOR_ADMIN_USER');
  const hash = await getAdminHash();
  const validPass = await bcrypt.compare(password, hash);
  
  if (!validUser || !validPass) {
    await recordAdminFailure(ip);
    throw new HttpError(401, 'Invalid credentials');
  }
  
  return { token: await signToken({ role: 'admin', sub: username }, 24) };
}
```

**Better approach for production:**
1. Pre-hash your password: `node -e "const bcrypt = require('bcrypt'); bcrypt.hash('your-password', 12).then(console.log)"`
2. Store the hash in `PROCTOR_ADMIN_PASS_HASH` environment variable
3. Compare submitted password against the stored hash

---

## Priority 2: Request Size Limits

Update `apps/api/next.config.mjs`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  api: {
    bodyParser: {
      sizeLimit: '500kb', // Prevent large payload attacks
    },
    responseLimit: '8mb', // Allow larger exports
  },
};

export default nextConfig;
```

---

## Priority 3: Content Security Policy

Update `apps/web/next.config.mjs`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js needs unsafe-eval in dev
              "style-src 'self' 'unsafe-inline'",
              `connect-src 'self' ${process.env.NEXT_PUBLIC_API_BASE || ''}`,
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

---

## Priority 4: Anonymous IP Rate Limiting

Update `apps/api/lib/ratelimit.js`:

Add new limiter:
```javascript
// In limiters() function:
anonIp: mk('anon', num('RL_ANON_PER_MIN', 100), '1 m'),
```

Add new export:
```javascript
export const limitAnonIp = (ip) => hit('anonIp', ip, 'busy');
```

Update `apps/api/lib/exam.js`:

```javascript
async function login({ ip, json }) {
  await limitAnonIp(ip);  // Add this line BEFORE authentication
  const b = await needJson(json), email = normEmail(b.email), roll = normRoll(b.password);
  await limitLoginGlobal();
  // ... rest of function
}
```

---

## Priority 5: Answer Submission Retry (Frontend)

Create `apps/web/lib/retry.js`:

```javascript
export async function withRetry(fn, maxRetries = 5, backoff = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error; // Last attempt failed
      }
      
      // Exponential backoff with jitter
      const delay = Math.min(backoff * Math.pow(2, attempt), 10000);
      const jitter = Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }
}
```

Update `apps/web/lib/api.js`:

```javascript
import { withRetry } from './retry.js';

export async function submitExam(answers) {
  // Critical: retry submission with exponential backoff
  return withRetry(async () => {
    const res = await fetch(`${API_BASE}/api/exam/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({ answers }),
    });
    
    if (!res.ok) {
      if (res.status === 429) {
        // Rate limited - wait longer
        const retryAfter = parseInt(res.headers.get('Retry-After') || '5');
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        throw new Error('Rate limited, retrying...');
      }
      throw new Error(`Submit failed: ${res.statusText}`);
    }
    
    return res.json();
  }, 5, 1000);
}
```

---

## Priority 6: Firestore Backups

### Automated Backups

```bash
# Enable daily backups
gcloud firestore backups schedules create \
  --project=YOUR_PROJECT_ID \
  --database='(default)' \
  --recurrence=daily \
  --retention=7d

# Verify backup schedule
gcloud firestore backups schedules list --project=YOUR_PROJECT_ID
```

### Manual Backup Before Exam

```bash
# Create backup bucket
gsutil mb -p YOUR_PROJECT_ID -l REGION gs://YOUR_PROJECT_ID-backups

# Export Firestore
gcloud firestore export gs://YOUR_PROJECT_ID-backups/exam-$(date +%Y%m%d-%H%M) \
  --project=YOUR_PROJECT_ID \
  --async

# Check export status
gcloud firestore operations list --project=YOUR_PROJECT_ID
```

### Restore from Backup

```bash
# Import from backup
gcloud firestore import gs://YOUR_PROJECT_ID-backups/exam-20261009-1000 \
  --project=YOUR_PROJECT_ID
```

---

## Priority 7: Set minInstances Before Exam

Update `apps/api/apphosting.yaml`:

```yaml
# Production configuration (1 hour before exam)
runConfig:
  minInstances: 2      # Keep 2 instances always warm
  maxInstances: 10     # Allow scaling up to 10
  cpu: 2               # 2 vCPUs per instance
  memoryMiB: 1024      # 1GB RAM per instance
  concurrency: 80      # 80 concurrent requests per instance

# After exam, revert to:
# minInstances: 0      # Scale to zero when idle
# maxInstances: 5
```

Deploy with:
```bash
firebase deploy --only hosting:api
```

---

## Priority 8: Monitoring & Alerts

### Health Check Monitoring

Set up monitoring with UptimeRobot, Pingdom, or similar:
- URL: `https://your-backend.hosted.app/api/health`
- Interval: 1 minute
- Alert on: HTTP status != 200
- Alert methods: Email, SMS

### Application Monitoring

Add simple performance tracking to `apps/api/lib/router.js`:

```javascript
export async function dispatch(req, ctx) {
  const start = Date.now();
  const cors = { ...corsHeaders(req), 'Cache-Control': 'no-store' };
  
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  
  try {
    const { path = [] } = await ctx.params, segs = path.map(decodeURIComponent);
    const route = path.join('/');
    
    for (const r of ROUTES) {
      if (r.method !== req.method) continue;
      const params = match(r.parts, segs); if (!params) continue;
      const json = async () => { try { return await req.json(); } catch { throw new HttpError(400, 'Invalid JSON body'); } };
      const out = await r.fn({ req, params, ip: clientIp(req), url: new URL(req.url), json });
      
      // Log slow requests
      const duration = Date.now() - start;
      if (duration > 1000) {
        console.warn(`SLOW REQUEST: ${r.method} /${route} took ${duration}ms`);
      }
      
      if (out instanceof Response) { for (const [k, v] of Object.entries(cors)) out.headers.set(k, v); return out; }
      return Response.json(out, { headers: cors });
    }
    throw new HttpError(404, 'Not found');
  } catch (e) {
    const duration = Date.now() - start;
    
    if (e instanceof HttpError) {
      // Log errors with timing
      if (e.status >= 500) {
        console.error(`ERROR: ${req.method} ${req.url} - ${e.status} ${e.message} (${duration}ms)`);
      }
      
      const h = { ...cors }; if (e.extra?.retryAfter) h['Retry-After'] = String(e.extra.retryAfter);
      return Response.json({ detail: e.message, ...e.extra }, { status: e.status, headers: h });
    }
    
    console.error('UNHANDLED ERROR:', e, `(${duration}ms)`);
    return Response.json({ detail: 'Internal error' }, { status: 500, headers: cors });
  }
}
```

---

## Priority 9: Load Test Execution

### Before Running Load Test

1. **Create test hackathon** in admin panel
2. **Generate test users:**
   ```bash
   cd loadtest
   python make_csv.py 2500
   ```
3. **Upload CSV** in test hackathon
4. **Add test questions** (at least 10-20 questions)
5. **Open hackathon** for participants

### Run Load Test

```bash
# Install locust
pip install locust

# Run load test
locust -f loadtest/locustfile.py \
  --host https://your-backend.hosted.app \
  -u 2500 \
  -r 100 \
  --run-time 1h \
  --html loadtest-report.html

# Open browser to http://localhost:8089
# Monitor: requests/sec, response times, failure rate
```

### Success Criteria

- ✅ **Failure rate:** < 1%
- ✅ **P95 latency:** < 500ms
- ✅ **P99 latency:** < 2000ms
- ✅ **Login 429 errors:** Some are OK (rate limiter working)
- ✅ **No 500 errors:** System should not crash

### After Load Test

```bash
# Scale back down to save costs
# Update apphosting.yaml:
runConfig:
  minInstances: 0
  maxInstances: 5

# Redeploy
firebase deploy --only hosting:api
```

---

## Emergency Procedures Document

Create `EMERGENCY_PROCEDURES.md`:

```markdown
# Emergency Procedures - Exam Day

## Pre-Exam Checklist (1 hour before)
- [ ] Verify all services are online (health check)
- [ ] Set minInstances: 2 and deploy
- [ ] Create manual Firestore backup
- [ ] Test admin login
- [ ] Verify Upstash Redis is responding
- [ ] Clear browser cache and test student login

## During Exam - Issues & Solutions

### Issue: Backend is slow/unresponsive
**Symptoms:** High latency, timeouts, 503 errors

**Actions:**
1. Check Cloud Run metrics: https://console.cloud.google.com/run
2. Scale up: `gcloud run services update YOUR-SERVICE --min-instances=5`
3. Check Upstash: https://console.upstash.com/
4. If Upstash is down: Set `RATE_LIMIT_ENABLED=false` and redeploy

### Issue: Students can't log in
**Symptoms:** 429 errors, "Too many attempts"

**Actions:**
1. Check if rate limits are too strict
2. Increase login limit: `RL_LOGIN_PER_SEC=500` and redeploy
3. Clear rate limit counters in Upstash console if necessary

### Issue: Firestore is slow
**Symptoms:** High read/write latency in Firebase console

**Actions:**
1. Check Firestore metrics: https://console.firebase.google.com/firestore
2. Verify no hot documents (shouldn't happen with this design)
3. Scale up Cloud Run instances (more caching)

### Issue: Need to extend exam time
**Actions:**
1. Admin panel → Edit hackathon → Increase duration
2. Students already started: deadline is already set (can't extend)
3. Alternative: Manually update in Firestore (risky, test first)

## Post-Exam Actions
- [ ] Verify all submissions recorded
- [ ] Export results CSV
- [ ] Run integrity checks
- [ ] Scale down: minInstances: 0
- [ ] Create final backup

## Rollback Procedure
If catastrophic failure during exam:

1. Stop incoming traffic:
   ```bash
   # Disable web app temporarily
   # Update Vercel env: NEXT_PUBLIC_API_BASE=https://maintenance.example.com
   ```

2. Restore from backup:
   ```bash
   gcloud firestore import gs://YOUR_PROJECT_ID-backups/LATEST_BACKUP
   ```

3. Notify students via email/SMS

4. Reschedule exam

## Contact Information
- Firebase Support: https://firebase.google.com/support
- Your admin email: admin@example.com
- Your phone: +1234567890
```

---

## Configuration Checklist

### Environment Variables

**Backend (`apps/api/.env.local` for local dev):**
```bash
PROCTOR_SECRET=your-jwt-secret-32-chars
PROCTOR_PEPPER=your-roll-hash-pepper-32-chars
PROCTOR_ADMIN_USER=admin
PROCTOR_ADMIN_PASS=your-secure-admin-password
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app,http://localhost:3000
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
```

**Frontend (`apps/web/.env.local`):**
```bash
NEXT_PUBLIC_API_BASE=https://your-backend.hosted.app
```

### Firebase Secrets (Production)

```bash
# Set all secrets
firebase apphosting:secrets:set PROCTOR_SECRET
firebase apphosting:secrets:set PROCTOR_PEPPER
firebase apphosting:secrets:set PROCTOR_ADMIN_USER
firebase apphosting:secrets:set PROCTOR_ADMIN_PASS
firebase apphosting:secrets:set UPSTASH_REDIS_REST_URL
firebase apphosting:secrets:set UPSTASH_REDIS_REST_TOKEN
firebase apphosting:secrets:set ALLOWED_ORIGINS

# Verify secrets are set
firebase apphosting:secrets:list
```

---

## Final Pre-Launch Checklist

### 1 Week Before
- [ ] Run load test with 2500 users for 1 hour
- [ ] Implement critical security fixes
- [ ] Set up automated backups
- [ ] Configure monitoring and alerts
- [ ] Test restore from backup
- [ ] Review emergency procedures

### 1 Day Before
- [ ] Create manual Firestore backup
- [ ] Test admin login and all functions
- [ ] Test student login flow end-to-end
- [ ] Verify Upstash is on paid tier
- [ ] Check Firebase billing limits
- [ ] Notify students of exam URL

### 1 Hour Before
- [ ] Set minInstances: 2 and deploy
- [ ] Verify health check is green
- [ ] Test one student login
- [ ] Have emergency procedures ready
- [ ] Monitor Cloud Run dashboard

### During Exam
- [ ] Keep Cloud Run dashboard open
- [ ] Monitor error rates
- [ ] Check admin Monitor tab (live counts)
- [ ] Be ready to scale up if needed

### After Exam
- [ ] Verify all submissions
- [ ] Run integrity checks
- [ ] Export results
- [ ] Scale down to minInstances: 0
- [ ] Review logs for issues

---

## Summary

Your system is **architecturally sound** and can handle 1000-2500 users. The main risks are:

1. **Not running the load test** - could reveal hidden bottlenecks
2. **No backups** - catastrophic if data loss occurs
3. **Admin password in plain text** - security vulnerability
4. **No monitoring** - blind during the exam

Implement the priorities above, run the load test, and you'll be production-ready! 🚀
