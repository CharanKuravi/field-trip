# How to Scale to 2,000 Logins Per Second

## Current Capacity: ~300 logins/second

**Reality Check**: Your system is configured for **300 logins/second**, not 2,000.

But here's the thing: **you probably don't need instant 2,000/sec capacity!**

---

## Option A: Keep the Queue (Recommended) 💡

### What happens now with 2,000 students:
- They all log in successfully ✅
- Takes **10-60 seconds total** instead of instant
- Students see: *"Server is busy – you are in the queue…"*
- Browser automatically retries - no action needed
- **Cost**: Very low
- **Reliability**: Battle-tested

### Why this is fine for exams:
- Students expect to wait a few seconds at exam start
- No one is locked out or rejected
- Much more cost-effective
- Proven approach (see ARCHITECTURE.md)

### To improve queue experience:
1. Tell students to log in **15-30 minutes early**
2. Show a waiting room (page already supports this)
3. Open exam at scheduled time - everyone's already in

**Verdict**: If this works for your use case, stop here. No changes needed.

---

## Option B: True 2,000/Second Capacity 🚀

If you absolutely need instant capacity, here's what to change:

### Step 1: Update apphosting.yaml

```yaml
runConfig:
  cpu: 2
  memoryMiB: 1024
  concurrency: 80
  minInstances: 30          # 👈 UP FROM 2 - keep 30 instances always warm
  maxInstances: 50          # 👈 UP FROM 10 - allow bursts to 50

env:
  - variable: RL_LOGIN_PER_SEC
    value: "2500"            # 👈 UP FROM 300 - allow 2500 logins/sec
    availability: [RUNTIME]
```

**Cost Impact**: 
- 30 warm instances 24/7 = ~$150-300/month when idle
- Set `minInstances: 0` after your event!

---

### Step 2: Upgrade Upstash Redis

**Current**: Free tier (10k commands/day)  
**Need**: Pay-as-you-go or fixed plan

**Math**:
- Each login = 3 Redis commands
- 2,000 logins/sec = 6,000 commands/sec
- 1-hour exam = 21.6 million commands

**Options**:
1. **Pay-as-you-go**: $0.20 per 100k commands = ~$43/hour
2. **Pro 10M**: $320/month (10M commands/day)

**How to upgrade**:
1. Go to [console.upstash.com](https://console.upstash.com)
2. Select your Redis instance
3. Upgrade to Pro or enable pay-as-you-go

---

### Step 3: Handle Firestore Write Limits

**Problem**: Firestore prefers gradual ramps  
**Your spike**: 0 → 2,000 writes/second instantly

**Solutions**:

#### Option 3A: Pre-warm Firestore (Recommended)
Run a practice session 30 minutes before:
```bash
# Use loadtest/locustfile.py
locust -f loadtest/locustfile.py --users 2000 --spawn-rate 100
```

This gradually ramps writes: 500 → 1,000 → 1,500 → 2,000/sec

#### Option 3B: Remove login writes (Advanced)
Stop writing session ID at login. Trade-off:
- ✅ No write spike
- ❌ Lose "newer login signs out older one" feature

Edit `apps/api/lib/exam.js`:
```javascript
// Comment this line in login():
// await P.doc(email).update({ sid });
```

---

### Step 4: Test Before Go-Live

**CRITICAL**: You MUST load test before the actual event.

#### Generate test users:
```bash
cd loadtest
python make_csv.py --count 2500 --output users.csv
```

#### Upload to admin panel:
- Login as admin
- Go to Participants tab
- Upload `users.csv`

#### Run load test:
```bash
# Install locust: pip install locust
locust -f locustfile.py \
  --users 2000 \
  --spawn-rate 2000 \
  --host https://YOUR-API.REGION.hosted.app
```

#### Watch for:
- ✅ **Success rate** > 99%
- ✅ **p95 latency** < 5 seconds
- ❌ **429 errors** (rate limit hit - raise RL_LOGIN_PER_SEC)
- ❌ **500 errors** (server overload - raise maxInstances)
- ❌ **Firestore errors** (write spike - use pre-warm)

---

## Cost Breakdown for Option B

### One-time (Event Day):
| Item | Cost | Duration |
|------|------|----------|
| 30 warm instances | ~$5 | 4 hours |
| 50 burst instances | ~$3 | 30 min peak |
| Upstash Redis | ~$43 | 1 hour exam |
| Firestore operations | ~$3 | 2.5M reads + 2.5M writes |
| **Total** | **~$54** | **Per event** |

### Monthly (if left running):
| Item | Cost |
|------|------|
| 30 instances 24/7 | $150-300 |
| Upstash Pro | $320 |
| **Total** | **$470-620/month** |

**Important**: Set `minInstances: 0` after each event!

---

## Real-World Recommendation 💼

### For Most Exams:
**Option A** (Keep the queue)
- Zero configuration changes
- Costs pennies
- Students wait 30-60 seconds max
- Proven reliable

### For High-Stakes/Time-Critical:
**Option B** (True 2,000/sec)
- Required changes: All 4 steps above
- Cost: ~$54 per event
- Load test 1 week before
- Monitor during exam

### For 2,500+ Students:
Use **Option A** + early login:
1. Open login 30 min before exam
2. Show waiting room
3. Everyone queues naturally
4. Open exam at scheduled time
5. Zero configuration needed

---

## Current Status: Option A

Your system is currently configured for **Option A** (queue-based). This is:
- ✅ Stable
- ✅ Cost-effective  
- ✅ Proven approach
- ⏱️ 10-60 second login spread for 2,000 students

**To move to Option B**: Follow all 4 steps above + load test

---

## Quick Decision Matrix

| Your Situation | Recommendation |
|----------------|----------------|
| "2,000 students need to START exam instantly" | Option B (full upgrade) |
| "2,000 students can log in over 1 minute" | Option A (no changes) |
| "Students can arrive 30 min early" | Option A (no changes) |
| "Budget is tight" | Option A (no changes) |
| "This is high-stakes certification" | Option B + load test |

---

## Questions to Ask Yourself

1. **Do students NEED instant login, or is 30-60 seconds OK?**  
   → If 30-60s is fine: **Option A**

2. **Can students log in 15-30 minutes before exam starts?**  
   → If yes: **Option A with waiting room**

3. **Do you have $50-100 budget per exam for infrastructure?**  
   → If no: **Option A**

4. **Will you load test 1 week before?**  
   → If no: **Don't attempt Option B**

---

## Bottom Line

**Your system works great for 2,000 students** - they just won't all log in in the exact same second. 

**The architecture document says**: *"2,500 students logging in within roughly 10-60 seconds: the login limiter admits ~300/s and the browser queues the rest automatically."*

This is **intentional design**, not a limitation to fix.

Only upgrade to Option B if you have a specific business requirement for instant capacity and the budget to match.
