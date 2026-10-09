# Netlify Deployment Guide

## ✅ Mobile-Friendly Updates Applied

The app is now fully responsive with:
- Smaller fonts on mobile (14px body, 22px headlines)
- Stacked layouts instead of rows
- Touch-friendly button sizes
- Optimized graph-paper grid for smaller screens
- Smaller orange blob gradients on mobile
- Full-width buttons and inputs
- Reduced padding for more screen space

## 🚀 Deploy to Netlify

### Option A: Deploy via Netlify UI (Recommended)

1. **Push to GitHub**
   ```bash
   cd apps/web
   git init
   git add .
   git commit -m "AWS Codeathon web app ready for Netlify"
   git branch -M main
   git remote add origin https://github.com/CharanKuravi/field-trip.git
   git push -u origin main --force
   ```

2. **Connect to Netlify**
   - Go to https://app.netlify.com
   - Click "Add new site" → "Import an existing project"
   - Choose "GitHub" and authorize
   - Select your repository: `CharanKuravi/field-trip`
   - Branch: `main`

3. **Configure Build Settings**
   - **Base directory**: `apps/web`
   - **Build command**: `npm run build`
   - **Publish directory**: `.next`
   - **Node version**: 20

4. **Add Environment Variables**
   Click "Add environment variables":
   ```
   NEXT_PUBLIC_API_BASE=http://localhost:4000
   ```
   (Update this to your API URL once deployed)

5. **Deploy**
   - Click "Deploy site"
   - Wait 2-3 minutes for build
   - Your site will be live at: `https://random-name.netlify.app`

### Option B: Deploy via Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Navigate to web app
cd apps/web

# Initialize Netlify
netlify init

# Follow prompts:
# - Create & configure a new site
# - Team: Your team
# - Site name: aws-codeathon-gist (or your choice)
# - Build command: npm run build
# - Publish directory: .next

# Deploy
netlify deploy --prod
```

## 📱 Mobile Testing Checklist

Before going live, test on:
- [ ] iPhone (Safari)
- [ ] Android (Chrome)
- [ ] iPad (Safari)
- [ ] Small screen (320px width)
- [ ] Medium screen (768px width)

## 🔧 Post-Deployment Steps

### 1. Update API URL
Once your API is deployed to Firebase App Hosting:

**In Netlify Dashboard:**
- Site settings → Environment variables
- Update `NEXT_PUBLIC_API_BASE` to your API URL:
  ```
  https://YOUR-API-ID.REGION.hosted.app
  ```

### 2. Configure Custom Domain (Optional)
- Domain settings → Add custom domain
- Add DNS records as instructed
- Enable HTTPS (automatic with Netlify)

### 3. Set Redirects
Already configured in `netlify.toml`:
- All routes go through Next.js
- 404s handled by Next.js

### 4. Enable Forms (If needed later)
- Netlify automatically detects forms
- Add `netlify` attribute to forms

## 🎯 Current Configuration

### Files Created:
- ✅ `apps/web/netlify.toml` - Netlify build config
- ✅ `apps/web/.gitignore` - Ignore build artifacts
- ✅ Mobile CSS in `globals.css`

### Package.json Scripts:
```json
{
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start"
  }
}
```

### Build Settings:
- **Framework**: Next.js
- **Node Version**: 20
- **Build Command**: `npm run build`
- **Publish Directory**: `.next`
- **Functions**: Serverless with @netlify/plugin-nextjs

## 🐛 Troubleshooting

### Build Fails
1. Check Node version is 20+
2. Ensure all dependencies are in package.json
3. Check build logs for specific errors

### Blank Page After Deploy
1. Check browser console for errors
2. Verify `NEXT_PUBLIC_API_BASE` is set correctly
3. Ensure API has CORS enabled for your Netlify domain

### Images Not Loading
- Using external AWS logo URL (should work)
- If issues, download logo and add to `public/` folder

### API Connection Failed
1. Update `NEXT_PUBLIC_API_BASE` environment variable
2. Add Netlify domain to API's `ALLOWED_ORIGINS`
3. Redeploy both sites

## 🔐 Security Notes

- Never commit `.env.local` files
- Store secrets in Netlify environment variables
- Enable HTTPS (automatic on Netlify)
- Set proper CORS origins in API

## 📊 Performance Tips

- Netlify CDN is automatic
- Images from external URL (AWS logo)
- Google Fonts cached by browsers
- CSS is minified by Next.js
- JavaScript is bundled and optimized

## 🎨 Mobile Breakpoint: 640px

Below 640px, the app switches to mobile layout:
- Single column forms
- Stacked buttons
- Full-width inputs
- Smaller font sizes
- Reduced padding
- Touch-friendly tap targets

## 🚀 Quick Deploy Commands

```bash
# From project root
cd apps/web

# Install dependencies
npm install

# Test build locally
npm run build

# Test locally
npm start

# Deploy to Netlify
netlify deploy --prod
```

## 📱 Live URLs (After Deployment)

- **Frontend**: `https://your-site-name.netlify.app`
- **API**: Update this after Firebase App Hosting deployment
- **Admin Panel**: `https://your-site-name.netlify.app` (same URL, different login)

## ✅ Ready to Deploy!

Everything is configured. Just push to GitHub and connect to Netlify!
