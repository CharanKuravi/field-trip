// Admin endpoints. The roster (all participants of one hackathon, WITHOUT answers/hashes) is read once per 4 s per
// instance and searched / filtered / paginated in memory. Firestore has no substring search or cheap offsets, and
// 2,500 small rows is trivial to hold in memory.
import { timingSafeEqual } from 'node:crypto';
import { db, P, H, EV } from './firebase.js';
import { memo, forget } from './cache.js';
import { HttpError, env } from './http.js';
import { signToken, requireAdmin } from './auth.js';
import { limitAdmin, assertAdminAllowed, recordAdminFailure } from './ratelimit.js';
import { getHack, getQuestions, finalize, expired, dropHack, dropQuestions, dropRoster, ONLINE_MS } from './core.js';
import { EMAIL_RE, normEmail, normRoll, hashRoll, HDR, pick, csvEscape, computeIntegrity } from './logic.js';
import { readTable } from './table.js';

const ROSTER_FIELDS = ['hid', 'email', 'name', 'phone', 'college', 'startedAt', 'deadline', 'submittedAt', 'score', 'total', 'violations', 'vtypes', 'autoSubmitted', 'lastSeen', 'ip'];
const roster = (hid) => memo(`r:${hid}`, 4000, async () => (await P.where('hid', '==', hid).select(...ROSTER_FIELDS).get()).docs.map((d) => ({ id: d.id, ...d.data() })));
const status = (r) => (r.submittedAt ? 'submitted' : r.startedAt ? 'in_progress' : 'not_started');
const pages = (total, per) => Math.max(1, Math.ceil(total / per));
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const hdict = (id, h) => ({ id, name: h.name, duration_minutes: h.duration_minutes, negative_marks: h.negative_marks, pass_percentage: h.pass_percentage, max_violations: h.max_violations, shuffle: h.shuffle, is_open: h.is_open });

const COPY = ['copy_attempt','paste_attempt','cut_attempt'], TAB = ['tab_switch','window_blur','fullscreen_exit'];
const vsum = (vt, keys) => keys.reduce((n, k) => n + (Number(vt?.[k]) || 0), 0);
const vbreak = (r) => { const c = vsum(r.vtypes, COPY), t = vsum(r.vtypes, TAB); return { copy_paste: c, tab_switch: t, other: Math.max(0, (r.violations || 0) - c - t) }; };

async function mapLimit(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}
/** Auto-submit attempts whose timer ran out and whose browser never came back. Runs whenever an admin looks. */
async function sweep(hid, rows) {
  const stale = rows.filter(expired).slice(0, 60);
  const res = await mapLimit(stale, 10, (r) => finalize(r.id, hid, { auto: true }).catch(() => null));
  stale.forEach((r, i) => { if (res[i]) Object.assign(r, { submittedAt: res[i].submittedAt, score: res[i].score, total: res[i].total, autoSubmitted: true }); });
}

const adminCtx = async (req, ip) => { await requireAdmin(req); await limitAdmin(ip); };
const A = (fn) => async (c) => { await adminCtx(c.req, c.ip); return fn(c); };

async function adminLogin({ ip, json }) {
  const b = (await json()) || {};
  await assertAdminAllowed(ip);
  if (!(same(b.username ?? '', env('PROCTOR_ADMIN_USER')) & same(b.password ?? '', env('PROCTOR_ADMIN_PASS')))) {
    await recordAdminFailure(ip); throw new HttpError(401, 'Invalid admin credentials');
  }
  return { token: await signToken({ role: 'admin', sub: 'admin' }) };
}

// ── hackathons ──
const listHacks = A(async () => {
  const snap = await H.orderBy('created').get();
  return Promise.all(snap.docs.map(async (d) => {
    const [p, q] = await Promise.all([P.where('hid', '==', d.id).count().get(), d.ref.collection('questions').count().get()]);
    return { ...hdict(d.id, d.data()), participants: p.data().count, questions: q.data().count };
  }));
});
const hackFields = (b) => {
  const name = String(b.name ?? '').trim(); if (!name) throw new HttpError(400, 'Name is required');
  const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return { name, duration_minutes: Math.max(1, n(b.duration_minutes, 60)), negative_marks: Math.max(0, n(b.negative_marks, 0)), pass_percentage: n(b.pass_percentage, 40),
    max_violations: Math.max(0, n(b.max_violations, 5)), shuffle: b.shuffle !== false, is_open: !!b.is_open };
};
const createHack = A(async ({ json }) => { const f = hackFields(await json()), ref = await H.add({ ...f, created: Date.now() }); return hdict(ref.id, f); });
const updateHack = A(async ({ params, json }) => {
  const f = hackFields(await json()); await H.doc(params.hid).update(f); dropHack(params.hid); return hdict(params.hid, f);
});

