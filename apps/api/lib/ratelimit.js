// Rate limiting with Upstash Redis. Serverless/Cloud Run instances share no memory, so the counters must live in a
// shared store; Firestore is the wrong tool (1 write/s per document, and a billed write per request).
// Fails OPEN: if Upstash is unreachable the exam must keep working (the `timeout` below makes calls resolve as allowed).
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { HttpError } from './http.js';

const on = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN && process.env.RATE_LIMIT_ENABLED !== 'false';
const num = (k, d) => Number(process.env[k]) || d;
let L = null;
function limiters() {
  if (!on) return null;
  if (L) return L;
  const redis = Redis.fromEnv();
  const mk = (name, n, win) => new Ratelimit({ redis, prefix: `rl:${name}`, limiter: Ratelimit.fixedWindow(n, win), timeout: 1500, analytics: false, ephemeralCache: new Map() });
  return (L = {
    loginGlobal: mk('login', num('RL_LOGIN_PER_SEC', 300), '1 s'),   // whole-system login throughput cap (smooths the "everyone logs in at once" spike)
    loginEmail: mk('lfe', 10, '5 m'),                                 // failed attempts per email
    loginIp: mk('lfi', 600, '5 m'),                                   // failed attempts per IP: loose, a college shares one NAT address
    adminFail: mk('afi', 8, '5 m'),                                   // failed admin logins per IP
    user: mk('user', num('RL_USER_PER_10S', 40), '10 s'),             // every exam call per participant (heartbeat ~1/10 s, answers a few/s at most)
    admin: mk('adm', num('RL_ADMIN_PER_MIN', 240), '1 m'),            // admin calls per IP
  });
}

const safe = async (fn, fallback) => { try { return await fn(); } catch (e) { console.warn('ratelimit unavailable, allowing request:', e?.message); return fallback; } };
const wait = (r) => Math.max(1, Math.ceil((r.reset - Date.now()) / 1000));
const busy = (r, code = 'busy') => new HttpError(429, 'Server is busy, please wait…', { code, retryAfter: wait(r) });

async function hit(name, id, code) {
  const l = limiters(); if (!l) return;
  const r = await safe(() => l[name].limit(id), { success: true });
  if (!r.success) throw busy(r, code);
}
export const limitLoginGlobal = () => hit('loginGlobal', 'all', 'busy');
export const limitUser = (email) => hit('user', email, 'busy');
export const limitAdmin = (ip) => hit('admin', ip, 'busy');

// Login lockout counts only FAILURES: check first (read-only), record after a wrong password.
async function remaining(name, id) {
  const l = limiters(); if (!l) return { remaining: 1, reset: 0 };
  const x = await safe(() => l[name].getRemaining(id), { remaining: 1, reset: 0 });
  return typeof x === 'number' ? { remaining: x, reset: Date.now() + 60000 } : x;      // v1 returned a number, v2 an object
}
export async function assertLoginAllowed(email, ip) {
  const [a, b] = await Promise.all([remaining('loginEmail', email), remaining('loginIp', ip)]);
  const blocked = a.remaining <= 0 ? a : b.remaining <= 0 ? b : null;
  if (blocked) throw new HttpError(429, 'Too many failed attempts. Wait a few minutes and try again.', { code: 'locked', retryAfter: wait(blocked) });
}
export async function recordLoginFailure(email, ip) {
  const l = limiters(); if (!l) return;
  await safe(() => Promise.all([l.loginEmail.limit(email), l.loginIp.limit(ip)]), null);
}
export async function assertAdminAllowed(ip) {
  const x = await remaining('adminFail', ip);
  if (x.remaining <= 0) throw new HttpError(429, 'Too many failed attempts. Wait a few minutes.', { code: 'locked', retryAfter: wait(x) });
}
export async function recordAdminFailure(ip) { const l = limiters(); if (l) await safe(() => l.adminFail.limit(ip), null); }
