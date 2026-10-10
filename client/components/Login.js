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
    <>
      <form className="center card" onSubmit={go}>
        <div className="brand">
          <img src="https://aws-codeathon-at-gist-site.vercel.app/assets/aws-logo.png" alt="AWS" />
          <span className="ribbon" style={{ margin: 0 }}>AWS CLUB | GIST</span>
        </div>
        <h1><span className="hl">AWS Codeathon</span> 2K26</h1>
        <p className="tagline">Learn | Build | Innovate on the cloud</p>
        {mode === 'a' ? (
          <>
            <h2 style={{ marginTop: 20, marginBottom: 10 }}>Admin Login</h2>
            <div className="row"><input value={u} onChange={(e) => setU(e.target.value)} type="text" autoComplete="username" placeholder="Admin username" required /></div>
            <div className="row"><input value={pw} onChange={(e) => setPw(e.target.value)} type="password" autoComplete="current-password" placeholder="Password" required /></div>
            <button type="submit" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in →'}</button>
          </>
        ) : (
          <>
            <div className="row"><input value={u} onChange={(e) => setU(e.target.value)} type="text" autoComplete="username" placeholder="Username" required /></div>
            <div className="row"><input value={pw} onChange={(e) => setPw(e.target.value)} type="password" autoComplete="current-password" placeholder="Password" required /></div>
            <button type="submit" style={{ width: '100%' }} disabled={busy}>{busy ? (queued ? 'Server is busy – you are in the queue…' : 'Signing in…') : 'Sign in →'}</button>
            {queued && <p className="mu">Lots of students are signing in. Please keep this page open – we will retry automatically.</p>}
          </>
        )}
        <p className="err">{err}</p>
      </form>
      
      {/* Secret Admin Access - Black dot at bottom right */}
      <div 
        onClick={() => pick('a')}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          backgroundColor: mode === 'a' ? '#ff6b6b' : '#000',
          cursor: 'pointer',
          opacity: 0.3,
          transition: 'all 0.3s ease',
          zIndex: 9999
        }}
        onMouseEnter={(e) => e.target.style.opacity = '0.8'}
        onMouseLeave={(e) => e.target.style.opacity = '0.3'}
        title={mode === 'a' ? 'Back to Participant' : 'Admin Access'}
      />
    </>
  );
}
