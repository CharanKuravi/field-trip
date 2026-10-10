'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, downloadCsv } from '../lib/api';

const TABS = ['monitor', 'participants', 'questions', 'integrity', 'settings'];

function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function Pager({ page, pages, onPage }) {
  return (
    <div className="row" style={{ margin: '8px 0 0' }}>
      <button className="sec" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Prev</button>
      <span className="mu" style={{ textAlign: 'center', alignSelf: 'center' }}>Page {page} / {pages}</span>
      <button className="sec" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next ›</button>
    </div>
  );
}

export default function Admin({ onLogout }) {
  const [hs, setHs] = useState(null);
  const [hid, setHid] = useState(null);
  const [tab, setTab] = useState('monitor');
  const [err, setErr] = useState('');

  const loadHacks = useCallback(async (select) => {
    try {
      const list = await api('/admin/hackathons');
      setHs(list); setHid((cur) => select ?? (list.find((h) => h.id === cur) ? cur : list[0]?.id ?? null));
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { loadHacks(); }, [loadHacks]);

  async function newHack() {
    const name = prompt('Hackathon name?');
    if (!name) return;
    try { const h = await api('/admin/hackathons', { method: 'POST', body: { name }, retries: 0 }); setTab('settings'); await loadHacks(h.id); } catch (e) { setErr(e.message); }
  }

  if (!hs) return <div className="center card">{err ? <p className="err">{err}</p> : 'Loading…'}</div>;
  const cur = hs.find((h) => h.id === hid);
  return (
    <div className="wrap">
      <div className="top">
        <h1>Admin Console</h1>
        <div className="row" style={{ flex: 0, margin: 0 }}>
          <select value={hid ?? ''} onChange={(e) => setHid(e.target.value)}>
            {hs.map((h) => <option key={h.id} value={h.id}>{h.name}{h.is_open ? ' ● open' : ''}</option>)}
          </select>
          <button className="sec" onClick={newHack}>+ Hackathon</button>
          <button className="sec" onClick={onLogout}>Logout</button>
        </div>
      </div>
      {err && <p className="err">{err}</p>}
      {cur ? (
        <>
          <div className="tabs">
            {TABS.map((t) => <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
          </div>
          {tab === 'monitor' && <Monitor key={cur.id} h={cur} />}
          {tab === 'participants' && <Participants key={cur.id} h={cur} />}
          {tab === 'questions' && <Questions key={cur.id} h={cur} />}
          {tab === 'integrity' && <Integrity key={cur.id} h={cur} />}
          {tab === 'settings' && <Settings key={cur.id} h={cur} onSaved={() => loadHacks()} />}
        </>
      ) : <div className="card">No hackathon yet. Click <b>+ Hackathon</b> to create one.</div>}
    </div>
  );
}

function Monitor({ h }) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const dq = useDebounced(q);
  const [m, setM] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { setPage(1); }, [dq, st]);
  const load = useCallback(async () => {
    try { setM(await api(`/admin/hackathons/${h.id}/monitor?page=${page}&q=${encodeURIComponent(dq)}&status=${st}`, { retries: 1 })); setErr(''); }
    catch (e) { setErr(e.message); }
  }, [h.id, page, dq, st]);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 6000);       // live refresh, paused while the tab is hidden
    return () => clearInterval(t);
  }, [load]);

  const revokeExam = async (email) => {
    if (!confirm(`Revoke exam attempt for ${email}?\n\nThis will:\n- Clear their submission\n- Reset their score and violations\n- Allow them to retake the exam`)) return;
    try {
      await api(`/admin/participants/${encodeURIComponent(email)}/revoke`, { method: 'POST' });
      alert('Exam attempt revoked successfully! The student can now retake the exam.');
      load();
    } catch (e) { setErr(e.message); }
  };

  const s = m?.summary;
  return (
    <>
      {err && <p className="err">{err}</p>}
      {s && (
        <div className="row" style={{ marginBottom: 12 }}>
          {[['Total', s.total], ['Online now', s.online], ['In progress', s.in_progress], ['Submitted', s.submitted], ['Not started', s.not_started]].map(([k, v]) => (
            <div className="card stat" key={k}><div className="mu">{k}</div><b style={{ fontSize: 22 }}>{v}</b></div>
          ))}
        </div>
      )}
      <div className="card">
        <div className="top">
          <h2>Participants</h2>
          <div className="row" style={{ flex: 0, margin: 0 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / email / college" />
            <select value={st} onChange={(e) => setSt(e.target.value)}>
              <option value="">All</option><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="submitted">Submitted</option>
            </select>
            <button className="sec" onClick={() => downloadCsv(`/admin/hackathons/${h.id}/export.csv`, `hackathon_${h.id}_results.csv`).catch((e) => setErr(e.message))}>Export CSV</button>
          </div>
        </div>
        <div className="scroll">
          <table>
            <thead><tr><th>Email</th><th>Name</th><th>College</th><th>Status</th><th>Score</th><th>Copy/paste</th><th>Tab/screen</th><th>Other</th><th>Violations</th><th>Last seen</th><th>IP</th><th>Actions</th></tr></thead>
            <tbody>
              {(m?.participants || []).map((p) => (
                <tr key={p.pid}>
                  <td className="mono">{p.pid}</td><td>{p.name}</td><td>{p.college}</td>
                  <td>{p.status}{p.auto_submitted && <span className="err"> (auto)</span>}</td>
                  <td>{p.score == null ? '–' : `${p.score}/${p.total} (${p.pct}%)`}</td>
                  <td className={p.copy_paste ? 'v' : ''}>{p.copy_paste || 0}</td>
                  <td className={p.tab_switch ? 'v' : ''}>{p.tab_switch || 0}</td>
                  <td className={p.other ? 'v' : ''}>{p.other || 0}</td>
                  <td className={p.violations ? 'v' : ''}>{p.violations}</td>
                  <td>{p.online ? <span className="ok">● online</span> : p.last_seen ? new Date(p.last_seen).toLocaleTimeString() : '–'}</td>
                  <td className="mono">{p.ip}</td>
                  <td>
                    {p.status === 'submitted' && (
                      <button className="sec" onClick={() => revokeExam(p.pid)} title="Allow student to retake exam">
                        ↻ Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {m && !m.participants.length && <tr><td colSpan={12} className="mu">No matches</td></tr>}
            </tbody>
          </table>
        </div>
        {m && <Pager page={m.page} pages={m.pages} onPage={setPage} />}
      </div>
      <div className="card">
        <h2>Violation log (latest 100)</h2>
        <div className="scroll">
          <table>
            <thead><tr><th>Time</th><th>Participant</th><th>Event</th><th>Detail</th></tr></thead>
            <tbody>
              {(m?.violations || []).map((v, i) => <tr key={i}><td>{new Date(v.at).toLocaleTimeString()}</td><td>{v.pid} {v.name}</td><td>{v.event}</td><td>{v.description}</td></tr>)}
              {m && !m.violations.length && <tr><td colSpan={4} className="mu">None</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Participants({ h }) {
  const blank = { email: '', roll_number: '', name: '', phone: '', college: '' };
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [d, setD] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [allParticipants, setAllParticipants] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const file = useRef(null);

  useEffect(() => { setPage(1); }, [dq]);
  const load = useCallback(async () => {
    try { 
      setD(await api(`/admin/hackathons/${h.id}/participants?page=${page}&q=${encodeURIComponent(dq)}`));
      // Load all participants for duplicate detection
      const allPages = await api(`/admin/hackathons/${h.id}/participants?per=10000`);
      setAllParticipants(allPages.items || []);
      setSelected(new Set());
    }
    catch (e) { setMsg({ bad: true, text: e.message }); }
  }, [h.id, page, dq]);
  useEffect(() => { load(); }, [load]);

  const say = (text, bad = false, extra = []) => setMsg({ text, bad, extra });
  async function add() {
    if (!f.email.trim() || !f.roll_number.trim()) return say('Email and roll number are required', true);
    try { await api(`/admin/hackathons/${h.id}/participants`, { method: 'POST', body: f, retries: 0 }); say(`Added ${f.email.trim().toLowerCase()}`); setF(blank); load(); }
    catch (e) { say(e.message, true); }
  }
  async function upload() {
    const file0 = file.current?.files?.[0];
    if (!file0) return say('Choose an .xlsx or .csv file first', true);
    const fd = new FormData(); fd.append('file', file0); say('Uploading…');
    try {
      const r = await api(`/admin/hackathons/${h.id}/participants/upload`, { method: 'POST', form: fd, retries: 0 });
      say(`${r.created} participant(s) added${r.error_count ? ` · ${r.error_count} row(s) skipped` : ''}`, false, r.errors); load();
    } catch (e) { say(e.message, true); }
  }
  async function changeRoll(p) {
    const v = prompt(`New roll number for ${p.email}?`);
    if (!v || !v.trim()) return;
    try { await api(`/admin/participants/${encodeURIComponent(p.id)}/roll`, { method: 'PUT', body: { roll_number: v }, retries: 0 }); say(`Roll number updated for ${p.email}`); }
    catch (e) { say(e.message, true); }
  }
  async function remove(p) {
    if (!confirm('Delete participant and their data?')) return;
    try { await api(`/admin/participants/${encodeURIComponent(p.id)}`, { method: 'DELETE', retries: 0 }); load(); } catch (e) { say(e.message, true); }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  
  const toggleSelect = (id) => {
    const newSet = new Set(selected);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setSelected(newSet);
  };
  
  const selectAll = () => setSelected(new Set((d?.items || []).map(p => p.id)));
  const deselectAll = () => setSelected(new Set());
  
  async function deleteSelected() {
    if (selected.size === 0) { say('No participants selected', true); return; }
    if (!confirm(`Delete ${selected.size} selected participant(s) and their data?`)) return;
    say(`Deleting ${selected.size} participant(s)...`);
    let deleted = 0, failed = 0;
    for (const id of selected) {
      try { await api(`/admin/participants/${encodeURIComponent(id)}`, { method: 'DELETE', retries: 0 }); deleted++; }
      catch { failed++; }
    }
    say(`${deleted} deleted${failed ? ` · ${failed} failed` : ''}`, failed > 0);
    load();
  }
  
  function findDuplicates() {
    const emailMap = new Map();
    const nameMap = new Map();
    const dups = [];
    
    allParticipants.forEach(p => {
      const email = p.email.toLowerCase();
      const name = p.name.toLowerCase().replace(/\s+/g, ' ').trim();
      
      if (emailMap.has(email)) {
        const existing = emailMap.get(email);
        if (!dups.find(d => d.type === 'email' && d.items.includes(existing))) {
          dups.push({ type: 'email', key: email, items: [existing, p] });
        } else {
          dups.find(d => d.type === 'email' && d.items.includes(existing)).items.push(p);
        }
      } else {
        emailMap.set(email, p);
      }
      
      if (name && name.length > 2) {
        if (nameMap.has(name)) {
          const existing = nameMap.get(name);
          if (!dups.find(d => d.type === 'name' && d.items.includes(existing))) {
            dups.push({ type: 'name', key: name, items: [existing, p] });
          } else {
            const group = dups.find(d => d.type === 'name' && d.items.includes(existing));
            if (!group.items.find(i => i.id === p.id)) group.items.push(p);
          }
        } else {
          nameMap.set(name, p);
        }
      }
    });
    
    setDuplicates(dups);
    if (dups.length === 0) say('No duplicates found');
    else say(`Found ${dups.length} duplicate group(s)`);
  }
  
  function selectDuplicates() {
    const newSet = new Set();
    duplicates.forEach(group => {
      group.items.slice(1).forEach(p => newSet.add(p.id));
    });
    setSelected(newSet);
    say(`Selected ${newSet.size} duplicate(s) (keeping first of each group)`);
  }

  return (
    <>
      <div className="card">
        <h2>Add participant</h2>
        <div className="mu" style={{ marginBottom: 8 }}>Login: <b>email</b> is the username, <b>roll number</b> is the password.</div>
        <div className="row"><input type="email" placeholder="Email (username) *" value={f.email} onChange={set('email')} /><input placeholder="Roll number (password) *" value={f.roll_number} onChange={set('roll_number')} /></div>
        <div className="row"><input placeholder="Full name (optional)" value={f.name} onChange={set('name')} /><input placeholder="Phone (optional)" value={f.phone} onChange={set('phone')} /><input placeholder="College (optional)" value={f.college} onChange={set('college')} /><button onClick={add}>Add</button></div>
        <h2 style={{ marginTop: 14 }}>Bulk upload (Excel or CSV)</h2>
        <div className="row"><input type="file" ref={file} accept=".xlsx,.csv" /><button onClick={upload}>Upload</button></div>
        <div className="mu">First row must have headers: <span className="mono">email, roll_number</span> (optional: <span className="mono">name, phone, college</span>). Or use position: column 1 = username, column 2 = roll number. Thousands of rows are fine.</div>
        {msg && <div style={{ marginTop: 8 }} className={msg.bad ? 'err' : 'ok'}>{msg.text}{(msg.extra || []).map((e, i) => <div key={i} className="err">{e}</div>)}</div>}
      </div>
      <div className="card">
        <div className="top">
          <h2>Participants ({d?.total ?? '…'})</h2>
          <div className="row" style={{ flex: 0, margin: 0, gap: 8 }}>
            <input style={{ maxWidth: 200 }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            <div style={{ position: 'relative' }}>
              <button className="sec" onClick={() => { const menu = document.getElementById('part-select-menu'); menu.style.display = menu.style.display === 'block' ? 'none' : 'block'; }}>
                Select ▼
              </button>
              <div id="part-select-menu" style={{ display: 'none', position: 'absolute', top: '100%', right: 0, background: 'white', border: '1px solid var(--bd)', borderRadius: 4, marginTop: 4, minWidth: 150, zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                <div style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--bd)' }} onClick={() => { selectAll(); document.getElementById('part-select-menu').style.display = 'none'; }}>Select all</div>
                <div style={{ padding: '8px 12px', cursor: 'pointer' }} onClick={() => { deselectAll(); document.getElementById('part-select-menu').style.display = 'none'; }}>Deselect all</div>
              </div>
            </div>
            <button className="sec" onClick={findDuplicates}>Find duplicates</button>
            {duplicates.length > 0 && <button className="sec" onClick={selectDuplicates}>Select duplicates</button>}
            {selected.size > 0 && <button className="del" onClick={deleteSelected}>Delete {selected.size} selected</button>}
          </div>
        </div>
        <div className="mu">Roll numbers are stored hashed and can&apos;t be viewed again. Use Change roll no. to fix a typo.</div>
        {duplicates.length > 0 && (
          <div style={{ padding: '8px 12px', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 4, marginBottom: 8 }}>
            <b>Found {duplicates.length} duplicate group(s):</b>
            {duplicates.slice(0, 10).map((group, i) => (
              <div key={i} style={{ fontSize: 13, marginTop: 4 }}>
                Group {i + 1} ({group.type}): {group.items.length} duplicates - "{group.key.slice(0, 40)}"
              </div>
            ))}
            {duplicates.length > 10 && <div style={{ fontSize: 13, marginTop: 4 }}>...and {duplicates.length - 10} more</div>}
          </div>
        )}
        <div className="scroll">
          <table>
            <thead><tr><th style={{ width: 30 }}><input type="checkbox" onChange={(e) => e.target.checked ? selectAll() : deselectAll()} style={{ cursor: 'pointer' }} /></th><th>Email (username)</th><th>Name</th><th>College</th><th /></tr></thead>
            <tbody>
              {(d?.items || []).map((p) => (
                <tr key={p.id} style={{ background: selected.has(p.id) ? '#fff3e0' : 'transparent' }}>
                  <td><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} style={{ cursor: 'pointer' }} /></td>
                  <td className="mono">{p.email}</td><td>{p.name}</td><td>{p.college}</td>
                  <td><button className="sec" onClick={() => changeRoll(p)}>Change roll no.</button> <button className="del" onClick={() => remove(p)}>✕</button></td>
                </tr>
              ))}
              {d && !d.items.length && <tr><td colSpan={5} className="mu">No participants</td></tr>}
            </tbody>
          </table>
        </div>
        {d && <Pager page={d.page} pages={d.pages} onPage={setPage} />}
      </div>
    </>
  );
}

function Questions({ h }) {
  const blank = { text: '', a: '', b: '', c: '', d: '', correct: 'A', marks: 1 };
  const [f, setF] = useState(blank);
  const [qs, setQs] = useState([]);
  const [msg, setMsg] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [searchDup, setSearchDup] = useState('');
  const [duplicates, setDuplicates] = useState([]);
  const file = useRef(null);

  const load = useCallback(async () => { try { setQs(await api(`/admin/hackathons/${h.id}/questions`)); setSelected(new Set()); } catch (e) { setMsg({ bad: true, text: e.message }); } }, [h.id]);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function add() {
    try { await api(`/admin/hackathons/${h.id}/questions`, { method: 'POST', body: { ...f, marks: +f.marks || 1 }, retries: 0 }); setF(blank); setMsg(null); load(); }
    catch (e) { setMsg({ bad: true, text: e.message }); }
  }
  async function upload() {
    const f0 = file.current?.files?.[0]; if (!f0) return;
    const fd = new FormData(); fd.append('file', f0);
    try { const r = await api(`/admin/hackathons/${h.id}/questions/upload`, { method: 'POST', form: fd, retries: 0 }); setMsg({ text: `${r.created} added${r.skipped_duplicates ? ` · ${r.skipped_duplicates} duplicate(s) skipped` : ''}${r.error_count ? ` · ${r.error_count} row(s) skipped` : ''}`, extra: r.errors }); load(); }
    catch (e) { setMsg({ bad: true, text: e.message }); }
  }
  async function remove(q) {
    if (!confirm('Delete question?')) return;
    try { await api(`/admin/hackathons/${h.id}/questions/${q.id}`, { method: 'DELETE', retries: 0 }); load(); } catch (e) { setMsg({ bad: true, text: e.message }); }
  }
  
  const toggleSelect = (id) => {
    const newSet = new Set(selected);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setSelected(newSet);
  };
  
  const selectAll = () => setSelected(new Set(qs.map(q => q.id)));
  const deselectAll = () => setSelected(new Set());
  
  async function deleteSelected() {
    if (selected.size === 0) { setMsg({ bad: true, text: 'No questions selected' }); return; }
    if (!confirm(`Delete ${selected.size} selected question(s)?`)) return;
    setMsg({ text: `Deleting ${selected.size} question(s)...` });
    let deleted = 0, failed = 0;
    for (const id of selected) {
      try { await api(`/admin/hackathons/${h.id}/questions/${id}`, { method: 'DELETE', retries: 0 }); deleted++; }
      catch { failed++; }
    }
    setMsg({ text: `${deleted} deleted${failed ? ` · ${failed} failed` : ''}`, bad: failed > 0 });
    load();
  }
  
  function findDuplicates() {
    const normalized = new Map();
    const dups = [];
    qs.forEach(q => {
      const key = q.text.toLowerCase().replace(/\s+/g, ' ').trim();
      if (normalized.has(key)) {
        const existing = normalized.get(key);
        if (!dups.find(d => d.includes(existing.id))) {
          dups.push([existing, q]);
        } else {
          dups.find(d => d.includes(existing.id)).push(q);
        }
      } else {
        normalized.set(key, q);
      }
    });
    setDuplicates(dups);
    setSearchDup('found');
    if (dups.length === 0) setMsg({ text: 'No duplicates found' });
    else setMsg({ text: `Found ${dups.length} duplicate group(s)` });
  }
  
  function selectDuplicates() {
    const newSet = new Set();
    duplicates.forEach(group => {
      group.slice(1).forEach(q => newSet.add(q.id));
    });
    setSelected(newSet);
    setMsg({ text: `Selected ${newSet.size} duplicate(s) (keeping first of each group)` });
  }

  return (
    <>
      <div className="card">
        <h2>Add question (MCQ)</h2>
        <div className="row"><textarea rows={2} placeholder="Question text *" value={f.text} onChange={set('text')} style={{ flex: '1 1 100%' }} /></div>
        <div className="row"><input placeholder="Option A" value={f.a} onChange={set('a')} /><input placeholder="Option B" value={f.b} onChange={set('b')} /></div>
        <div className="row"><input placeholder="Option C" value={f.c} onChange={set('c')} /><input placeholder="Option D" value={f.d} onChange={set('d')} /></div>
        <div className="row">
          <select value={f.correct} onChange={set('correct')}><option>A</option><option>B</option><option>C</option><option>D</option></select>
          <input type="number" min="1" placeholder="Marks" value={f.marks} onChange={set('marks')} /><button onClick={add}>Add question</button>
        </div>
        <h2 style={{ marginTop: 14 }}>Bulk upload</h2>
        <div className="row"><input type="file" ref={file} accept=".csv,.xlsx" /><button onClick={upload}>Upload</button></div>
        <div className="mu">Columns in order: <b>1</b> question · <b>2</b> A · <b>3</b> B · <b>4</b> C · <b>5</b> D · <b>6</b> correct (A/B/C/D) · <b>7</b> marks (optional). Header row optional. Upload the full pool; each participant gets {h.questions_per_participant || 'all'} random questions.</div>
        {msg && <div style={{ marginTop: 8 }} className={msg.bad ? 'err' : 'ok'}>{msg.text}{(msg.extra || []).map((e, i) => <div key={i} className="err">{e}</div>)}</div>}
      </div>
      <div className="card">
        <div className="top">
          <h2>Questions ({qs.length}) · {qs.reduce((n, q) => n + q.marks, 0)} marks</h2>
          <div className="row" style={{ flex: 0, margin: 0, gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <button className="sec" onClick={() => { const menu = document.getElementById('select-menu'); menu.style.display = menu.style.display === 'block' ? 'none' : 'block'; }}>
                Select ▼
              </button>
              <div id="select-menu" style={{ display: 'none', position: 'absolute', top: '100%', left: 0, background: 'white', border: '1px solid var(--bd)', borderRadius: 4, marginTop: 4, minWidth: 150, zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                <div style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--bd)' }} onClick={() => { selectAll(); document.getElementById('select-menu').style.display = 'none'; }}>Select all</div>
                <div style={{ padding: '8px 12px', cursor: 'pointer' }} onClick={() => { deselectAll(); document.getElementById('select-menu').style.display = 'none'; }}>Deselect all</div>
              </div>
            </div>
            <button className="sec" onClick={findDuplicates}>Find duplicates</button>
            <button className="sec" onClick={() => window.open(`${API}/admin/hackathons/${hid}/questions/export.csv`, '_blank')}>Export questions</button>
            {duplicates.length > 0 && <button className="sec" onClick={selectDuplicates}>Select duplicates</button>}
            {selected.size > 0 && <button className="del" onClick={deleteSelected}>Delete {selected.size} selected</button>}
          </div>
        </div>
        {duplicates.length > 0 && (
          <div style={{ padding: '8px 12px', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 4, marginBottom: 8 }}>
            <b>Found {duplicates.length} duplicate group(s):</b> {duplicates.map((group, i) => <div key={i} style={{ fontSize: 13, marginTop: 4 }}>Group {i + 1}: {group.length} duplicates of "{group[0].text.slice(0, 50)}..."</div>)}
          </div>
        )}
        {qs.map((q, i) => (
          <div key={q.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--bd)', background: selected.has(q.id) ? '#fff3e0' : 'transparent' }}>
            <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggleSelect(q.id)} style={{ marginRight: 8, cursor: 'pointer' }} />
            <b>{i + 1}. {q.text}</b> <span className="mu">[{q.marks} mk]</span> <button className="del" style={{ float: 'right' }} onClick={() => remove(q)}>✕</button>
            <div className="mu" style={{ marginLeft: 24 }}>{['a', 'b', 'c', 'd'].map((k) => <span key={k} className={q.correct === k.toUpperCase() ? 'ok' : ''} style={{ marginRight: 14 }}>{k.toUpperCase()}) {q[k]}</span>)}</div>
          </div>
        ))}
        {!qs.length && <p className="mu">No questions yet.</p>}
      </div>
    </>
  );
}

function Integrity({ h }) {
  const [r, setR] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api(`/admin/hackathons/${h.id}/integrity`, { retries: 1 }).then(setR).catch((e) => setErr(e.message)); }, [h.id]);
  if (err) return <p className="err">{err}</p>;
  if (!r) return <div className="card">Analysing…</div>;
  const Sec = ({ title, hint, rows }) => (
    <div className="card"><h2>{title}</h2><div className="mu" style={{ marginBottom: 8 }}>{hint}</div>
      {rows.length ? <div className="scroll"><table><tbody>{rows}</tbody></table></div> : <p className="mu">Nothing flagged.</p>}</div>
  );
  return (
    <>
      <Sec title="Similar wrong answers" hint="Pairs who picked the same wrong option on ≥70% of their wrong answers (min 3). Options are shuffled per person, so this is a strong signal. Review manually."
        rows={r.similar_wrong_answers.map((x, i) => <tr key={i}><td>{x.a}</td><td>{x.b}</td><td>{x.shared_wrong} of {x.of} wrong answers identical</td></tr>)} />
      <Sec title="Very fast answering" hint="More than half the answers were given under 2 seconds after the previous one – possible lookup/automation or guessing."
        rows={r.fast_answers.map((x, i) => <tr key={i}><td>{x.who}</td><td>{x.quick} of {x.of} answers under 2s</td></tr>)} />
      <Sec title="Shared IP address" hint="Hint only – students on one college network often share an IP."
        rows={r.shared_ip.map((x, i) => <tr key={i}><td className="mono">{x.ip}</td><td>{x.participants.join(', ')}</td></tr>)} />
    </>
  );
}

function Settings({ h, onSaved }) {
  const [f, setF] = useState({ name: h.name, duration_minutes: h.duration_minutes, negative_marks: h.negative_marks, pass_percentage: h.pass_percentage, max_violations: h.max_violations, questions_per_participant: h.questions_per_participant ?? 30, shuffle: !!h.shuffle, is_open: !!h.is_open });
  const [msg, setMsg] = useState(null);
  const set = (k, num) => (e) => setF({ ...f, [k]: num ? +e.target.value : e.target.value });
  const tick = (k) => (e) => setF({ ...f, [k]: e.target.checked });
  async function save() {
    try { await api(`/admin/hackathons/${h.id}`, { method: 'PUT', body: f, retries: 0 }); setMsg({ text: 'Saved (live within a few seconds)' }); onSaved(); }
    catch (e) { setMsg({ bad: true, text: e.message }); }
  }
  return (
    <div className="card">
      <h2>Settings</h2>
      <div className="row"><label>Name<input value={f.name} onChange={set('name')} /></label><label>Duration (min)<input type="number" value={f.duration_minutes} onChange={set('duration_minutes', true)} /></label></div>
      <div className="row">
        <label>Negative marks / wrong<input type="number" step="0.25" value={f.negative_marks} onChange={set('negative_marks', true)} /></label>
        <label>Pass %<input type="number" value={f.pass_percentage} onChange={set('pass_percentage', true)} /></label>
        <label>Max violations (0 = never auto-submit)<input type="number" value={f.max_violations} onChange={set('max_violations', true)} /></label>
      </div>
      <div className="row">
        <label>Questions per participant (0 = all)<input type="number" min="0" value={f.questions_per_participant} onChange={set('questions_per_participant', true)} /></label>
      </div>
      <div className="row">
        <label><input type="checkbox" checked={f.shuffle} onChange={tick('shuffle')} style={{ minWidth: 0 }} /> Shuffle questions &amp; options per participant</label>
        <label><input type="checkbox" checked={f.is_open} onChange={tick('is_open')} style={{ minWidth: 0 }} /> <b>Open for participants</b></label>
      </div>
      <button onClick={save}>Save</button> {msg && <span className={msg.bad ? 'err' : 'ok'}>{msg.text}</span>}
    </div>
  );
}
