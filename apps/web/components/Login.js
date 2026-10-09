'use client';
import { useState } from 'react';
import { api, store } from '../lib/api';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('p');
  const [u, setU] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(false);
  const isP = mode === 'p';

  async function go(e) {
    e.preventDefault();
    setErr(''); setBusy(true); setQueued(false);
    try {
      const d = isP
        ? await api('/login', { method: 'POST', body: { email: u, password: pw }, retries: 25, onBusy: setQueued })   // auto-retries while the server is busy
        : await api('/admin/login', { method: 'POST', body: { username: u, password: pw }, retries: 0 });
      store.set('tok', d.token); store.set('role', isP ? 'participant' : 'admin');
      onLogin(isP ? 'participant' : 'admin');
    } catch (x) { setErr(x.message); }
    finally { setBusy(false); setQueued(false); }
  }

  const pick = (m) => { setMode(m); setU(''); setPw(''); setErr(''); };
  return (
    <form className="center card" onSubmit={go}>
      <h1>Proctor Tool</h1>
      <div className="tabs">
        <button type="button" className={isP ? 'on' : ''} onClick={() => pick('p')}>Participant</button>
        <button type="button" className={!isP ? 'on' : ''} onClick={() => pick('a')}>Admin</button>
      </div>
      <div className="row"><input value={u} onChange={(e) => setU(e.target.value)} type={isP ? 'email' : 'text'} autoComplete="username" placeholder={isP ? 'Email' : 'Admin username'} required /></div>
      <div className="row"><input value={pw} onChange={(e) => setPw(e.target.value)} type="password" autoComplete="current-password" placeholder={isP ? 'Roll number' : 'Password'} required /></div>
      <button type="submit" style={{ width: '100%' }} disabled={busy}>{busy ? (queued ? 'Server is busy – you are in the queue…' : 'Signing in…') : 'Sign in'}</button>
      {queued && <p className="mu">Lots of students are signing in. Please keep this page open – we will retry automatically.</p>}
      <p className="err">{err}</p>
    </form>
  );
}
