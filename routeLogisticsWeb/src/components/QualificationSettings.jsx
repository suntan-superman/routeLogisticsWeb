import { useEffect, useMemo, useState } from 'react';
import { callWorkspace } from '../services/workspaceApi';
import { getSchedulingRoster } from '../services/schedulingService';
import SelectControl from './SelectControl';

const today = () => new Date().toISOString().slice(0, 10);
const blankCatalog = { id: '', name: '', description: '', type: 'internal_skill', active: true, tracksExpiration: false };
const blankStaff = { memberId: '', qualificationId: '', effectiveDate: today(), expiresAt: '', credentialReference: '', internalNotes: '', verificationStatus: 'management_recorded', active: true };
const field = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-200';
const button = 'rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50';

export default function QualificationSettings({ company, mode = 'services' }) {
  const [data, setData] = useState({ catalog: [], staff: [], requirements: [] });
  const [roster, setRoster] = useState([]);
  const [catalog, setCatalog] = useState(blankCatalog);
  const [staff, setStaff] = useState(blankStaff);
  const [serviceName, setServiceName] = useState('');
  const [selected, setSelected] = useState([]);
  const [attention, setAttention] = useState([]);
  const [nextAttentionPage, setNextAttentionPage] = useState(null);
  const [attentionLoaded, setAttentionLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const services = useMemo(() => [...new Set([...(company?.serviceCategories || []), ...(company?.services || [])].filter(item => typeof item === 'string' && item.trim()))], [company]);
  const active = data.catalog.filter(item => item.active);
  async function load() {
    const [result, people] = await Promise.all([callWorkspace('rlQualifications', { action: 'list', companyId: company.id }), getSchedulingRoster(company.id)]);
    setData({ catalog: result?.catalog || [], staff: result?.staff || [], requirements: result?.requirements || [] });
    setRoster(people.technicians || []);
  }
  useEffect(() => { if (!company?.id) return; let cancelled = false; Promise.all([callWorkspace('rlQualifications', { action: 'list', companyId: company.id }), getSchedulingRoster(company.id)]).then(([result, people]) => { if (!cancelled) { setData({ catalog: result?.catalog || [], staff: result?.staff || [], requirements: result?.requirements || [] }); setRoster(people?.technicians || []); } }).catch(failure => { if (!cancelled) setError(failure.message || 'Qualifications could not be loaded.'); }); return () => { cancelled = true; }; }, [company?.id]);
  useEffect(() => { const current = data.requirements.find(row => row.serviceKey === serviceName.trim().toLowerCase().replace(/\s+/g, ' ')); setSelected(current?.qualificationIds || []); }, [serviceName, data.requirements]);
  async function save(action, payload, after) {
    setBusy(true); setMessage(''); setError('');
    try { await callWorkspace('rlQualifications', { action, companyId: company.id, ...payload }); await load(); setAttention([]); setAttentionLoaded(false); setNextAttentionPage(null); after?.(); setMessage('Saved. Existing appointments remain unchanged; review future assignment warnings below.'); }
    catch (failure) { setError(failure.message || 'The change was not saved.'); }
    finally { setBusy(false); }
  }
  async function refreshAttention(afterJobId = null) {
    setBusy(true); setError('');
    try { const result = await callWorkspace('rlQualifications', { action: 'attention', companyId: company.id, ...(afterJobId ? { afterJobId } : {}) }); setAttention(old => afterJobId ? [...old, ...(result.attention || [])] : result.attention || []); setNextAttentionPage(result.nextAfterJobId || null); setAttentionLoaded(true); }
    catch (failure) { setError(failure.message || 'Future assignments could not be checked.'); }
    finally { setBusy(false); }
  }
  if (!company?.id) return null;
  return <section aria-label="Technician qualifications" className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
    <div><h3 className="font-semibold">Technician qualifications</h3><p className="text-sm text-gray-600">Company-defined skills, training and credentials. Management verification is an internal record; it does not certify a professional license.</p></div>
    {error && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}{message && <p role="status" className="rounded bg-emerald-50 p-2 text-sm text-emerald-900">{message}</p>}
    {(mode === 'services' || mode === 'all') && <>
      <div className="grid gap-3 rounded-lg border bg-white p-3 sm:grid-cols-2"><h4 className="sm:col-span-2 font-medium">Company qualification catalog</h4>
        <label className="text-sm">Name<input className={`${field} mt-1 w-full`} value={catalog.name} onChange={event => setCatalog(old => ({ ...old, name: event.target.value }))} maxLength={120}/></label>
        <label className="text-sm">Type<SelectControl className={`${field} mt-1 w-full`} value={catalog.type} onChange={event => setCatalog(old => ({ ...old, type: event.target.value }))}><option value="internal_skill">Internal skill</option><option value="training">Training</option><option value="external_credential">Externally issued credential</option></SelectControl></label>
        <label className="sm:col-span-2 text-sm">Description<input className={`${field} mt-1 w-full`} value={catalog.description} onChange={event => setCatalog(old => ({ ...old, description: event.target.value }))} maxLength={500}/></label>
        <label className="text-sm"><input type="checkbox" checked={catalog.active} onChange={event => setCatalog(old => ({ ...old, active: event.target.checked }))}/> Active</label>
        <label className="text-sm"><input type="checkbox" checked={catalog.tracksExpiration} onChange={event => setCatalog(old => ({ ...old, tracksExpiration: event.target.checked }))}/> Expiration required</label>
        <div className="sm:col-span-2 flex gap-2"><button className={button} disabled={busy || !catalog.name.trim()} onClick={() => save('catalog-save', catalog, () => setCatalog(blankCatalog))}>{catalog.id ? 'Save qualification' : 'Add qualification'}</button>{catalog.id && <button className={field} onClick={() => setCatalog(blankCatalog)}>Cancel edit</button>}</div>
        {!!data.catalog.length && <div className="sm:col-span-2 flex flex-wrap gap-2">{data.catalog.map(item => <button key={item.id} className={`${field} ${item.active ? '' : 'opacity-60'}`} onClick={() => setCatalog({ ...item })}>{item.name}{item.active ? '' : ' · inactive'}</button>)}</div>}
      </div>
      <div className="space-y-3 rounded-lg border bg-white p-3"><h4 className="font-medium">Required qualifications by service</h4><p className="text-xs text-gray-600">Only the selected company service is changed. Services without requirements remain unrestricted.</p><label className="block text-sm">Company service<SelectControl className={`${field} mt-1 w-full`} value={serviceName} onChange={event => setServiceName(event.target.value)}><option value="">Choose a service</option>{services.map(name => <option key={name}>{name}</option>)}</SelectControl></label>{serviceName && <><div className="grid gap-2 sm:grid-cols-2">{active.map(item => <label key={item.id} className="text-sm"><input type="checkbox" checked={selected.includes(item.id)} onChange={event => setSelected(old => event.target.checked ? [...old, item.id] : old.filter(id => id !== item.id))}/> {item.name}</label>)}</div><button className={button} disabled={busy} onClick={() => save('requirements-save', { serviceName, qualificationIds: selected })}>Save service requirements</button></>}</div>
    </>}
    {(mode === 'team' || mode === 'all') && <>
      <div className="grid gap-3 rounded-lg border bg-white p-3 sm:grid-cols-2"><h4 className="sm:col-span-2 font-medium">Team qualification record</h4>
        <label className="text-sm">Team member<SelectControl className={`${field} mt-1 w-full`} value={staff.memberId} onChange={event => setStaff(old => ({ ...old, memberId: event.target.value }))}><option value="">Choose staff</option>{roster.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</SelectControl></label>
        <label className="text-sm">Qualification<SelectControl className={`${field} mt-1 w-full`} value={staff.qualificationId} onChange={event => setStaff(old => ({ ...old, qualificationId: event.target.value }))}><option value="">Choose qualification</option>{data.catalog.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectControl></label>
        <label className="text-sm">Effective date<input type="date" className={`${field} mt-1 w-full`} value={staff.effectiveDate} onChange={event => setStaff(old => ({ ...old, effectiveDate: event.target.value }))}/></label>
        <label className="text-sm">Expiration date<input type="date" className={`${field} mt-1 w-full`} value={staff.expiresAt || ''} onChange={event => setStaff(old => ({ ...old, expiresAt: event.target.value }))}/></label>
        <label className="text-sm">Management verification<SelectControl className={`${field} mt-1 w-full`} value={staff.verificationStatus} onChange={event => setStaff(old => ({ ...old, verificationStatus: event.target.value }))}><option value="management_recorded">Recorded by management</option><option value="management_verified">Verified by management</option></SelectControl></label>
        <label className="text-sm">Credential reference (internal)<input className={`${field} mt-1 w-full`} value={staff.credentialReference} onChange={event => setStaff(old => ({ ...old, credentialReference: event.target.value }))} maxLength={200}/></label>
        <label className="sm:col-span-2 text-sm">Management notes (internal)<input className={`${field} mt-1 w-full`} value={staff.internalNotes} onChange={event => setStaff(old => ({ ...old, internalNotes: event.target.value }))} maxLength={1000}/></label>
        <label className="text-sm"><input type="checkbox" checked={staff.active} onChange={event => setStaff(old => ({ ...old, active: event.target.checked }))}/> Active record</label>
        <div className="sm:col-span-2 flex gap-2"><button className={button} disabled={busy || !staff.memberId || !staff.qualificationId || !staff.effectiveDate} onClick={() => save('staff-save', staff, () => setStaff(blankStaff))}>Save team qualification</button><button className={field} onClick={() => setStaff(blankStaff)}>Clear form</button></div>
        {!!data.staff.length && <div className="sm:col-span-2 space-y-1">{data.staff.map(row => { const item = data.catalog.find(q => q.id === row.qualificationId), person = roster.find(p => p.id === row.memberId), expired = row.expiresAt && row.expiresAt < today(), expiring = row.expiresAt && !expired && row.expiresAt <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10); return <button key={row.id} className={`block w-full rounded border px-2 py-1 text-left text-sm ${expired || !row.active ? 'border-red-200 text-red-800' : expiring ? 'border-amber-200 text-amber-800' : ''}`} onClick={() => setStaff({ ...row })}>{person?.name || row.memberId} · {item?.name || 'Qualification'} · {!row.active ? 'Revoked' : expired ? 'Expired' : expiring ? 'Expiring' : 'Valid'}{row.expiresAt ? ` · through ${row.expiresAt}` : ''}</button>; })}</div>}
      </div>
      <div className="space-y-2 rounded-lg border bg-white p-3"><h4 className="font-medium">Future assignments needing review</h4><button className={field} disabled={busy} onClick={() => refreshAttention()}>Check upcoming jobs</button>{!attention.length && <p className="text-sm text-gray-600">{attentionLoaded ? 'No qualification warnings in the checked jobs.' : 'No qualification warnings loaded.'} Existing jobs are never changed automatically.</p>}{attention.map(row => <p key={row.jobId} className="text-sm text-amber-800"><a className="underline" href={`/jobs?jobId=${encodeURIComponent(row.jobId)}`}>{row.date} · Open job</a> — {row.reason}</p>)}{nextAttentionPage && <button className={field} disabled={busy} onClick={() => refreshAttention(nextAttentionPage)}>Check next 100 jobs</button>}</div>
    </>}
  </section>;
}
