// Regression test for the "bulk upload hangs forever" bug.
// Runs the REAL bulkCreate() + REAL Firestore BulkWriter; only the network commit is stubbed (no credentials needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../lib/firebase.js';
import { bulkCreate } from '../lib/admin.js';

const probe = db.bulkWriter();
const Batch = Object.getPrototypeOf(probe._bulkCommitBatch);        // private API: fine for a test stub
Batch._commit = async function () {
  return { writeResults: this.pendingOps.map(() => ({ updateTime: { seconds: 1, nanos: 0 } })), status: this.pendingOps.map(() => ({ code: 0 })) };
};
await probe.close();

const rows = (n) => Array.from({ length: n }, (_, i) => ({ label: `row ${i + 2}`, email: `user${i}@college.edu`, roll: `242UA${String(i).padStart(5, '0')}` }));
const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`bulkCreate hung (> ${ms}ms)`)), ms))]);

for (const n of [1, 19, 20, 21, 25, 47, 200]) {
  test(`bulkCreate finishes and saves all ${n} row(s)`, async () => {
    const r = await within(bulkCreate('hack1', rows(n)), 5000);
    assert.equal(r.created, n); assert.equal(r.error_count, 0);
  });
}
test('bad rows are reported, good rows still saved', async () => {
  const r = await within(bulkCreate('hack1', [...rows(3), { label: 'row 9', email: 'not-an-email', roll: 'X1' }, { label: 'row 10', email: 'ok@x.edu', roll: '' }]), 5000);
  assert.equal(r.created, 3); assert.equal(r.error_count, 2);
});
