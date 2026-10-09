# Complete Deployment Guide - AWS Codeathon 2K26 Proctor System

## 🎯 Deployment Architecture

You CANNOT deploy both frontend and backend on Vercel. Here's the recommended architecture:

```
┌──────────────────────────────────────┐
│  FRONTEND (Netlify) - FREE           │
│  apps/web                            │
│  React/Next.js                       │
│  https://your-site.netlify.app       │
└───────────┬──────────────────────────┘
            │ API Calls (HTTP)
            ▼
┌──────────────────────────────────────┐
│  BACKEND API (Choose One)            │
│  Option 1: Render.com - FREE ⭐       │
│  Option 2: Firebase - ~$3/month      │
│  apps/api                            │
│  Node.js + Express                   │
└───────────┬──────────────────────────┘
            │ Database Operations
            ▼
┌──────────────────────────────────────┐
│  FIREBASE FIRESTORE - FREE           │
│  Project: trail-b0f43                │
│  NoSQL Database                      │
└──────────────────────────────────────┘
```

---

## 📋 Deployment Steps (In Order)

### **STEP 1: Deploy Backend API First** 🔴 IMPORTANT

Choose ONE option below:

#### **Option A: Render.com (Recommended - FREE)** ⭐

**Pros:**
- ✅ Completely FREE (with sleep after 15min inactivity)
- ✅ Easy setup (5 minutes)
- ✅ No billing required
- ✅ 512MB RAM, enough for your API
- ✅ Auto-deploys from GitHub

**Cons:**
- ⚠️ Sleeps after 15 minutes of inactivity (first request takes ~30 seconds to wake up)

**Deployment Steps:**

1. Go to https://render.com and sign up with GitHub
2. Click **"New +"** → **"Web Service"**
3. Select repository: `CharanKuravi/field-trip`
4. Configure:
   - **Name**: `proctor-api`
   - **Root Directory**: `apps/api`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run start`
   - **Instance Type**: `Free`

5. Add Environment Variables (click "Advanced" → "Add Environment Variable"):
   ```
   PROCTOR_SECRET=your-secret-key-here
   PROCTOR_PEPPER=your-pepper-key-here
   PROCTOR_ADMIN_USER=admin
   PROCTOR_ADMIN_PASS=admin123
   RATE_LIMIT_ENABLED=true
   NODE_ENV=production
   ```

6. Click **"Create Web Service"**
7. Wait 5-10 minutes for deployment
8. **Copy your API URL**: `https://proctor-api.onrender.com`

---

#### **Option B: Firebase App Hosting ($3-5/month)**

**Pros:**
- ✅ Always on (no sleep)
- ✅ Integrated with existing Firebase
- ✅ Excellent performance
- ✅ Auto-scaling

**Cons:**
- ⚠️ Requires billing enabled (~$3-5/month)
- ⚠️ More complex setup

**Deployment Steps:**

See detailed guide in `FIREBASE_API_DEPLOYMENT.md`

---

### **STEP 2: Deploy Frontend to Netlify** 🟢

1. **Go to Netlify**
   - Visit https://app.netlify.com
   - Sign up/login with GitHub

2. **Import Repository**
   - Click **"Add new site"** → **"Import an existing project"**
   - Choose **GitHub**
   - Select repository: `CharanKuravi/field-trip`
   - Branch: `main`

3. **Configure Build Settings**
   ```
   Base directory: apps/web
   Build command: npm run build
   Publish directory: .next
   ```

4. **Add Environment Variable**
   Click **"Add environment variables"**:
   ```
   NEXT_PUBLIC_API_URL=https://proctor-api.onrender.com
   ```
   *(Use YOUR API URL from Step 1)*

5. **Deploy**
   - Click **"Deploy site"**
   - Wait 2-3 minutes
   - Site will be live at: `https://random-name-12345.netlify.app`

6. **Optional: Custom Domain**
   - Go to **Domain settings**
   - Add your custom domain
   - Follow DNS instructions

---

## 🔑 Environment Variables Needed

### Backend API (Render/Firebase):
```env
PROCTOR_SECRET=<generate-random-32-char-string>
PROCTOR_PEPPER=<generate-random-32-char-string>
PROCTOR_ADMIN_USER=admin
PROCTOR_ADMIN_PASS=admin123
RATE_LIMIT_ENABLED=true
NODE_ENV=production
```

### Frontend (Netlify):
```env
NEXT_PUBLIC_API_URL=https://proctor-api.onrender.com
```

**Generate secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 💰 Cost Breakdown

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| **Frontend (Netlify)** | Free | $0 |
| **Backend (Render)** | Free (with sleep) | $0 |
| **Backend (Firebase)** | Always-on | ~$3-5 |
| **Firestore** | Free tier | $0 (up to 50K reads/day) |
| **Total (Render)** | | **$0** 🎉 |
| **Total (Firebase)** | | **$3-5** |

---

## 🧪 Testing After Deployment

### 1. Test Frontend
- Visit your Netlify URL
- Should see AWS Codeathon theme
- Login page should load

### 2. Test API Connection
- Click "Admin Login"
- Enter credentials: `admin` / `admin123`
- If login works → API connected! ✅
- If "Network Error" → Check environment variable

### 3. Test Full Flow
1. Login as admin
2. Create a hackathon
3. Upload participants (use test CSV)
4. Upload questions (use `AWS_100_QUESTIONS.csv`)
5. Mark hackathon as "Open"
6. Test participant login

---

## 🐛 Troubleshooting

### Frontend shows "Network Error"
1. Check `NEXT_PUBLIC_API_URL` environment variable
2. Make sure URL doesn't end with `/`
3. Redeploy frontend after fixing

### API returns 500 errors
1. Check Render logs: https://dashboard.render.com
2. Verify all environment variables are set
3. Check Firebase connection (trail-b0f43)

### Render API is sleeping
- Normal behavior on free tier
- First request takes 30-45 seconds
- Consider Firebase if always-on is needed

### Admin login fails
1. Check `PROCTOR_ADMIN_USER` and `PROCTOR_ADMIN_PASS`
2. Verify secret keys are set correctly
3. Check API logs for errors

---

## 🎯 Recommended Choice

**For Production/Hackathon:** Use **Render.com FREE tier**
- Completely free
- Good enough for exam use
- Just tell participants the first page load might take 30 seconds
- Once awake, stays fast for 15 minutes

**For Always-On Experience:** Use **Firebase App Hosting**
- No sleep time
- Instant response always
- Worth $3-5/month if budget allows

---

## 📚 Additional Resources

- **Netlify Docs**: https://docs.netlify.com
- **Render Docs**: https://render.com/docs
- **Firebase Docs**: https://firebase.google.com/docs/hosting
- **Next.js Deployment**: https://nextjs.org/docs/deployment

---

## ✅ Quick Deployment Checklist

- [ ] Push latest code to GitHub
- [ ] Deploy Backend API (Render or Firebase)
- [ ] Copy API URL
- [ ] Deploy Frontend to Netlify
- [ ] Add `NEXT_PUBLIC_API_URL` environment variable
- [ ] Test admin login
- [ ] Upload test questions
- [ ] Upload test participants
- [ ] Test participant exam flow
- [ ] Share site URL with participants!

---

## 🚀 You're Ready!

Follow the steps above and you'll have a fully deployed exam proctoring system in ~15 minutes!

**Questions?** Check the logs:
- Netlify: Site dashboard → Deploys → View logs
- Render: Dashboard → Service → Logs tab
- Firebase: Console → App Hosting → Logs
