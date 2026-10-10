'use client';
import { useEffect, useState } from 'react';
import { store, setAuthLostHandler } from '../lib/api';
import Login from '../components/Login';
import Admin from '../components/Admin';
import Participant from '../components/Participant';

export default function Page() {
  const [role, setRole] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const tok = store.get('tok'), r = store.get('role');
    setRole(tok && r ? r : null);
    setAuthLostHandler(() => { store.clear(); setRole(null); });
    setReady(true);
  }, []);

  const logout = () => { store.clear(); setRole(null); };
  if (!ready) return null;
  if (!role) return <Login onLogin={setRole} />;
  return role === 'admin' ? <Admin onLogout={logout} /> : <Participant onLogout={logout} />;
}
