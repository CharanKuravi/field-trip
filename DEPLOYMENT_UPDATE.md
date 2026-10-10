# 🚨 IMPORTANT: Update Deployment Settings

The folder structure has been reorganized. You need to update the deployment settings:

## Netlify (Frontend)

1. Go to: https://app.netlify.com
2. Select your site: `aws-codeathon-proctor`
3. Go to **Site settings** → **Build & deploy** → **Continuous deployment**
4. Click **Edit settings**
5. Change **Base directory** from `apps/web` to **`client`**
6. Save and **Trigger deploy**

## Render (Backend)

1. Go to: https://dashboard.render.com
2. Select your service: `proctor-api`
3. Go to **Settings**
4. Scroll to **Build & Deploy**
5. Change **Root Directory** from `apps/api` to **`server`**
6. Click **Save Changes**
7. Render will automatically redeploy

## Verify

After both deployments complete:
- Frontend: https://aws-codeathon-proctor.netlify.app ✅
- Backend: https://proctor-api-r44r.onrender.com ✅

Both should work as before!
