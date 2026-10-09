// Shared Firestore helpers. Data model (one document per participant keeps every hot call to 1 read + 1 write):
//   hackathons/{hid}                         settings            hackathons/{hid}/questions/{qid}   the paper
//   participants/{email}                     identity (pwHash, sid) + attempt (startedAt, deadline, submittedAt, score...)
//                                            + answers { [qid]: { s: 'B', t: ms } }
//   events/{auto}                            { hid, pid, type, description, at, counted }
import { db, P, H, EV } from './firebase.js';
import { memo, forget } from './cache.js';
import { HttpError } from './http.js';
import { verifyToken } from './auth.js';
import { limitUser } from './ratelimit.js';
import { grade, flatAnswers, sortQuestions, paperFor, paperSize } from './logic.js';

export const GRACE_MS = 15000;
export const ONLINE_MS = 25000;
const LIVE_FIELDS = ['hid', 'sid', 'name', 'startedAt', 'deadline', 'submittedAt', 'violations', 'lastSeen', 'score', 'total', 'autoSubmitted'];

export const getHack = (hid) => memo(`h:${hid}`, 5000, async () => {
  const s = await H.doc(hid).get();
  if (!s.exists) throw new HttpError(404, 'Hackathon not found');
  return { id: s.id, ...s.data() };
});
export const getQuestions = (hid) => memo(`q:${hid}`, 30000, async () => {
  const snap = await H.doc(hid).collection('questions').get();
  return sortQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
});
export const dropHack = (hid) => forget(`h:${hid}`);
export const dropQuestions = (hid) => forget(`q:${hid}`);
export const dropRoster = (hid) => forget(`r:${hid}`);
export const paperOf = (h, qs, email) => paperFor(qs, h.id, email, h.shuffle !== false, paperSize(h));

export async function readLive(email) {
  const [snap] = await db.getAll(P.doc(email), { fieldMask: LIVE_FIELDS });
  return snap.exists ? snap.data() : null;
}

/** Auth for every exam call: signed token -> per-participant rate limit -> ONE masked Firestore read that also
 *  enforces the single-active-session rule (a newer login changes `sid`, so the old browser gets 401). */
export async function participantCtx(req) {
  const c = await verifyToken(req);
  if (c.role !== 'participant') throw new HttpError(403, 'Participant only');
  await limitUser(c.sub);
  const d = await readLive(c.sub);
  if (!d || d.sid !== c.sid) throw new HttpError(401, 'Session expired - another login detected');
  return { email: c.sub, hid: d.hid, d };
}

export const expired = (d) => !!d.startedAt && !d.submittedAt && Date.now() > d.deadline + GRACE_MS;

/** Grade + close an attempt. Transactional and idempotent: concurrent submits/sweeps can't double-grade. */
export async function finalize(email, hid, { auto = false, extra = null } = {}) {
  const [h, pool] = await Promise.all([getHack(hid), getQuestions(hid)]);
  const qs = paperOf(h, pool, email);   // grade ONLY this participant's questions
  const ref = P.doc(email);
  return db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data();
    if (!d || !d.startedAt) throw new HttpError(400, 'No active attempt');
    if (d.submittedAt) return d;
    const answers = { ...(d.answers || {}) }, valid = new Set(qs.map((q) => q.id)), now = Date.now();
    if (extra) for (const [qid, raw] of Object.entries(extra)) {           // the client's final answer set (validated)
      const sel = String(raw || '').toUpperCase();
      if (['A', 'B', 'C', 'D'].includes(sel) && valid.has(qid) && answers[qid]?.s !== sel) answers[qid] = { s: sel, t: now };
    }
    const { score, total } = grade(qs, flatAnswers(answers), h.negative_marks);
    const done = { answers, submittedAt: now, score, total, autoSubmitted: auto };
    tx.update(ref, done);
    return { ...d, ...done };
  });
}

/** If time ran out while the participant was away, close the attempt now. */
export async function settle(email, hid, d) {
  return expired(d) ? finalize(email, hid, { auto: true }) : d;
}

export async function addEvent(hid, pid, type, description, counted) {
  await EV.add({ hid, pid, type: String(type).slice(0, 40), description: String(description).slice(0, 300), at: Date.now(), counted });
}
