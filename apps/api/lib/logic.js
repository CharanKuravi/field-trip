// Pure functions: no Firebase / network, so they are unit-tested (npm test) without any services.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const EMAIL_RE = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;       // '/' is banned: the email is used as a Firestore document ID
export const normEmail = (s) => String(s ?? '').trim().toLowerCase();
export const normRoll = (s) => String(s ?? '').replace(/\s+/g, '').toUpperCase();   // case- and space-insensitive

// HMAC-SHA256(pepper, "email:roll"). Microseconds per login (a slow KDF would pin the CPU during a login rush).
// Roll numbers are low-entropy anyway, so the real protection is the secret pepper + rate limiting.
export const hashRoll = (email, roll, pepper) => createHmac('sha256', pepper).update(`${email}:${roll}`).digest('hex');
export function checkRoll(email, roll, pepper, stored) {
  const a = Buffer.from(hashRoll(email, roll, pepper)), b = Buffer.from(String(stored ?? ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── deterministic shuffle (same seed -> same order, so a refresh never re-orders the paper) ──
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function seededShuffle(arr, seed) {
  const rnd = mulberry32(xmur3(String(seed))()), a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const sortQuestions = (qs) => [...qs].sort((x, y) => (x.order ?? 0) - (y.order ?? 0) || (x.id < y.id ? -1 : 1));

/** Per-participant paper. The correct answer is never included. Options keep their ORIGINAL letter as `key`,
 *  so shuffling can never break grading. */
export function buildView(qs, hid, pid, shuffle) {
  const list = shuffle ? seededShuffle(qs, `${pid}-${hid}`) : qs;
  return list.map((q) => {
    let opts = ['A', 'B', 'C', 'D'].map((k) => ({ key: k, text: q[k.toLowerCase()] }));
    if (shuffle) opts = seededShuffle(opts, `${pid}-${q.id}`);
    return { id: q.id, text: q.text, marks: q.marks, options: opts };
  });
}

export const flatAnswers = (answers) => Object.fromEntries(Object.entries(answers || {}).map(([q, v]) => [q, v?.s ?? null]));

export function grade(qs, answers, negative) {
  let score = 0, total = 0;
  for (const q of qs) {
    total += q.marks; const sel = answers[q.id];
    if (sel === q.correct) score += q.marks; else if (sel) score -= negative || 0;
  }
  return { score: Math.max(0, score), total };
}

// ── uploads ──
export const normHeader = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const cell = (v) => (v == null ? '' : typeof v === 'number' ? String(v) : v instanceof Date ? v.toISOString() : String(v).trim());
export function gridToRows(grid) {
  if (!grid.length) return [];
  const head = grid[0].map(normHeader);
  return grid.slice(1).map((r) => r.map(cell)).filter((r) => r.some(Boolean))
    .map((r) => Object.fromEntries(head.map((k, i) => [k, r[i] ?? ''])));
}
export const HDR = {
  email: ['email', 'emailid', 'emailaddress', 'mail', 'username'],
  roll: ['rollnumber', 'rollno', 'roll', 'rollnum', 'registrationnumber', 'regno'],
  name: ['name', 'fullname', 'studentname'],
};
export const pick = (row, names) => { for (const k of names) if (row[k]) return row[k]; return ''; };

export function csvEscape(v) { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

// ── post-exam collusion hints (hints, not proof) ──
export function computeIntegrity(ps, correct) {
  const label = (p) => `${p.email} ${p.name}`;
  const byIp = {}, wrong = {}, fast = [], done = [];
  for (const p of ps) {
    if (p.ip) (byIp[p.ip] ||= []).push(label(p));
    const rows = Object.entries(p.answers || {}).filter(([q, v]) => v?.s && q in correct).map(([q, v]) => ({ q, s: v.s, t: v.t || 0 })).sort((a, b) => a.t - b.t);
    wrong[p.email] = Object.fromEntries(rows.filter((x) => x.s !== correct[x.q]).map((x) => [x.q, x.s]));
    if (p.submittedAt) done.push(p);
    if (p.startedAt && rows.length >= 5) {
      const marks = [p.startedAt, ...rows.map((x) => x.t)];
      const quick = rows.reduce((n, _, i) => n + (marks[i + 1] - marks[i] < 2000 ? 1 : 0), 0);
      if (quick / rows.length >= 0.5) fast.push({ who: label(p), quick, of: rows.length });
    }
  }
  const sim = [];
  for (let i = 0; i < done.length; i++) {
    const a = wrong[done[i].email], ak = Object.keys(a); if (ak.length < 3) continue;
    for (let j = i + 1; j < done.length; j++) {
      const b = wrong[done[j].email]; let same = 0;
      for (const q of ak) if (b[q] !== undefined && b[q] === a[q]) same++;
      const lo = Math.min(ak.length, Object.keys(b).length);
      if (same >= 3 && lo && same / lo >= 0.7) sim.push({ a: label(done[i]), b: label(done[j]), shared_wrong: same, of: lo });
    }
  }
  return { shared_ip: Object.entries(byIp).filter(([, v]) => v.length > 1).map(([ip, participants]) => ({ ip, participants })),
    fast_answers: fast, similar_wrong_answers: sim.slice(0, 500) };
}
