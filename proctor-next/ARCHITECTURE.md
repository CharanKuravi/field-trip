# Architecture, rate limiting and capacity

## "2,500 per second" - what this is built for
**2,500 people taking the exam at the same time** (about 350 requests/second at steady state). It also handles all 2,500 logging in
within roughly 10-60 seconds: the login limiter admits ~300/s and the browser queues the rest automatically. It is NOT designed
for 2,500 brand-new logins in a single second sustained (nobody needs that; the waiting room spreads the start instead).

## Why each piece
| Choice | Reason |
|---|---|
| Frontend on Vercel | Static pages on a CDN: zero load on your backend, instant global delivery |
| API = Next.js route handlers on Firebase App Hosting (Cloud Run) | Long-lived instances, 80 concurrent requests each, always-warm (`minInstances`), same Google network as Firestore. Instances cache hackathon settings, questions and the roster in memory, so Firestore is touched far less |
| Firestore, **one document per participant** | Login = 1 read. Heartbeat = 1 masked read + 1 write. Answer = 1 read + 1 field write. Submit = 1 transaction. A participant document sees well under the ~1 write/second/doc guideline (heartbeat every ~10 s + occasional answers); 2,500 *different* documents scale horizontally |
| Email as the document ID | O(1) login lookup and a free, race-proof uniqueness guarantee |
| Answers inside the participant document | Atomic grading in one transaction; the monitor needs no joins |
| Upstash Redis for rate limits | Cloud Run instances share no memory, so per-instance counters would be useless. Firestore is the wrong tool (a billed write per request, hot-document limits) |
| Bearer tokens, no cookies | Cross-site cookies are blocked by modern browsers; tokens also make CORS simple (preflight cached 2 h) |

## Rate limiting (all in `lib/ratelimit.js`)
| Limiter | Rule | Why |
|---|---|---|
| Global login | 300 / second (env `RL_LOGIN_PER_SEC`) | Smooths the start-of-exam login spike; the browser waits `Retry-After` + jitter and retries on its own |
| Failed logins per email | 10 / 5 min | Stops password guessing against one account |
| Failed logins per IP | 600 / 5 min | **Deliberately loose**: a whole college shares one public IP, so a strict per-IP rule would lock everybody out |
| Per participant, every exam call | 40 / 10 s | A modified client can't hammer Firestore (normal use is ~1 call per 5 s) |
| Admin login failures | 8 / 5 min per IP | |
| Admin calls | 240 / min per IP | |
Counters use the fixed-window algorithm (one Redis command per check). Lockouts count **failures only**. If Upstash is
unreachable the limiter **fails open** (the exam keeps running) and logs a warning.

## Other scale decisions
* Heartbeat ~10 s with a different random period per browser, so 2,500 clients drift apart instead of syncing.
* Answers: sent immediately, retried with backoff, and also backed up in `localStorage`; the final Submit sends the whole answer set again.
* Waiting room polls with jitter; `/exam/me` is served from the in-memory settings cache.
* Admin lists are searched and paged in memory from one roster read (cached 4 s per instance); the violation log uses an index.
* Expired attempts are auto-submitted lazily (when the participant returns or when an admin views Monitor / exports). There is no background job on Cloud Run.
* Violations are counted with a Firestore transaction (the server is the authority), auto-submit happens server-side.

## Capacity and cost estimates (NOT measured - run the load test)
* Steady state at 2,500: ~235 heartbeats/s + ~120 answers/s. Firestore handles thousands of writes/s across many documents; two warm 2-vCPU instances (160 concurrent requests) are plausible for this I/O-bound load, up to `maxInstances: 10`.
* Firestore operations for a 1-hour exam with 2,500 students ≈ 2.3M reads + 2.3M writes ≈ a few US dollars at list prices. The admin Monitor reads the whole roster (2,500 docs) every ~6 s per open tab ≈ 1.5M reads/hour.
* Upstash: one Redis command per exam request ≈ 1.3M commands/hour (pay-as-you-go, roughly a couple of dollars/hour). You can switch exam-call limiting off with `RL_USER_PER_10S` set very high or `RATE_LIMIT_ENABLED=false`, keeping only login protection.
* Check current prices on the Firebase, Google Cloud, Upstash and Vercel pricing pages before the event; they change.

## Honest limits
* **Not yet run**: I could not install packages or reach Firebase from my sandbox. The unit tests for the pure logic pass and every file parses, but `npm run build` and the load test have not been run. Do both before relying on it.
* Firestore has no substring search, so Monitor/Participants search runs in memory (fine at this size, not for 100k rows).
* App Hosting and the exact `apphosting.yaml` / CLI options change over time; if a step differs, follow the current Firebase docs.
* Browser proctoring is a deterrent and audit trail, not a guarantee (second device, helper off-screen, OS-level screen share). Roll numbers are guessable by classmates, so keep the other layers on.
