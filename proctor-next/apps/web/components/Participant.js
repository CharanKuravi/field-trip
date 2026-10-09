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
        <h1>Exam submitted</h1>
        <p style={{ fontSize: 28, margin: '8px 0' }}><b>{r.score} / {r.total}</b></p>
        <p className={r.passed ? 'ok' : 'err'}>{r.passed ? 'Passed' : 'Did not meet pass mark'}</p>
        <p className="mu">Violations recorded: {r.violations}{r.auto_submitted ? ' · auto-submitted' : ''}</p>
        <button onClick={onLogout}>Logout</button>
      </div>
    );
  }

  return (
    <div className="center card" style={{ maxWidth: 560 }}>
      <h1>{me.hackathon}</h1>
      <p className="mu">{me.name} · <span className="mono">{me.pid}</span></p>
      <p><b>{me.questions}</b> questions · <b>{me.duration_minutes}</b> minutes</p>
      <ul>
        <li>The exam runs in <b>fullscreen</b>. Leaving fullscreen, switching tabs or windows, or losing focus is recorded as a violation.</li>
        <li>Right-click, copy, paste and common shortcuts are disabled.</li>
        <li><b>{me.max_violations || '∞'} violations</b> = automatic submission.</li>
        <li>The timer is controlled by the server. Refreshing will not reset it.</li>
      </ul>
      {!me.is_open && <p className="err">This exam is not open yet. Keep this page open – it unlocks automatically.</p>}
      <button style={{ width: '100%' }} disabled={!me.is_open || starting} onClick={begin}>
        {starting ? 'Starting…' : me.status === 'in_progress' ? 'Resume exam' : 'Enter fullscreen & begin'}
      </button>
      <button className="sec" style={{ width: '100%', marginTop: 8 }} onClick={onLogout}>Logout</button>
      <p className="err">{err}</p>
    </div>
  );
}
