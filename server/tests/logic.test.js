import test from 'node:test';
import assert from 'node:assert/strict';
import { normEmail, normRoll, EMAIL_RE, hashRoll, checkRoll, seededShuffle, buildView, grade, gridToRows, HDR, pick, csvEscape, computeIntegrity, sortQuestions } from '../lib/logic.js';

const QS = [1, 2, 3].map((i) => ({ id: `q${i}`, text: `Q${i}`, a: 'a', b: 'b', c: 'c', d: 'd', correct: 'B', marks: i }));

test('normalisation', () => {
  assert.equal(normEmail('  Asha@Example.COM '), 'asha@example.com');
  assert.equal(normRoll(' 21cs 001 '), '21CS001');
  assert.equal(normRoll(12345), '12345');
  assert.ok(EMAIL_RE.test('a@b.co')); assert.ok(!EMAIL_RE.test('a/b@c.com')); assert.ok(!EMAIL_RE.test('nope'));
});
test('hash + check', () => {
  const h = hashRoll('a@b.com', '21CS001', 'pep');
  assert.ok(checkRoll('a@b.com', '21CS001', 'pep', h));
  assert.ok(!checkRoll('a@b.com', '21CS002', 'pep', h));
  assert.ok(!checkRoll('a@b.com', '21CS001', 'other', h));
  assert.ok(!checkRoll('c@b.com', '21CS001', 'pep', h));
  assert.ok(!checkRoll('a@b.com', '21CS001', 'pep', undefined));
});
test('grading with negative marks', () => {
  assert.deepEqual(grade(QS, { q1: 'B', q2: 'B', q3: 'B' }, 0.5), { score: 6, total: 6 });
  assert.deepEqual(grade(QS, { q1: 'A', q2: 'B', q3: null }, 0.5), { score: 1.5, total: 6 });
  assert.equal(grade(QS, { q1: 'A', q2: 'A', q3: 'A' }, 5).score, 0);
});
test('shuffle is stable, permutes, never leaks the answer, keeps option letters', () => {
  const a = buildView(QS, 'h', 'x@y.com', true), b = buildView(QS, 'h', 'x@y.com', true);
  assert.deepEqual(a, b);
  assert.deepEqual(seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 's1').sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.notDeepEqual(seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 's1'), seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 's2'));
  for (const q of a) { assert.ok(!('correct' in q)); assert.deepEqual(q.options.map((o) => o.key).sort(), ['A', 'B', 'C', 'D']); for (const o of q.options) assert.equal(o.text, o.key.toLowerCase()); }
  assert.deepEqual(buildView(QS, 'h', 'x', false).map((q) => q.id), ['q1', 'q2', 'q3']);
});
test('upload parsing with header aliases and numeric roll numbers', () => {
  const rows = gridToRows([['Email ID', 'Roll No', 'Name'], ['A@b.com', 101, 'A'], ['', '', ''], ['c@d.com', '21CS7', 'C']]);
  assert.equal(rows.length, 2);
  assert.equal(pick(rows[0], HDR.email), 'A@b.com'); assert.equal(pick(rows[0], HDR.roll), '101'); assert.equal(pick(rows[1], HDR.name), 'C');
});
test('csv escaping', () => { assert.equal(csvEscape('a,b'), '"a,b"'); assert.equal(csvEscape('say "hi"'), '"say ""hi"""'); assert.equal(csvEscape(null), ''); });
test('question order', () => { assert.deepEqual(sortQuestions([{ id: 'b', order: 2 }, { id: 'a', order: 2 }, { id: 'z', order: 1 }]).map((q) => q.id), ['z', 'a', 'b']); });
test('integrity: shared wrong answers, fast answering, shared IP', () => {
  const correct = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`q${i}`, 'A']));
  const mk = (email, ip, sels, t0 = 0, gap = 5000) => ({ email, name: email, ip, startedAt: 1000, submittedAt: 9e9,
    answers: Object.fromEntries(sels.map((s, i) => [`q${i}`, { s, t: 1000 + t0 + (i + 1) * gap }])) });
  const r = computeIntegrity([mk('a@x', '1.1.1.1', ['B', 'C', 'D', 'B', 'A', 'A']), mk('b@x', '1.1.1.1', ['B', 'C', 'D', 'B', 'A', 'A']),
    mk('c@x', '2.2.2.2', ['A', 'A', 'A', 'A', 'A', 'A'], 0, 500)], correct);
  assert.equal(r.similar_wrong_answers.length, 1); assert.equal(r.similar_wrong_answers[0].shared_wrong, 4);
  assert.equal(r.shared_ip.length, 1); assert.equal(r.fast_answers.length, 1); assert.match(r.fast_answers[0].who, /^c@x/);
});
