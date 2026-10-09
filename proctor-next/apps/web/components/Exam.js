'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Proctor } from '../lib/proctor';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default function Exam({ ex, onDone }) {
  // All fast-changing exam state lives in one ref; `rerender` repaints. (Keeps timers/handlers free of stale closures.)
  const R = useRef(null);
  if (R.current === null) R.current = { ans: { ...ex.saved }, pend: new Map(), flushing: false, finished: false, left: ex.seconds_left, violations: ex.violations, timer: null, hb: null };
  const [, setTick] = useState(0);
  const rerender = () => setTick((n) => n + 1);
  const [toast, setToast] = useState('');
  const [dim, setDim] = useState(false);
  const [fsLost, setFsLost] = useState(false);
  const lsk = `pend:${ex.pid}`;

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 4000); };
  const persist = () => { try { localStorage.setItem(lsk, JSON.stringify([...R.current.pend])); } catch {} rerender(); };

  // Answers are saved one at a time with retries; whatever is still unsent is backed up in localStorage and re-sent.
  async function flushAns() {
    const s = R.current;
    if (s.flushing) return;
    s.flushing = true;
    try {
      for (const [qid, sel] of [...s.pend]) {
        await api('/exam/answer', { method: 'POST', body: { question_id: qid, selected: sel }, retries: 1 });
        if (s.pend.get(qid) === sel) s.pend.delete(qid);
      }
    } catch {} finally { s.flushing = false; persist(); }
  }

  function choose(qid, key) { const s = R.current; s.ans[qid] = key; s.pend.set(qid, key); persist(); flushAns(); }

  async function finish() {
    const s = R.current;
    if (s.finished) return;
    s.finished = true; clearInterval(s.timer); clearInterval(s.hb);
    for (let i = 0; i < 6; i++) {                             // backoff: survives a brief server hiccup
      try { await api('/exam/submit', { method: 'POST', body: { answers: s.ans }, retries: 0 }); try { localStorage.removeItem(lsk); } catch {} break; }
      catch (e) { if (/No active attempt/.test(e.message)) break; await sleep(800 * 2 ** i + Math.random() * 500); }
    }
    Proctor.stop(true); onDone();
  }

  useEffect(() => {
    const s = R.current;
    try { JSON.parse(localStorage.getItem(lsk) || '[]').forEach(([k, v]) => { if (s.ans[k] !== v) { s.ans[k] = v; s.pend.set(k, v); } }); } catch {}
    if (s.pend.size) flushAns();
    s.timer = setInterval(() => { s.left -= 1; if (s.left <= 0) { flash('Time is up – submitting'); finish(); } rerender(); }, 1000);
    // heartbeat ~every 10 s with a per-client random period, so thousands of browsers drift apart instead of syncing up
    s.hb = setInterval(async () => {
      if (s.pend.size) flushAns();
      try { const r = await api('/exam/heartbeat', { method: 'POST', retries: 0 }); if (r.ok) s.left = r.seconds_left; } catch {}
    }, 10000 + Math.floor(Math.random() * 1500));
    Proctor.start({
      onFocusLost: () => setDim(true), onFocusBack: () => setDim(false),
      onFullscreenLost: () => setFsLost(true), onFullscreenBack: () => setFsLost(false),
      onViolation: async (type, desc) => {
        if (s.finished) return;
        s.violations += 1; flash(`Violation: ${desc}`); rerender();
        try {
          const r = await api('/exam/violation', { method: 'POST', body: { event_type: type, description: desc }, retries: 1 });
          if (r.auto_submitted) { s.finished = true; clearInterval(s.timer); clearInterval(s.hb); Proctor.stop(true); flash('Max violations – exam auto-submitted'); setTimeout(onDone, 1500); }
        } catch {}
      },
    });
    return () => { clearInterval(s.timer); clearInterval(s.hb); Proctor.stop(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = R.current;
  const answered = Object.values(s.ans).filter(Boolean).length, left = Math.max(0, s.left);
  const wm = `<svg xmlns='http://www.w3.org/2000/svg' width='340' height='200'><text x='170' y='100' text-anchor='middle' transform='rotate(-25 170 100)' font-size='16' font-family='sans-serif' fill='rgba(128,128,128,0.22)'>${xml(ex.name)} · ${xml(ex.pid)}</text></svg>`;

  return (
    <div className={`exam${dim ? ' dim' : ''}`}>
      <div className="wm" style={{ backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(wm)}")` }} />
      <div className="bar">
        <b>{ex.questions.length} questions</b>
        <span>Answered <b>{answered}</b>/{ex.questions.length}</span>
        <span className="mu">{s.pend.size ? 'Saving…' : '✓ Saved'}</span>
        <span>Violations <span className="v">{s.violations}</span>/{ex.max_violations || '∞'}</span>
        <span className="mono">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
        <button onClick={() => { const un = ex.questions.length - answered; if (!un || confirm(`${un} unanswered. Submit anyway?`)) finish(); }}>Submit</button>
      </div>
      <div className="wrap">
        {ex.questions.map((q, i) => (
          <div className="card" key={q.id}>
            <b>Q{i + 1}.</b> {q.text} <span className="mu">[{q.marks} mk]</span>
            {q.options.map((o) => (
              <label key={o.key} className={`opt${s.ans[q.id] === o.key ? ' sel' : ''}`}>
                <input type="radio" name={`q${q.id}`} checked={s.ans[q.id] === o.key} onChange={() => choose(q.id, o.key)} style={{ marginRight: 8 }} />
                {o.text}
              </label>
            ))}
          </div>
        ))}
      </div>
      {fsLost && (
        <div className="overlay"><div>
          <h1>Fullscreen required</h1><p>Leaving fullscreen was recorded as a violation.</p>
          <button onClick={() => Proctor.enterFullscreen()}>Return to fullscreen</button>
        </div></div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
