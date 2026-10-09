// Per-instance TTL memo with request coalescing. Cloud Run instances are long-lived and serve many requests each,
// so hot reads (hackathon settings, questions, roster) hit Firestore at most once per TTL per instance.
const store = (globalThis.__memo ||= new Map());

export function memo(key, ttlMs, fn) {
  const now = Date.now(), e = store.get(key);
  if (e && e.v !== undefined && e.exp > now) return Promise.resolve(e.v);
  if (e && e.p) return e.p;                                   // someone is already loading it
  const p = fn().then((v) => { store.set(key, { v, exp: Date.now() + ttlMs }); return v; })
                .catch((err) => { store.delete(key); throw err; });
  store.set(key, { v: e?.v, exp: e?.exp ?? 0, p });
  return p;
}
export const forget = (key) => store.delete(key);
