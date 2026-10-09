# Firebase App Hosting Deployment Guide (API Backend)

## Prerequisites
1. Firebase CLI installed: `npm install -g firebase-tools`
2. Firebase project: `trail-b0f43` (already configured)
3. Billing enabled on Firebase (required for App Hosting)

## Step 1: Install Firebase CLI
```bash
npm install -g firebase-tools
```

## Step 2: Login to Firebase
```bash
firebase login
```

## Step 3: Initialize App Hosting (from proctor-next root)
```bash
cd c:\Users\kchar\OneDrive\Desktop\cyber_security_tech-fixed\cyber_security_tech-main\proctor-next
firebase init apphosting
```

**Select:**
- Use existing project: `trail-b0f43`
- Root directory: `apps/api`
- GitHub repo: `CharanKuravi/field-trip`
- Branch: `main`

## Step 4: Configure apphosting.yaml (already exists in apps/api/)
The file `apps/api/apphosting.yaml` is already configured:

```yaml
runConfig:
  runCommand: npm run start
env:
  - variable: NODE_ENV
    value: production
    availability:
      - BUILD
      - RUNTIME
```

## Step 5: Add Environment Variables in Firebase Console
Go to: https://console.firebase.google.com/project/trail-b0f43/apphosting

Add these environment variables:
- `PROCTOR_SECRET` - Your secret key
- `PROCTOR_PEPPER` - Your pepper key
- `PROCTOR_ADMIN_USER` - admin
- `PROCTOR_ADMIN_PASS` - admin123
- `RATE_LIMIT_ENABLED` - true
- `NODE_ENV` - production

## Step 6: Deploy
```bash
firebase apphosting:backends:create api-backend \
  --project trail-b0f43 \
  --location us-central1 \
  --root-directory apps/api
```

## Step 7: Get Your API URL
After deployment, Firebase will give you a URL like:
```
https://api-backend-<hash>.us-central1.firebase.app
```

## Step 8: Update Frontend Environment Variable
Update `apps/web/.env.local`:
```
NEXT_PUBLIC_API_URL=https://api-backend-<hash>.us-central1.firebase.app
```

Then redeploy the frontend to Netlify.

## Monitoring & Logs
View logs at: https://console.firebase.google.com/project/trail-b0f43/apphosting

---

## Alternative: Deploy API to Render.com (FREE & EASIER)

If Firebase billing is an issue, use **Render.com** (has a generous free tier):

### Render.com Deployment (FREE):

1. Go to https://render.com
2. Sign up with GitHub
3. Click **"New +"** → **"Web Service"**
4. Connect repo: `CharanKuravi/field-trip`
5. Configure:
   - **Name**: `proctor-api`
   - **Root Directory**: `apps/api`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run start`
   - **Instance Type**: `Free`

6. Add Environment Variables:
   - `PROCTOR_SECRET`
   - `PROCTOR_PEPPER`
   - `PROCTOR_ADMIN_USER`
   - `PROCTOR_ADMIN_PASS`
   - `RATE_LIMIT_ENABLED=true`
   - `NODE_ENV=production`

7. Click **"Create Web Service"**

8. You'll get URL like: `https://proctor-api.onrender.com`

9. Update frontend env: `NEXT_PUBLIC_API_URL=https://proctor-api.onrender.com`

**Note:** Render free tier sleeps after 15 minutes of inactivity. First request takes ~30 seconds to wake up.

---

## Recommended Deployment Architecture:

```
┌─────────────────────────────────────────┐
│  Frontend (Netlify)                     │
│  apps/web                               │
│  https://your-site.netlify.app          │
└──────────────┬──────────────────────────┘
               │ API calls
               ▼
┌─────────────────────────────────────────┐
│  Backend API (Render/Firebase)          │
│  apps/api                               │
│  https://proctor-api.onrender.com       │
└──────────────┬──────────────────────────┘
               │ Database
               ▼
┌─────────────────────────────────────────┐
│  Firebase Firestore                     │
│  Project: trail-b0f43                   │
└─────────────────────────────────────────┘
```

## Cost Summary:
- **Frontend (Netlify)**: FREE (up to 100GB bandwidth)
- **Backend (Render.com)**: FREE (sleeps after 15min inactivity)
- **Backend (Firebase App Hosting)**: ~$0.10/day if always running
- **Firestore**: FREE (up to 50K reads/day, 20K writes/day)

## Recommendation:
Use **Render.com for FREE** or **Firebase App Hosting if you need always-on**.