// ── participants ──
function build(hid, { email, roll, name, phone, college }) {
  const e = normEmail(email), r = normRoll(roll);
  if (!EMAIL_RE.test(e)) throw new HttpError(400, `Invalid email: ${e || '(empty)'}`);
  if (!r) throw new HttpError(400, 'Roll number is required');
  return [e, { hid, email: e, pwHash: hashRoll(e, r, env('PROCTOR_PEPPER')), name: String(name || '').trim() || e.split('@')[0],
    phone: String(phone || '').trim(), college: String(college || '').trim(), violations: 0, createdAt: Date.now() }];
}
const partItem = (r) => ({ id: r.id, pid: r.id, email: r.id, name: r.name, phone: r.phone || '', college: r.college || '' });
const matches = (r, q) => !q || `${r.name} ${r.email} ${r.college}`.toLowerCase().includes(q.toLowerCase());

const listParts = A(async ({ params, url }) => {
  const q = (url.searchParams.get('q') || '').trim(), per = Math.min(Math.max(+url.searchParams.get('per') || 100, 10), 500);
  const rows = (await roster(params.hid)).filter((r) => matches(r, q)).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const page = Math.min(Math.max(+url.searchParams.get('page') || 1, 1), pages(rows.length, per));
  return { items: rows.slice((page - 1) * per, page * per).map(partItem), total: rows.length, page, pages: pages(rows.length, per) };
});

const addPart = A(async ({ params, json }) => {
  const b = await json(); await getHack(params.hid);
  const [e, doc] = build(params.hid, { email: b.email, roll: b.roll_number, name: b.name, phone: b.phone, college: b.college });
  try { await P.doc(e).create(doc); } catch (err) { throw err.code === 6 ? new HttpError(400, `${e} is already registered`) : err; }
  dropRoster(params.hid); return partItem({ id: e, ...doc });
});

export async function bulkCreate(hid, rows) {
  const errors = [], seen = new Set(), todo = [];
  for (const r of rows) {
    try { const [e, doc] = build(hid, r); if (seen.has(e)) throw new HttpError(400, `${e} appears twice in this file`); seen.add(e); todo.push({ label: r.label, e, doc }); }
    catch (err) { errors.push(`${r.label}: ${err.message}`); }
  }
  // Configure BulkWriter with higher throughput for faster uploads
  const bw = db.bulkWriter({ 
    throttling: { 
      maxOpsPerSecond: 500,    // Increase from default ~50 to 500 ops/sec
      initialOpsPerSecond: 100  // Start fast
    } 
  });
  // IMPORTANT: bw.create() only QUEUES the write. Its promise resolves after the batch is committed, and a partial batch
  // (<20 ops) is only sent by flush()/close(). So: queue everything, close() FIRST, and only then await the results.
  // (Awaiting the write promises before close() hangs forever, e.g. a 1-row file never leaves the queue.)
  // Handlers are attached immediately so a failed write can never surface as an unhandled rejection while close() runs.
  const jobs = todo.map((t) => bw.create(P.doc(t.e), t.doc).then(() => ({ ok: true }), (reason) => ({ ok: false, reason })));
  await bw.close();
  const res = await Promise.all(jobs);
  let created = 0;
  res.forEach((x, i) => { if (x.ok) created++; else errors.push(`${todo[i].label}: ${x.reason?.code === 6 ? `${todo[i].e} is already registered` : 'could not be saved'}`); });
  dropRoster(hid); return { created, error_count: errors.length, errors: errors.slice(0, 50) };
}
async function fileFrom(req) {
  const f = (await req.formData()).get('file');
  if (!f || typeof f === 'string') throw new HttpError(400, 'No file uploaded');
  if (f.size > 5 * 1024 * 1024) throw new HttpError(413, 'File too large (max 5 MB)');
  return { name: f.name || '', buf: Buffer.from(await f.arrayBuffer()) };
}
const uploadParts = A(async ({ req, params }) => {
  await getHack(params.hid);
  const { name, buf } = await fileFrom(req), rows = await readTable(name, buf);
  if (!rows.length) throw new HttpError(400, 'The file has no data rows');
  const keys = Object.keys(rows[0]), named = HDR.email.some((k) => k in rows[0]) && HDR.roll.some((k) => k in rows[0]);
  if (!named && keys.length < 2) throw new HttpError(400, 'File needs two columns: username (first) and roll number (second)');
  return bulkCreate(params.hid, rows.map((x, i) => ({ label: `row ${i + 2}`, email: named ? pick(x, HDR.email) : x[keys[0]], roll: named ? pick(x, HDR.roll) : x[keys[1]], name: pick(x, HDR.name), phone: x.phone, college: x.college })));
});
const changeRoll = A(async ({ params, json }) => {
  const b = await json(), r = normRoll(b.roll_number); if (!r) throw new HttpError(400, 'Roll number is required');
  const snap = await P.doc(params.email).get(); if (!snap.exists) throw new HttpError(404, 'Not found');
  await P.doc(params.email).update({ pwHash: hashRoll(params.email, r, env('PROCTOR_PEPPER')), sid: null });   // also signs them out
  return { ok: true };
});
const delPart = A(async ({ params }) => {
  const snap = await P.doc(params.email).get(); if (!snap.exists) throw new HttpError(404, 'Not found');
  const evs = await EV.where('pid', '==', params.email).get();
  for (let i = 0; i < evs.docs.length; i += 400) { const b = db.batch(); evs.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref)); await b.commit(); }
  await P.doc(params.email).delete(); dropRoster(snap.data().hid); return { ok: true };
});

