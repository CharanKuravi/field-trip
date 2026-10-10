# AWS Codeathon Proctoring System

A secure, scalable exam proctoring system built with Next.js and Firebase.

## 🏗️ Project Structure

```
proctor-next/
├── client/          → Frontend (Deployed on Netlify)
├── server/          → Backend REST API (Deployed on Render)
├── loadtest/        → Load testing scripts
├── AWS_100_QUESTIONS.csv
├── QUESTION_UPLOAD_TEMPLATE.csv
└── README.md
```

## 🚀 Live Deployment

- **Frontend**: https://aws-codeathon-proctor.netlify.app
- **Backend API**: https://proctor-api-r44r.onrender.com

## 🎯 Features

### For Participants
- ✅ One question at a time display
- ✅ Per-question timers (AWS: 15s, Aptitude: 27s)
- ✅ Auto-advance when timer expires or "Done" clicked
- ✅ Question locking after completion (can't go back)
- ✅ Two sections: AWS Questions (1-20) & Aptitude Questions (21-30)
- ✅ Real-time proctoring (fullscreen, tab switch detection)
- ✅ Automatic violation tracking

### For Admins (Hidden Access)
- ✅ Click black dot at bottom-right corner to access admin panel
- ✅ Create multiple hackathons/exams
- ✅ Bulk upload participants via CSV/Excel
- ✅ Bulk upload questions with subject tags (AWS/Aptitude)
- ✅ Generate unique question papers (20 AWS + 10 Aptitude per student)
- ✅ Real-time monitoring dashboard
- ✅ Export questions as CSV
- ✅ Revoke exam attempts for retakes
- ✅ View violations and auto-submission logs

## 📋 Question Upload Format

CSV with 8 columns: `text,optA,optB,optC,optD,correct_key,marks,subject`

Example:
```csv
What is AWS?,Option A,Option B,Option C,Option D,A,1,AWS
Math question?,10,20,30,40,C,1,Aptitude
```

## 🔧 Local Development

### Server (Backend)
```bash
cd server
cp .env.example .env.local
# Add your Firebase credentials to .env.local
npm install
npm run dev
# Runs on http://localhost:4000
```

### Client (Frontend)
```bash
cd client
cp .env.example .env.local
# Set NEXT_PUBLIC_API_BASE=http://localhost:4000
npm install
npm run dev
# Runs on http://localhost:3000
```

## 🔐 Environment Variables

### Server (.env.local)
- `FIREBASE_SERVICE_ACCOUNT` - Firebase admin SDK credentials (JSON)
- `PROCTOR_SECRET` - JWT signing key
- `PROCTOR_PEPPER` - Password hashing salt
- `PROCTOR_ADMIN_USER` - Admin username
- `PROCTOR_ADMIN_PASS` - Admin password
- `ALLOWED_ORIGINS` - Frontend URL for CORS

### Client (.env.local)
- `NEXT_PUBLIC_API_BASE` - Backend API URL

## 📊 Load Testing

```bash
cd loadtest
# Install locust: pip install locust
# Run test: locust -f locustfile.py --host=https://proctor-api-r44r.onrender.com
# Open http://localhost:8089 and configure test
```

## 🎨 UI Features

- AWS logo with "- Codeathon" branding
- White borders on all elements
- Orange top border on current question
- Color-coded question navigator:
  - 🟢 Green: Answer selected (not yet done)
  - 🔵 Blue: Completed and locked
  - 🟠 Orange: Current question
  - ⚪ White: Not answered
  - ⚪ Faded: Locked (future questions)

## 🛡️ Security Features

- Real-time proctoring with violation tracking
- Fullscreen enforcement
- Tab switch detection
- Auto-submission after max violations
- JWT-based authentication
- Rate limiting on API endpoints

## 📝 Admin Workflow

1. Access admin panel (click black dot at bottom-right)
2. Login with admin credentials
3. Create a hackathon
4. Upload participants (CSV/Excel)
5. Upload questions with subject tags
6. Set exam as "Open for participants"
7. Monitor live exam progress
8. Export results and violations

## 🎓 Exam Flow

1. Student logs in with email + roll number
2. Waits on instructions page until exam opens
3. Exam starts with Section 1 (AWS - 20 questions, 15s each)
4. Then Section 2 (Aptitude - 10 questions, 27s each)
5. Questions auto-advance or click "Done" button
6. Completed questions are locked (can't revisit)
7. Auto-submit when time expires or all questions done
8. After submission: shows violations count only (score hidden from participant)

## 📦 Deployment

### Backend (Render)
- Root directory: `server`
- Build command: `npm install`
- Start command: `npm run start`
- Add environment variables in Render dashboard

### Frontend (Netlify)
- Root directory: `client`
- Build command: `npm run build`
- Publish directory: `.next`
- Add environment variables in Netlify dashboard

## 📄 License

Built for AWS Codeathon at GIST
