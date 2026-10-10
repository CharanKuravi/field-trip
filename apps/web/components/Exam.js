'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Proctor } from '../lib/proctor';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default function Exam({ ex, onDone }) {
  // All fast-changing exam state lives in one ref; `rerender` repaints. (Keeps timers/handlers free of stale closures.)
  const R = useRef(null);
  if (R.current === null) R.current = { 
    ans: { ...ex.saved }, 
    pend: new Map(), 
    flushing: false, 
    finished: false, 
    left: ex.seconds_left, 
    violations: ex.violations, 
    timer: null, 
    hb: null,
    currentQuestion: 0,
    questionTimers: ex.questions.map((q) => {
      const subject = (q.subject || 'general').toLowerCase();
      return subject === 'aws' ? 15 : subject === 'aptitude' || subject === 'apti' ? 27 : 27;
    }),
    questionTimeLeft: ex.questions.map((q) => {
      const subject = (q.subject || 'general').toLowerCase();
      return subject === 'aws' ? 15 : subject === 'aptitude' || subject === 'apti' ? 27 : 27;
    })
  };
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
    s.timer = setInterval(() => { 
      s.left -= 1; 
      
      // Decrease time for current question
      if (s.questionTimeLeft[s.currentQuestion] > 0) {
        s.questionTimeLeft[s.currentQuestion] -= 1;
        
        // Auto-advance to next question when time runs out
        if (s.questionTimeLeft[s.currentQuestion] === 0 && s.currentQuestion < ex.questions.length - 1) {
          s.currentQuestion += 1;
          // Reset timer for next question
          s.questionTimeLeft[s.currentQuestion] = s.questionTimers[s.currentQuestion];
        }
      }
      
      if (s.left <= 0) { flash('Time is up – submitting'); finish(); } 
      rerender(); 
    }, 1000);
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
  
  const currentQ = ex.questions[s.currentQuestion];
  const subject = (currentQ.subject || 'general').toLowerCase();
  const timeForQuestion = s.questionTimeLeft[s.currentQuestion];
  const isLowTime = timeForQuestion <= 5;
  
  // Determine current section
  const isSection1 = s.currentQuestion < 20; // First 20 are AWS
  const currentSection = isSection1 ? 1 : 2;
  const sectionName = isSection1 ? 'AWS Questions' : 'Aptitude Questions';

  return (
    <div className={`exam${dim ? ' dim' : ''}`}>
      <div className="wm" style={{ backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(wm)}")` }} />
      
      {/* Top Bar with AWS Logo */}
      <div className="bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="https://aws-codeathon-at-gist-site.vercel.app/assets/aws-logo.png" alt="AWS" style={{ height: 32 }} />
          <span style={{ fontSize: 18, fontWeight: 'bold' }}>- Codeathon</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span><b>Section {currentSection}</b> · Question {s.currentQuestion + 1} of {ex.questions.length}</span>
          <span>Answered <b>{answered}</b>/{ex.questions.length}</span>
          <span className="mu">{s.pend.size ? 'Saving…' : '✓ Saved'}</span>
          <span>Violations <span className="v">{s.violations}</span>/{ex.max_violations || '∞'}</span>
          <span className="mono">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
          <button onClick={() => { const un = ex.questions.length - answered; if (!un || confirm(`${un} unanswered. Submit anyway?`)) finish(); }}>Submit</button>
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: 16, padding: '0 20px 20px' }}>
        {/* Main question area */}
        <div className="wrap" style={{ flex: 1 }}>
          <div className="card" style={{ 
            border: '2px solid white',
            borderTop: '4px solid #FF9800',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: '2px solid white'
            }}>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>
                {sectionName} - Question {isSection1 ? s.currentQuestion + 1 : s.currentQuestion - 19}
              </div>
              <div style={{ 
                padding: '10px 20px', 
                borderRadius: 8, 
                background: isLowTime ? '#ff6b6b' : '#4CAF50',
                color: 'white',
                fontWeight: 'bold',
                fontSize: 20,
                minWidth: 80,
                textAlign: 'center',
                border: '2px solid white'
              }}>
                {timeForQuestion}s
              </div>
            </div>
            <div style={{ fontSize: 17, marginBottom: 24, lineHeight: 1.8, color: '#222' }}>
              {currentQ.text}
            </div>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
              [{currentQ.marks} mark{currentQ.marks > 1 ? 's' : ''}]
            </div>
            {currentQ.options.map((o) => (
              <label 
                key={o.key} 
                className={`opt${s.ans[currentQ.id] === o.key ? ' sel' : ''}`} 
                style={{ 
                  fontSize: 16, 
                  padding: '14px 18px',
                  marginBottom: 10,
                  border: '2px solid white',
                  borderRadius: 6
                }}
              >
                <input 
                  type="radio" 
                  name={`q${currentQ.id}`} 
                  checked={s.ans[currentQ.id] === o.key} 
                  onChange={() => choose(currentQ.id, o.key)} 
                  style={{ marginRight: 12 }} 
                />
                {o.text}
              </label>
            ))}
          </div>
        </div>
        
        {/* Question navigator on right */}
        <div style={{ width: 240, flexShrink: 0 }}>
          <div className="card" style={{ 
            position: 'sticky', 
            top: 16,
            border: '2px solid white',
            borderTop: '4px solid #FF9800'
          }}>
            <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 'bold' }}>Question Navigator</h3>
            
            {/* Section 1: AWS Questions */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8, color: '#666' }}>
                Section 1: AWS (1-20)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {ex.questions.slice(0, 20).map((q, i) => (
                  <button
                    key={q.id}
                    onClick={() => { s.currentQuestion = i; rerender(); }}
                    disabled={i > s.currentQuestion}
                    style={{
                      padding: '10px 4px',
                      fontSize: 13,
                      fontWeight: i === s.currentQuestion ? 'bold' : 'normal',
                      background: i === s.currentQuestion ? '#FF9800' : s.ans[q.id] ? '#4CAF50' : '#f5f5f5',
                      color: i === s.currentQuestion || s.ans[q.id] ? 'white' : i > s.currentQuestion ? '#ccc' : '#333',
                      border: '2px solid white',
                      borderRadius: 4,
                      cursor: i > s.currentQuestion ? 'not-allowed' : 'pointer',
                      opacity: i > s.currentQuestion ? 0.5 : 1
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Section 2: Aptitude Questions */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8, color: '#666' }}>
                Section 2: Aptitude (21-30)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {ex.questions.slice(20, 30).map((q, i) => {
                  const actualIndex = i + 20;
                  return (
                    <button
                      key={q.id}
                      onClick={() => { s.currentQuestion = actualIndex; rerender(); }}
                      disabled={actualIndex > s.currentQuestion}
                      style={{
                        padding: '10px 4px',
                        fontSize: 13,
                        fontWeight: actualIndex === s.currentQuestion ? 'bold' : 'normal',
                        background: actualIndex === s.currentQuestion ? '#FF9800' : s.ans[q.id] ? '#4CAF50' : '#f5f5f5',
                        color: actualIndex === s.currentQuestion || s.ans[q.id] ? 'white' : actualIndex > s.currentQuestion ? '#ccc' : '#333',
                        border: '2px solid white',
                        borderRadius: 4,
                        cursor: actualIndex > s.currentQuestion ? 'not-allowed' : 'pointer',
                        opacity: actualIndex > s.currentQuestion ? 0.5 : 1
                      }}
                    >
                      {actualIndex + 1}
                    </button>
                  );
                })}
              </div>
            </div>
            
            <div style={{ marginTop: 20, fontSize: 12, color: '#666', paddingTop: 16, borderTop: '2px solid white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 16, height: 16, background: '#4CAF50', borderRadius: 2, border: '1px solid white' }}></div>
                <span>Answered</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 16, height: 16, background: '#FF9800', borderRadius: 2, border: '1px solid white' }}></div>
                <span>Current</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 16, height: 16, background: '#f5f5f5', border: '2px solid white', borderRadius: 2 }}></div>
                <span>Not answered</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 16, height: 16, background: '#f5f5f5', border: '2px solid white', borderRadius: 2, opacity: 0.5 }}></div>
                <span>Locked</span>
              </div>
            </div>
          </div>
        </div>
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
