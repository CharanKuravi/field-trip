# Bulk upload hang - actual root cause and fix

**Symptom:** Excel/CSV participant upload sat on "Uploading..." forever (even for 1 row); a retry then showed
"already registered" errors.

**Root cause** (`apps/api/lib/admin.js`, `bulkCreate`): the code awaited the `bw.create()` promises *before* calling
`bw.close()`. A Firestore BulkWriter only sends a batch when it holds 20 operations or when `flush()`/`close()` is called,
and each `create()` promise resolves only after its batch is committed. So a partial batch (any count not a multiple of 20)
was never sent and the request never returned. For 25 rows, 20 were saved and 5 never were - which is why retries reported
"already registered".

**Fix:** queue the writes, `await bw.close()` first, then await the results (handlers attached immediately so a failed write
cannot become an unhandled rejection).

**Not the cause:** throttling. An earlier version of this note raised `maxOpsPerSecond`; that setting is unrelated and can stay or go.

**Regression test:** `cd apps/api && npm test` (tests/bulk-upload.test.js) runs the real `bulkCreate()` + real BulkWriter with only
the network call stubbed. On the old code it fails for 1, 19, 21, 25, 47 rows; on the fix all pass.

**If you already have partial data from failed uploads:** re-uploading the same file is now safe - existing emails are reported as
"already registered" and the rest are created.
