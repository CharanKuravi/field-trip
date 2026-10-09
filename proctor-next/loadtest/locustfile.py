"""Simulates real students against the API: login -> open exam -> heartbeat ~every 10 s -> answer ~every 20 s -> submit.

  pip install locust
  python loadtest/make_csv.py 2500       # upload the CSV in a TEST hackathon, add questions, tick "Open for participants"
  locust -f loadtest/locustfile.py --host https://YOUR-BACKEND.REGION.hosted.app -u 2500 -r 100
Open http://localhost:8089 for live charts. PASS = ~0 % failures and p95 < 500 ms (login may show a few 429 "busy" replies:
that is the rate limiter smoothing the spike, and the script - like the real browser - waits and retries).
Run it from a machine that is NOT the server, BEFORE the event, with a separate test hackathon."""
import itertools, random, time
from locust import HttpUser, task, between

_ids = itertools.count(1)


class Student(HttpUser):
    wait_time = between(9, 12)

    def on_start(self):
        i = next(_ids); self.ok = False
        for _ in range(30):                                           # honour the queue like the real client does
            r = self.client.post("/api/login", json={"email": f"student{i}@test.local", "password": f"r{i:05d}"}, name="POST /login", catch_response=True)
            if r.status_code == 429:
                r.success(); time.sleep(float(r.headers.get("Retry-After", 1)) + random.random()); continue
            if r.status_code != 200: r.failure(r.text); return
            r.success(); break
        else: return
        self.client.headers["Authorization"] = "Bearer " + r.json()["token"]
        self.client.get("/api/exam/me", name="GET /exam/me")
        s = self.client.post("/api/exam/start", name="POST /exam/start")
        if s.status_code != 200: return
        self.qids = [q["id"] for q in s.json()["questions"]]; self.ans = {}; self.ticks = 0; self.ok = True

    @task
    def tick(self):
        if not self.ok: self.stop(); return
        self.client.post("/api/exam/heartbeat", name="POST /exam/heartbeat")
        self.ticks += 1
        if self.ticks % 2 == 0 and self.qids:
            q = random.choice(self.qids); sel = random.choice("ABCD"); self.ans[q] = sel
            self.client.post("/api/exam/answer", json={"question_id": q, "selected": sel}, name="POST /exam/answer")
        if self.ticks >= 30:                                         # ~5 minutes of exam, then submit
            self.client.post("/api/exam/submit", json={"answers": self.ans}, name="POST /exam/submit"); self.stop()
