'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Proctor } from '../lib/proctor';
import Exam from './Exam';

export default function Participant({ onLogout }) {
  const [me, setMe] = useState(null);
  const [ex, setEx] = useState(null);
  const [err, setErr] = useState('');
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try { setMe(await api('/exam/me')); } catch (e) { if (e.status !== 401) setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Waiting room: re-check until the organiser opens the exam. Jittered so 2,500 browsers never poll in lock-step.
  useEffect(() => {
    if (!me || ex || me.result || me.is_open) return undefined;
    const t = setTimeout(load, 7000 + Math.random() * 5000);
    return () => clearTimeout(t);
  }, [me, ex, load]);

  async function begin() {
    setErr(''); setStarting(true);
    try {
      if (typeof window !== 'undefined' && window.screen && window.screen.isExtended) throw new Error('Multiple displays detected. Disconnect or disable extra monitors, then try again.');
      await Promise.resolve(Proctor.enterFullscreen()).catch(() => {});
      setEx(await api('/exam/start', { method: 'POST', retries: 6 }));
    } catch (e) { setErr(e.message); }
    finally { setStarting(false); }
  }

  if (ex) return <Exam ex={ex} onDone={() => { setEx(null); setMe(null); load(); }} />;
  if (!me) return <div className="center card">{err ? <p className="err">{err}</p> : 'Loading…'}</div>;

  if (me.result) {
    const r = me.result;
    return (
      <div className="center card">
        <h1><span className="hl">✓ Successfully Submitted</span></h1>
        <p style={{ fontSize: 18, margin: '20px 0', color: '#4CAF50', fontWeight: 'bold' }}>
          Your exam has been submitted successfully!
        </p>
        <div style={{ padding: '16px', background: '#f5f5f5', borderRadius: 8, marginBottom: 20 }}>
          <p style={{ fontSize: 16, margin: '8px 0' }}>
            <b>Violations recorded:</b> {r.violations}
          </p>
          {r.auto_submitted && (
            <p className="err" style={{ marginTop: 8 }}>
              Note: Exam was auto-submitted due to maximum violations
            </p>
          )}
        </div>
        <p className="mu" style={{ marginTop: 20 }}>
          Your results will be reviewed by the exam administrator.
        </p>
        <button onClick={onLogout} style={{ marginTop: 20 }}>Logout</button>
      </div>
    );
  }

  return (
    <div className="center card" style={{ maxWidth: 600 }}>
      <span className="ribbon">AWS CLUB | GIST</span>
      <h1><span className="hl">{me.hackathon}</span></h1>
      <p className="mu">{me.name} · <span className="mono">{me.pid}</span></p>
      <p><b>{me.questions}</b> questions · <b>{me.duration_minutes}</b> minutes</p>
      <ul className="steps">
        <li><span>The exam runs in <b>fullscreen</b>. Leaving fullscreen, switching tabs or windows, or losing focus is recorded as a violation.</span></li>
        <li><span>Right-click, copy, cut and paste are blocked. <b>Every attempt is recorded as a violation.</b></span></li>
        <li><span><b>{me.max_violations || '∞'} violations</b> = automatic submission.</span></li>
        <li><span>The timer is controlled by the server. Refreshing will not reset it.</span></li>
      </ul>
      {!me.is_open && <p className="err">This exam is not open yet. Keep this page open – it unlocks automatically.</p>}
      <button style={{ width: '100%' }} disabled={!me.is_open || starting} onClick={begin}>
        {starting ? 'Starting…' : me.status === 'in_progress' ? 'Resume exam →' : 'Enter fullscreen & begin →'}
      </button>
      <button className="sec" style={{ width: '100%', marginTop: 10 }} onClick={onLogout}>Logout</button>
      <p className="err">{err}</p>
    </div>
  );
}
