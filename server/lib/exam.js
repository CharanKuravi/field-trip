// Participant endpoints. Per call: signed token -> rate limit -> 1 masked Firestore read -> 1 write.
import { randomBytes } from 'node:crypto';
import { db, P, FieldPath, FieldValue } from './firebase.js';
import { HttpError, env } from './http.js';
import { signToken } from './auth.js';
import { limitLoginGlobal, assertLoginAllowed, recordLoginFailure } from './ratelimit.js';
import { participantCtx, getHack, getQuestions, paperOf, finalize, settle, addEvent, readLive } from './core.js';
import { EMAIL_RE, normEmail, normRoll, checkRoll, buildView, flatAnswers, paperSize } from './logic.js';

const secondsLeft = (d) => Math.max(0, Math.floor((d.deadline - Date.now()) / 1000));
const needJson = async (json) => { const b = await json(); if (!b || typeof b !== 'object') throw new HttpError(400, 'Bad request'); return b; };

async function login({ ip, json }) {
  const b = await needJson(json), email = normEmail(b.email), roll = normRoll(b.password);
  await limitLoginGlobal();                                   // system-wide cap; clients auto-retry on 'busy'
  await assertLoginAllowed(email, ip);                        // per-email / per-IP lockout (failures only)
  const snap = await P.doc(email).get(), d = snap?.exists ? snap.data() : null;
  if (!d || !checkRoll(email, roll, env('PROCTOR_PEPPER'), d.pwHash)) {
    await recordLoginFailure(email, ip); throw new HttpError(401, 'Invalid username or password');
  }
  const sid = randomBytes(16).toString('hex');                // a newer login replaces sid -> older session gets 401
  await P.doc(email).update({ sid });
  return { token: await signToken({ role: 'participant', sub: email, hid: d.hid, sid, name: d.name }), name: d.name };
}

async function me(c) {
  const x = await participantCtx(c.req), h = await getHack(x.hid), d = await settle(x.email, x.hid, x.d);
  const done = !!d.submittedAt;
  return {
    name: d.name, pid: x.email, hackathon: h.name, duration_minutes: h.duration_minutes, max_violations: h.max_violations,
    is_open: !!h.is_open, status: done ? 'submitted' : d.startedAt ? 'in_progress' : 'not_started',
    questions: paperOf(h, await getQuestions(x.hid), x.email).length,
    result: done ? { score: d.score ?? 0, total: d.total ?? 0, violations: d.violations || 0, auto_submitted: !!d.autoSubmitted,
      passed: !!d.total && (d.score / d.total) * 100 >= h.pass_percentage } : null,
  };
}

async function start(c) {
  const x = await participantCtx(c.req), h = await getHack(x.hid);
  let d = await settle(x.email, x.hid, x.d);
  if (d.submittedAt) throw new HttpError(400, 'Already submitted');
  if (!h.is_open) throw new HttpError(403, 'This hackathon is not open yet');
  const ref = P.doc(x.email);
  if (!d.startedAt) {                                         // first start: transaction so it happens exactly once
    d = await db.runTransaction(async (tx) => {
      const cur = (await tx.get(ref)).data();
      if (cur.startedAt) return cur;
      const now = Date.now(), upd = { startedAt: now, deadline: now + h.duration_minutes * 60000, violations: 0, answers: {}, lastSeen: now, ip: c.ip };
      tx.update(ref, upd); return { ...cur, ...upd };
    });
  }
  const answers = d.answers ?? (await ref.get()).data().answers ?? {};    // resume: bring back saved answers
  const qs = await getQuestions(x.hid);
  return { name: d.name, pid: x.email, questions: buildView(qs, x.hid, x.email, h.shuffle !== false, paperSize(h)), saved: flatAnswers(answers),
    max_violations: h.max_violations, violations: d.violations || 0, seconds_left: secondsLeft(d) };
}

async function active(c) {
  const x = await participantCtx(c.req), d = await settle(x.email, x.hid, x.d);
  if (!d.startedAt || d.submittedAt) throw new HttpError(400, 'No active attempt');
  return { ...x, d };
}

async function answer(c) {
  const b = await needJson(c.json), x = await active(c);
  const sel = String(b.selected ?? '').toUpperCase() || null, qid = String(b.question_id ?? '');
  if (sel && !['A', 'B', 'C', 'D'].includes(sel)) throw new HttpError(400, 'Bad option');
  const [h, pool] = await Promise.all([getHack(x.hid), getQuestions(x.hid)]);
  if (!paperOf(h, pool, x.email).some((q) => q.id === qid)) throw new HttpError(404, 'Question not found');
  await P.doc(x.email).update(new FieldPath('answers', qid), { s: sel, t: Date.now() });   // one field of one doc
  return { ok: true };
}

async function heartbeat(c) {
  const x = await participantCtx(c.req), d = await settle(x.email, x.hid, x.d);
  if (!d.startedAt || d.submittedAt) return { ok: false };
  const now = Date.now(), gap = d.lastSeen && now - d.lastSeen > 25000;
  await Promise.all([
    P.doc(x.email).update({ lastSeen: now, ip: c.ip }),
    gap ? addEvent(x.hid, x.email, 'connection_gap', `No heartbeat for ${Math.round((now - d.lastSeen) / 1000)}s`, false) : null,   // logged, not counted
  ]);
  return { ok: true, seconds_left: secondsLeft(d) };
}

async function violation(c) {
  const b = await needJson(c.json), x = await active(c), h = await getHack(x.hid), ref = P.doc(x.email);
  const n = await db.runTransaction(async (tx) => {           // atomic server-side counter = the authority
    const cur = (await tx.get(ref)).data();
    if (!cur.startedAt || cur.submittedAt) throw new HttpError(400, 'No active attempt');
    const v = (cur.violations || 0) + 1, t = String(b.event_type || 'unknown').replace(/[^a-z_]/gi, '').slice(0, 40) || 'unknown';
    tx.update(ref, { violations: v, [`vtypes.${t}`]: FieldValue.increment(1) }); return v;
  });
  await addEvent(x.hid, x.email, b.event_type || 'unknown', b.description || '', true);
  const auto = !!h.max_violations && n >= h.max_violations;
  if (auto) await finalize(x.email, x.hid, { auto: true });
  return { violations: n, auto_submitted: auto };
}

async function submit(c) {
  const b = await needJson(c.json), x = await participantCtx(c.req);
  if (!x.d.startedAt) throw new HttpError(400, 'No active attempt');
  if (x.d.submittedAt) return { ok: true, already: true };
  const late = Date.now() > x.d.deadline + 15000;             // too late: grade what the server already has
  const d = await finalize(x.email, x.hid, { auto: late, extra: late ? null : (b.answers || {}) });
  return { score: d.score, total: d.total, violations: d.violations || 0 };
}

export const examRoutes = [
  ['POST', '/login', login], ['GET', '/exam/me', me], ['POST', '/exam/start', start], ['POST', '/exam/answer', answer],
  ['POST', '/exam/heartbeat', heartbeat], ['POST', '/exam/violation', violation], ['POST', '/exam/submit', submit],
];
