import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldPath, FieldValue } from 'firebase-admin/firestore';

// On Firebase App Hosting / Cloud Run the runtime service account is picked up automatically.
// Locally: set FIREBASE_SERVICE_ACCOUNT to the service-account JSON (as one line).
const app = getApps()[0] || initializeApp(process.env.FIREBASE_SERVICE_ACCOUNT ? { credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) } : undefined);
export const db = getFirestore(app);
if (!globalThis.__fsConfigured) { db.settings({ ignoreUndefinedProperties: true }); globalThis.__fsConfigured = true; }

export { FieldPath, FieldValue };
export const P = db.collection('participants');   // doc id = email. One doc holds identity + live exam state + answers
export const H = db.collection('hackathons');     // hackathons/{hid}/questions/{qid}
export const EV = db.collection('events');        // violation / connection events
