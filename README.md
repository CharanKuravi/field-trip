# Proctor Tool - Next.js on Vercel + Firebase

```
 students / admin ──> Vercel (apps/web, Next.js, static pages on a CDN)
        │
        └── fetch (Bearer token, CORS) ──> Firebase App Hosting (apps/api, Next.js route handlers on Cloud Run)
                                                 ├── Firestore            all data (one document per participant)
                                                 └── Upstash Redis        rate-limit counters only (shared across instances)
```
Participants sign in with **email (username) + roll number (password)**. Admin adds them one by one or uploads **.xlsx / .csv**.
Everything is Next.js (App Router, JavaScript). `apps/web` = frontend, `apps/api` = backend.

## One-time setup (about 30-40 minutes)

### 1. Firebase (backend + database)
1. console.firebase.google.com → create a project → upgrade to the **Blaze (pay-as-you-go)** plan (App Hosting needs it; a 2,500-user event costs a few dollars - see ARCHITECTURE.md).
2. **Build → Firestore Database → Create database** (production mode). Pick a region close to your students, e.g. `asia-south1` (Mumbai) for India. The region cannot be changed later.
3. Deploy the rules + index: `npm i -g firebase-tools && firebase login && firebase use YOUR_PROJECT && firebase deploy --only firestore`
   (rules block all browser access; the index powers the violation log).
4. **Build → App Hosting → Get started**: connect your GitHub repo, set **root directory = `apps/api`**, same region as Firestore.
5. Create the secrets (each prompts for a value; generate with `openssl rand -hex 32`):
   ```bash
   firebase apphosting:secrets:set PROCTOR_SECRET        # JWT signing key
   firebase apphosting:secrets:set PROCTOR_PEPPER        # roll-number hash key - NEVER change after go-live
   firebase apphosting:secrets:set PROCTOR_ADMIN_USER
   firebase apphosting:secrets:set PROCTOR_ADMIN_PASS
   firebase apphosting:secrets:set UPSTASH_REDIS_REST_URL
   firebase apphosting:secrets:set UPSTASH_REDIS_REST_TOKEN
   ```
6. Edit `apps/api/apphosting.yaml`: set `ALLOWED_ORIGINS` to your Vercel URL, commit, push → App Hosting builds and gives you a URL like `https://proctor-api--YOUR-PROJECT.REGION.hosted.app`.

### 2. Upstash (rate limiting)
console.upstash.com → **Create Redis database** (Regional, same area as your backend) → copy the *REST URL* and *REST TOKEN* into the two secrets above.
The free tier is too small for an event (10k commands/day); use pay-as-you-go for the event day.

### 3. Vercel (frontend)
Import the repo → **Root Directory = `apps/web`** → add env var `NEXT_PUBLIC_API_BASE` = your App Hosting URL → Deploy. Then put the final Vercel URL into `ALLOWED_ORIGINS` (step 1.6) and redeploy the API.
Vercel serves static pages only, so the free Hobby plan is enough technically (Vercel's terms limit Hobby to non-commercial use).

## Local development
```bash
cd apps/api && cp .env.example .env.local && npm i && npm run dev      # http://localhost:4000  (needs a Firebase service-account JSON in FIREBASE_SERVICE_ACCOUNT)
cd apps/web && cp .env.example .env.local && npm i && npm run dev      # http://localhost:3000   (NEXT_PUBLIC_API_BASE=http://localhost:4000)
cd apps/api && npm test                                                # grading / shuffle / upload-parsing unit tests (no services needed)
```

## Admin flow
1. **+ Hackathon** → Settings. Leave *Open* unticked. 2. **Participants** (add / upload Excel or CSV) and **Questions**.
3. Students log in early and wait on the instructions page (it unlocks by itself). 4. Tick **Open for participants**.
5. **Monitor** shows live counts, search/filter, paging, violation log, CSV export. **Integrity** after the exam.
Tip: keep the Monitor tab open during the exam - it also auto-submits anyone whose timer ran out and who closed their browser.

## Before the event
Run `loadtest/locustfile.py` (see its header) against the deployed API with 2,500 simulated students. Don't skip this.
Set `minInstances` back to 0 afterwards. Use HTTPS only (Vercel and App Hosting both are) - fullscreen lock and second-monitor detection need it.
