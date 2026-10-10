// Pure functions: no Firebase / network, so they are unit-tested (npm test) without any services.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const EMAIL_RE = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;       // '/' is banned: the email is used as a Firestore document ID
export const USERNAME_RE = /^[a-zA-Z0-9._@\s-]{3,50}$/;          // Username: alphanumeric, dots, underscores, @, spaces, hyphens (3-50 chars)
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

export const DEFAULT_PAPER_SIZE = 30;   // questions each participant gets (0 = the whole pool)
export const paperSize = (h) => { const n = Number(h?.questions_per_participant); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_PAPER_SIZE; };

/** The questions ONE participant is given: picks questions by subject, then random order.
 *  For AWS Codeathon: 20 AWS + 10 Aptitude questions.
 *  Seeded by participant + hackathon, so refresh / re-login returns the SAME paper. */
export function paperFor(qs, hid, pid, shuffle, size = DEFAULT_PAPER_SIZE) {
  // Group questions by subject
  const bySubject = {};
  qs.forEach(q => {
    const subj = (q.subject || 'general').toLowerCase();
    if (!bySubject[subj]) bySubject[subj] = [];
    bySubject[subj].push(q);
  });
  
  // Pick questions by subject: 20 AWS + 10 Aptitude
  const aws = bySubject['aws'] || [];
  const aptitude = bySubject['aptitude'] || bySubject['apti'] || [];
  
  let selected = [];
  
  // Shuffle each subject pool independently
  const shuffledAws = shuffle ? seededShuffle(aws, `${pid}-${hid}-aws`) : aws;
  const shuffledApti = shuffle ? seededShuffle(aptitude, `${pid}-${hid}-apti`) : aptitude;
  
  // Pick 20 AWS questions
  selected = selected.concat(shuffledAws.slice(0, 20));
  
  // Pick 10 Aptitude questions  
  selected = selected.concat(shuffledApti.slice(0, 10));
  
  // If we don't have enough questions in specific subjects, fall back to any remaining
  if (selected.length < size && size > 0) {
    const remaining = qs.filter(q => !selected.includes(q));
    const shuffledRemaining = shuffle ? seededShuffle(remaining, `${pid}-${hid}-extra`) : remaining;
    selected = selected.concat(shuffledRemaining.slice(0, size - selected.length));
  }
  
  // Final shuffle of all selected questions for random order in the paper
  return shuffle ? seededShuffle(selected, `${pid}-${hid}-final`) : selected;
}

export function buildView(qs, hid, pid, shuffle, size = DEFAULT_PAPER_SIZE) {
  return paperFor(qs, hid, pid, shuffle, size).map((q) => {
    // Keep options in original order (A, B, C, D) - DO NOT shuffle
    let opts = ['A', 'B', 'C', 'D'].map((k) => ({ key: k, text: q[k.toLowerCase()] }));
    // Option shuffling disabled to prevent evaluation errors
    // if (shuffle) opts = seededShuffle(opts, `${pid}-${q.id}`);
    return { id: q.id, text: q.text, marks: q.marks, subject: q.subject || 'general', options: opts };
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
  email: ['email', 'emailid', 'emailaddress', 'mail', 'username', 'teamname', 'team'],
  roll: ['rollnumber', 'rollno', 'roll', 'rollnum', 'registrationnumber', 'regno'],
  name: ['name', 'fullname', 'studentname'],
};

// ── question bank upload ──
// By POSITION (header row optional): 1 question | 2 A | 3 B | 4 C | 5 D | 6 correct | 7 marks (optional) | 8 subject (optional)
export const letterOf = (v) => { const m = /^\(?\s*(?:option\s*)?([A-D])\s*[).:]?\s*$/i.exec(String(v ?? '').trim()); return m ? m[1].toUpperCase() : ''; };
export function questionRows(grid) {
  const rows = (grid || []).map((r) => (r || []).map(cell));
  const first = rows[0] || [];
  const hasHeader = first.length > 5 && !letterOf(first[5]);   // a real question row has A/B/C/D in column 6
  return rows.map((r, i) => ({ r, line: i + 1 })).slice(hasHeader ? 1 : 0).filter(({ r }) => r.some(Boolean))
    .map(({ r, line }) => ({ label: `row ${line}`, text: r[0] ?? '', a: r[1] ?? '', b: r[2] ?? '', c: r[3] ?? '', d: r[4] ?? '', correct: letterOf(r[5]) || (r[5] ?? ''), marks: r[6] ?? '', subject: String(r[7] ?? '').trim().toLowerCase() || 'general' }));
}

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
