import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getClaims } from '../services/tenancy';
import { readWorkspace, callWorkspace } from '../services/workspaceApi';
import JobPhotos from '../components/JobPhotos';
import ServiceChecklist from '../components/ServiceChecklist';
import JobApplicationLog from '../components/JobApplicationLog';
import WorkLocation from '../components/WorkLocation';
import { readWorkQueue, updateWorkQueue, settleWorkOperation } from '../utils/workQueue';
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const navigation = address => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
export default function MyWorkPage() {
  const { currentUser, company, role } = useAuth();
  const claims = getClaims();
  const scope = `rl-my-work-v2:${currentUser.uid}:${claims?.companyId || 'solo'}:${role}:${claims?.membershipId || ''}`;
  const [date, setDate] = useState(localDate), [jobs, setJobs] = useState([]), [selected, setSelected] = useState(null), [customer, setCustomer] = useState(null);
  const [route, setRoute] = useState([]), [queue, setQueue] = useState(() => readWorkQueue(localStorage, `${scope}:queue`));
  const synchronizing = useRef(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [notes, setNotes] = useState('');
  const persist = async change => { const rows = await updateWorkQueue(localStorage, `${scope}:queue`, change); setQueue(rows); return rows; };
  const load = useCallback(async () => {
    setBusy(true); setMessage('');
    try {
      const result = await readWorkspace('jobs', { date, limit: 500 });
      setJobs(result.jobs); localStorage.setItem(`${scope}:jobs:${date}`, JSON.stringify(result.jobs));
      if (result.hasMore) setMessage('Showing the first 500 assigned jobs.');
      if (claims?.companyId) {
        const data = await callWorkspace('rlGetDailyRoute', { memberId: claims.membershipId || currentUser.uid, date });
        const ids = data.saved?.jobIds || [];
        const stops = [...data.stops].sort((a,b) => (ids.includes(a.id) ? ids.indexOf(a.id) : 10000) - (ids.includes(b.id) ? ids.indexOf(b.id) : 10000));
        setRoute(stops); localStorage.setItem(`${scope}:route:${date}`, JSON.stringify(stops));
      }
    } catch (e) {
      if (!navigator.onLine) { setJobs(JSON.parse(localStorage.getItem(`${scope}:jobs:${date}`) || '[]')); setRoute(JSON.parse(localStorage.getItem(`${scope}:route:${date}`) || '[]')); setMessage('Offline: showing your saved assigned work. Updates will be checked again when you reconnect.'); }
      else { setJobs([]); setRoute([]); setSelected(null); setCustomer(null); setMessage(e.message); }
    } finally { setBusy(false); }
  }, [date, scope, claims?.companyId, claims?.membershipId, currentUser.uid]);
  useEffect(() => { setSelected(null); setCustomer(null); load(); }, [load]);
  const open = async job => {
    setMessage('');
    try {
      let result;
      if (navigator.onLine) { result = await readWorkspace('jobs', { id: job.id }); localStorage.setItem(`${scope}:detail:${job.id}`, JSON.stringify(result)); }
      else result = JSON.parse(localStorage.getItem(`${scope}:detail:${job.id}`) || 'null') || { job, customer: null };
      setSelected(result.job); setCustomer(result.customer); setNotes(result.job.notes || '');
    } catch (e) { setSelected(null); setCustomer(null); setMessage(e.message); }
  };
  const sync = useCallback(() => {
    if (synchronizing.current) return synchronizing.current;
    const drain = async () => {
      if (!navigator.onLine) return;
      for (let sent = 0; sent < 100; sent++) {
        const row = readWorkQueue(localStorage, `${scope}:queue`).find(item => item.state === 'pending');
        if (!row) break;
        let result;
        try {
          result = await callWorkspace('rlApplyJobOperation', { operationId: row.id, jobId: row.jobId, patch: row.patch, expectedVersion: row.expectedVersion });
          result.message = result.status === 'conflict' ? 'Job changed. Reopen it and review before making another update.' : '';
        } catch (e) { if (['functions/unavailable','functions/deadline-exceeded'].includes(e.code)) break; result = { status: 'failed', message: e.message }; }
        setQueue(await updateWorkQueue(localStorage, `${scope}:queue`, rows => settleWorkOperation(rows, row.id, result)));
      }
    };
    synchronizing.current = drain().finally(() => { synchronizing.current = null; });
    return synchronizing.current;
  }, [scope]);
  useEffect(() => { sync(); const reconnect = () => { sync().then(load); }; window.addEventListener('online', reconnect); return () => window.removeEventListener('online', reconnect); }, [sync, load]);
  const work = async status => {
    if (!selected) return;
    if (queue.some(row => row.jobId === selected.id && ['failed','conflict'].includes(row.state))) { setMessage('Review the failed or conflicting change before submitting another update.'); return; }
    try {
      const patch = { notes, ...(status ? { status } : {}), ...(status === 'completed' ? { completedAt: new Date().toISOString(), completionNotes: notes } : {}) };
      await persist(rows => [...rows, { id: crypto.randomUUID(), jobId: selected.id, expectedVersion: selected.updatedAt || null, patch, state: 'pending' }]);
      await sync(); await load(); setSelected(null); setCustomer(null);
    } catch (e) { setMessage(e.message); }
  };
  return <div className="space-y-5"><header><h1 className="text-2xl font-bold">My Work</h1><p>{company?.name} · Assigned field work</p></header>
    <div className="flex gap-3"><label>Service date <input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><button className="underline" disabled={busy} onClick={load}>Refresh work</button></div>
    {message && <p role="status" className="rounded border p-3">{message}</p>}
    <section className="rounded border bg-white p-4"><h2 className="text-lg font-semibold">My daily route</h2><p className="text-sm text-gray-600">Stop order is managed by dispatch.</p>{route.length ? <ol className="mt-3 space-y-2">{route.map((stop,index) => <li key={stop.id}>{index+1}. {stop.customerName} · {stop.time} <a className="underline" href={navigation(stop.address)} target="_blank" rel="noreferrer">Navigate</a></li>)}</ol> : <p>No route stops for this date.</p>}</section>
    <section className="grid gap-3 md:grid-cols-2">{jobs.map(job => <button key={job.id} onClick={() => open(job)} className="rounded border bg-white p-4 text-left"><strong>{job.serviceType || job.title}</strong><p>{job.customerName}</p><p>{job.time} · {job.status}</p><p className="text-sm">{job.address}</p></button>)}{!busy && !jobs.length && <p>No assigned jobs for this date.</p>}</section>
    {selected && <section className="space-y-5 rounded border bg-white p-5"><div className="flex justify-between"><h2 className="text-xl font-semibold">{selected.serviceType}</h2><button className="underline" onClick={() => setSelected(null)}>Close job</button></div><p>{customer?.name || selected.customerName} · {customer?.phone || customer?.phoneNumber || selected.customerPhone}</p><p>{selected.address || customer?.address}</p>{customer?.serviceInstructions && <p>{customer.serviceInstructions}</p>}<a className="underline" href={navigation(selected.address || customer?.address || '')} target="_blank" rel="noreferrer">Open navigation</a>
      <label className="block">Work notes<textarea className="input-field mt-1 block w-full" value={notes} onChange={e => setNotes(e.target.value)} /></label>
      {!['completed','cancelled'].includes(selected.status) && <div className="flex flex-wrap gap-3"><button className="btn-secondary" onClick={() => work()}>Save notes</button>{selected.status === 'scheduled' && <button className="btn-secondary" onClick={() => work('en-route')}>En route</button>}{['scheduled','en-route'].includes(selected.status) && <button className="btn-primary" onClick={() => work('in-progress')}>Start work</button>}<button className="btn-primary" onClick={() => work('completed')}>Complete job</button></div>}
      <WorkLocation job={selected} /><JobPhotos job={selected} /><ServiceChecklist key={selected.id} job={selected} /><JobApplicationLog job={selected} />
    </section>}
    <section className="space-y-2"><h2 className="font-semibold">Saved work · {queue.filter(row => row.state === 'pending').length} awaiting sync</h2><button className="underline" onClick={() => sync().then(load)}>Synchronize now</button>{queue.filter(row => row.state !== 'synced').map(row => <div key={row.id} className="rounded border p-3"><p>{row.state}: {row.message || 'Saved on this device'}</p>{['failed','conflict'].includes(row.state) && <button className="underline" onClick={() => { if (window.confirm('Discard this local change? Your other saved work is retained.')) persist(rows => rows.filter(item => item.id !== row.id)).catch(e => setMessage(e.message)); }}>Discard after review</button>}</div>)}</section>
  </div>;
}