// ── questions ──
function qFields(x) {
  const q = { text: String(x.text ?? '').trim(), a: String(x.a ?? '').trim(), b: String(x.b ?? '').trim(), c: String(x.c ?? '').trim(), d: String(x.d ?? '').trim(),
    correct: String(x.correct ?? '').trim().toUpperCase(), marks: Math.max(1, parseInt(x.marks, 10) || 1) };
  if (!['A', 'B', 'C', 'D'].includes(q.correct)) throw new HttpError(400, 'correct must be A, B, C or D');
  if (!q.text || !q.a || !q.b || !q.c || !q.d) throw new HttpError(400, 'Question text and all four options are required');
  return q;
}
const qcol = (hid) => H.doc(hid).collection('questions');
const listQs = A(async ({ params }) => (await getQuestions(params.hid)).map(({ id, text, a, b, c, d, correct, marks }) => ({ id, text, a, b, c, d, correct, marks })));
const addQ = A(async ({ params, json }) => {
  const q = qFields(await json()); await getHack(params.hid);
  const ref = await qcol(params.hid).add({ ...q, order: Date.now() }); dropQuestions(params.hid); return { id: ref.id };
});
const uploadQs = A(async ({ req, params }) => {
  await getHack(params.hid);
  const { name, buf } = await fileFrom(req), rows = await readTable(name, buf), errors = [], base = Date.now(), bw = db.bulkWriter(), jobs = [];
  let created = 0;
  rows.forEach((x, i) => {
    try {
      const q = qFields({ text: x.question, a: x.a, b: x.b, c: x.c, d: x.d, correct: x.correct, marks: x.marks });
      jobs.push(bw.create(qcol(params.hid).doc(), { ...q, order: base + i }).then(() => { created++; }, () => { errors.push(`row ${i + 2}: could not be saved`); }));
    } catch (e) { errors.push(`row ${i + 2}: ${e.message}`); }
  });
  await bw.close(); await Promise.all(jobs); dropQuestions(params.hid);
  return { created, errors: errors.slice(0, 50) };
});
const delQ = A(async ({ params }) => { await qcol(params.hid).doc(params.qid).delete(); dropQuestions(params.hid); return { ok: true }; });

// ── monitoring ──
const recentEvents = (hid) => memo(`v:${hid}`, 4000, async () => (await EV.where('hid', '==', hid).orderBy('at', 'desc').limit(100).get()).docs.map((d) => d.data()));

const monitor = A(async ({ params, url }) => {
  const hid = params.hid, sp = url.searchParams, q = (sp.get('q') || '').trim(), st = sp.get('status') || '';
  const per = Math.min(Math.max(+sp.get('per') || 100, 10), 500), rows = await roster(hid);
  await sweep(hid, rows);
  const now = Date.now(), count = (s) => rows.filter((r) => status(r) === s).length;
  const summary = { total: rows.length, not_started: count('not_started'), in_progress: count('in_progress'), submitted: count('submitted'),
    online: rows.filter((r) => !r.submittedAt && r.lastSeen && now - r.lastSeen < ONLINE_MS).length };
  const list = rows.filter((r) => matches(r, q) && (!st || status(r) === st))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name));
  const page = Math.min(Math.max(+sp.get('page') || 1, 1), pages(list.length, per)), byId = new Map(rows.map((r) => [r.id, r]));
  return {
    summary, total: list.length, page, pages: pages(list.length, per),
    participants: list.slice((page - 1) * per, page * per).map((r) => ({
      pid: r.id, name: r.name, college: r.college || '', status: status(r), auto_submitted: !!r.autoSubmitted, score: r.score ?? null, total: r.total ?? null,
      pct: r.total ? Math.round((r.score / r.total) * 10000) / 100 : null, violations: r.violations || 0, ...vbreak(r), vtypes: r.vtypes || {},
      online: !r.submittedAt && !!r.lastSeen && now - r.lastSeen < ONLINE_MS, last_seen: r.lastSeen ? new Date(r.lastSeen).toISOString() : null, ip: r.ip || '' })),
    violations: (await recentEvents(hid)).map((e) => ({ at: new Date(e.at).toISOString(), pid: e.pid, name: byId.get(e.pid)?.name || '', event: e.type, description: e.description })),
  };
});

const exportCsv = A(async ({ params }) => {
  const [h, rows] = [await getHack(params.hid), await roster(params.hid)];
  await sweep(params.hid, rows);
  const out = [['rank', 'email', 'name', 'college', 'status', 'score', 'total', 'percent', 'passed', 'violations', 'copy_paste', 'tab_switch', 'other_violations', 'auto_submitted']];
  [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name)).forEach((r, i) => {
    const pct = r.total ? Math.round((r.score / r.total) * 10000) / 100 : '', vb = vbreak(r);
    out.push([i + 1, r.id, r.name, r.college || '', status(r), r.score ?? '', r.total ?? '', pct, pct === '' ? '' : pct >= h.pass_percentage, r.violations || 0, vb.copy_paste, vb.tab_switch, vb.other, !!r.autoSubmitted]);
  });
  return new Response(out.map((r) => r.map(csvEscape).join(',')).join('\n'), { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename=hackathon_${params.hid}_results.csv` } });
});

const integrity = A(async ({ params }) => memo(`i:${params.hid}`, 60000, async () => {
  const [qs, snap] = await Promise.all([getQuestions(params.hid), P.where('hid', '==', params.hid).select('email', 'name', 'ip', 'startedAt', 'submittedAt', 'answers').get()]);
  return computeIntegrity(snap.docs.map((d) => d.data()), Object.fromEntries(qs.map((q) => [q.id, q.correct])));
}));

export const adminRoutes = [
  ['POST', '/admin/login', adminLogin],
  ['GET', '/admin/hackathons', listHacks], ['POST', '/admin/hackathons', createHack], ['PUT', '/admin/hackathons/:hid', updateHack],
  ['GET', '/admin/hackathons/:hid/participants', listParts], ['POST', '/admin/hackathons/:hid/participants', addPart],
  ['POST', '/admin/hackathons/:hid/participants/upload', uploadParts],
  ['PUT', '/admin/participants/:email/roll', changeRoll], ['DELETE', '/admin/participants/:email', delPart],
  ['GET', '/admin/hackathons/:hid/questions', listQs], ['POST', '/admin/hackathons/:hid/questions', addQ],
  ['POST', '/admin/hackathons/:hid/questions/upload', uploadQs], ['DELETE', '/admin/hackathons/:hid/questions/:qid', delQ],
  ['GET', '/admin/hackathons/:hid/monitor', monitor], ['GET', '/admin/hackathons/:hid/export.csv', exportCsv],
  ['GET', '/admin/hackathons/:hid/integrity', integrity],
];
