import React, { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { functions } from '../services/firebase';
import CompanyService from '../services/CompanyService';
import CustomerImport from '../components/CustomerImport';
import SelectControl from '../components/SelectControl';
import { previewCustomers, csvCell } from '../utils/customerCsv';

const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const blankHours = Object.fromEntries(days.map(day => [day, { closed: ['saturday','sunday'].includes(day), open: '09:00', close: '17:00' }]));
const freshDraft = user => ({ currentStep: 1, profile: { name: user?.displayName || '', businessName: '', phone: '', address: '', city: '', state: '', zipCode: '', description: '' }, services: [], timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles', businessHours: blankHours, serviceArea: { method: 'zip', radiusMiles: 25, zipCodes: [] }, invites: [], csvValidated: false });
const steps = ['Company profile', 'Owner & verification', 'Team invitations', 'Services', 'Hours & service area', 'Customer import', 'Review & activate'];
const callable = name => httpsCallable(functions, name);

export default function CompanyOnboardingPage() {
  const { currentUser, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => freshDraft(currentUser));
  const [revision, setRevision] = useState(0), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Loading saved setup…'), [newService, setNewService] = useState(''), [newInvite, setNewInvite] = useState(''), [inviteRole, setInviteRole] = useState('technician');
  const [csv, setCsv] = useState(null), [activeCompany, setActiveCompany] = useState('');
  const timer = useRef(null), state = useRef({ draft, revision, ready });
  useEffect(() => { state.current = { draft, revision, ready }; }, [draft, revision, ready]);

  const persist = useCallback(async next => {
    const current = state.current;
    if (!current.ready) return;
    try {
      const result = await callable('rlSaveCompanyOnboardingDraft')({ draft: next, expectedRevision: state.current.revision });
      setRevision(result.data.revision); setMessage('Setup saved securely. You can resume on another device.');
      return true;
    } catch (error) { setMessage(error.code === 'functions/aborted' ? 'This setup changed in another session. Reload the page to continue with the latest saved version.' : `Could not save setup: ${error.message}`); return false; }
  }, []);

  useEffect(() => {
    let alive = true;
    callable('rlGetCompanyOnboardingDraft')().then(({ data }) => {
      if (!alive) return;
      if (data.activated) { navigate('/company-setup', { replace: true }); return; }
      const base = freshDraft(currentUser); base.profile = { ...base.profile, ...data.profile };
      const loaded = data.draft ? { ...base, ...data.draft, profile: { ...base.profile, ...data.draft.profile }, businessHours: { ...blankHours, ...data.draft.businessHours } } : base;
      setDraft(loaded); setRevision(data.revision || 0); setReady(true); setMessage(data.draft ? 'Your saved setup is ready to continue.' : 'Your setup will save automatically.');
    }).catch(error => { if (alive) { setReady(true); setMessage(error.message || 'Could not load setup.'); } });
    return () => { alive = false; clearTimeout(timer.current); };
  }, [currentUser, navigate]);

  const change = (updater, immediate = false) => {
    setDraft(old => {
      const next = typeof updater === 'function' ? updater(old) : updater;
      clearTimeout(timer.current);
      if (ready) timer.current = setTimeout(() => persist(next), immediate ? 0 : 700);
      return next;
    });
  };
  const setProfile = (key, value) => change(old => ({ ...old, profile: { ...old.profile, [key]: value } }));
  const nextStep = async () => {
    if (draft.currentStep === 1 && (!draft.profile.name.trim() || !draft.profile.businessName.trim())) { setMessage('Enter your name and company name to continue.'); return; }
    if (draft.currentStep === 4 && !draft.services.length) { setMessage('Add at least one service.'); return; }
    const next = { ...draft, currentStep: Math.min(7, draft.currentStep + 1) };
    clearTimeout(timer.current); if (!(await persist(next))) return; setDraft(next);
  };
  const previous = () => change(old => ({ ...old, currentStep: Math.max(1, old.currentStep - 1) }), true);
  const addService = () => { const value = newService.trim(); if (value && !draft.services.some(row => row.toLowerCase() === value.toLowerCase())) { change(old => ({ ...old, services: [...old.services, value].slice(0, 30) }), true); setNewService(''); } };
  const addInvite = () => {
    const email = newInvite.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setMessage('Enter a valid invite email.'); return; }
    if (draft.invites.some(row => row.email === email)) { setMessage('That teammate is already on the list.'); return; }
    change(old => ({ ...old, invites: [...old.invites, { email, role: inviteRole }].slice(0, 50) }), true); setNewInvite('');
  };
  const readCsv = async event => {
    try { const file = event.target.files?.[0]; if (!file) return; const result = previewCustomers(await file.text()); if (result.errors.length) throw new Error(result.errors.slice(0, 3).join(' ')); setCsv(result); setMessage(`${result.customers.length} customer rows validated; ${result.duplicates} duplicate rows in the file will be skipped.`); }
    catch (error) { setCsv(null); setMessage(error.message); }
  };
  const downloadTemplate = () => { const blob = new Blob([[['Name','Email','Phone','Address','City','State','ZIP','Notes'].map(csvCell).join(',')].join('\r\n')], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'route-logistics-customer-template.csv'; a.click(); URL.revokeObjectURL(url); };

  const activate = async () => {
    if (!draft.profile.name.trim() || !draft.profile.businessName.trim() || !draft.services.length) { setMessage('Complete the owner, company, and services steps first.'); return; }
    setBusy(true); setMessage('Activating your company…');
    try {
      clearTimeout(timer.current); if (!(await persist({ ...draft, currentStep: 7 }))) throw new Error('Save the latest setup before activation.');
      const { data } = await callable('rlActivateCompanyOnboarding')();
      setActiveCompany(data.companyId); await refreshSession();
      const area = draft.serviceArea;
      if (draft.profile.address && draft.profile.city && draft.profile.state && draft.profile.zipCode && (area.method === 'radius' || area.zipCodes.length)) {
        try { await callable('rlServiceAreas')({ action: 'save', expectedRevision: 0, settings: { operatingAddress: `${draft.profile.address}, ${draft.profile.city}, ${draft.profile.state} ${draft.profile.zipCode}`, method: area.method, radiusMiles: area.radiusMiles, zipCodes: area.zipCodes, categoryOverrides: [], acceptingNewCustomers: false, publishCoverage: false, allowOutOfAreaRequests: false } }); }
        catch (error) { setMessage(`Company activated. Service-area setup needs a retry in Company Settings: ${error.message}`); }
      }
      const inviteResults = [];
      for (const invite of draft.invites) { const result = await CompanyService.addTeamMember(data.companyId, invite.email, invite.role); inviteResults.push({ ...invite, success: result.success, message: result.success ? 'Invitation created' : result.error }); }
      if (inviteResults.some(row => !row.success)) setMessage(`Company activated. Some invitations need a retry: ${inviteResults.filter(row => !row.success).map(row => `${row.email}: ${row.message}`).join('; ')}`);
      else setMessage(data.alreadyActivated ? 'Your company is active. Setup can be safely retried.' : csv ? 'Company activated. Review the retained CSV preview below, then choose Import customers.' : 'Company activated. Customer import was skipped.');
    } catch (error) { setMessage(error.message || 'Activation failed. Your saved setup is still available to retry.'); }
    finally { setBusy(false); }
  };

  const step = draft.currentStep;
  return <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
    <header><p className="text-sm font-semibold text-primary-700">ROUTE LOGISTICS · COMPANY SETUP</p><h1 className="mt-2 text-3xl font-bold">Set up your workspace</h1><p className="mt-2 text-gray-600">Progress saves to your account and is available when you sign in on another device.</p></header>
    {!activeCompany && <><ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Onboarding steps">{steps.map((name, i) => <li key={name} className={`rounded border p-2 text-sm ${step === i + 1 ? 'border-primary-600 bg-primary-50 font-semibold' : ''}`}><span className="text-gray-500">{i + 1}.</span> {name}</li>)}</ol>
      {step === 1 && <section className="space-y-4 rounded-lg bg-white p-5 shadow"><h2 className="text-xl font-semibold">Company profile</h2>{[['name','Owner name'],['businessName','Company name'],['phone','Company phone'],['address','Operating street address'],['city','City'],['state','State'],['zipCode','ZIP code']].map(([key,label]) => <label key={key} className="block text-sm">{label}{['name','businessName'].includes(key) && ' *'}<input className="input-field mt-1 block w-full" value={draft.profile[key] || ''} onChange={e => setProfile(key,e.target.value)} /></label>)}<label className="block text-sm">Company description<textarea className="input-field mt-1 block w-full" value={draft.profile.description} onChange={e => setProfile('description',e.target.value)} /></label></section>}
      {step === 2 && <section className="space-y-4 rounded-lg bg-white p-5 shadow"><h2 className="text-xl font-semibold">Owner account & email verification</h2><p>Signed in as <strong>{currentUser?.email}</strong>. Email verification is required before the company can be activated or management access is granted.</p><p className="text-sm text-gray-600">Use the verification email sent at signup. If you just verified, refresh your session before continuing.</p><button className="btn-secondary" onClick={() => refreshSession().then(() => setMessage('Session refreshed.'))}>Refresh verification status</button><p>Verified: {currentUser?.emailVerified ? 'Yes' : 'No — verify to continue.'}</p></section>}
      {step === 3 && <section className="space-y-4 rounded-lg bg-white p-5 shadow"><h2 className="text-xl font-semibold">Invite managers and technicians <span className="text-sm font-normal">(optional)</span></h2><p>Invitations are sent after activation using the existing verified-email invitation flow.</p><div className="flex flex-wrap gap-2"><input aria-label="Teammate email" className="input-field" type="email" value={newInvite} onChange={e => setNewInvite(e.target.value)} placeholder="teammate@example.com"/><SelectControl aria-label="Invite role" className="input-field" value={inviteRole} onChange={e => setInviteRole(e.target.value)}><option value="technician">Technician</option><option value="manager">Manager</option></SelectControl><button className="btn-secondary" onClick={addInvite}>Add invite</button></div><ul className="list-disc pl-5">{draft.invites.map(row => <li key={row.email}>{row.email} · {row.role} <button className="underline" onClick={() => change(old => ({ ...old, invites: old.invites.filter(v => v.email !== row.email) }), true)}>Remove</button></li>)}</ul></section>}
      {step === 4 && <section className="space-y-4 rounded-lg bg-white p-5 shadow"><h2 className="text-xl font-semibold">Services provided</h2><p>Add standard or custom service names. You can refine the service catalog later.</p><div className="flex gap-2"><input aria-label="Service name" className="input-field flex-1" value={newService} onChange={e => setNewService(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(),addService())} placeholder="e.g. Pest control"/><button className="btn-secondary" onClick={addService}>Add service</button></div><ul className="list-disc pl-5">{draft.services.map(service => <li key={service}>{service} <button className="underline" onClick={() => change(old => ({ ...old, services: old.services.filter(v => v !== service) }), true)}>Remove</button></li>)}</ul></section>}
      {step === 5 && <section className="space-y-4 rounded-lg bg-white p-5 shadow"><h2 className="text-xl font-semibold">Business hours & service area</h2><label className="block">Company time zone<SelectControl className="input-field mt-1 block w-full" value={draft.timeZone} onChange={e => change(old => ({ ...old, timeZone: e.target.value }))}>{[draft.timeZone,'America/Los_Angeles','America/Denver','America/Chicago','America/New_York','Pacific/Honolulu','America/Anchorage'].filter((v,i,a) => a.indexOf(v)===i).map(zone => <option key={zone}>{zone}</option>)}</SelectControl></label><p className="text-sm text-gray-600">These hours describe the business. Existing scheduling continues to use technician availability.</p><div className="space-y-2">{days.map(day => <div key={day} className="flex flex-wrap items-center gap-3"><span className="w-24 capitalize">{day}</span><label><input type="checkbox" checked={draft.businessHours[day]?.closed || false} onChange={e => change(old => ({ ...old, businessHours: { ...old.businessHours, [day]: { ...old.businessHours[day], closed: e.target.checked } } }))}/> Closed</label>{!draft.businessHours[day]?.closed && <><input aria-label={`${day} opens`} type="time" value={draft.businessHours[day]?.open || '09:00'} onChange={e => change(old => ({ ...old, businessHours: { ...old.businessHours, [day]: { ...old.businessHours[day], open: e.target.value } } }))}/><span>to</span><input aria-label={`${day} closes`} type="time" value={draft.businessHours[day]?.close || '17:00'} onChange={e => change(old => ({ ...old, businessHours: { ...old.businessHours, [day]: { ...old.businessHours[day], close: e.target.value } } }))}/></>}</div>)}</div><fieldset className="space-y-3 border-t pt-4"><legend className="font-medium">Service area (optional)</legend><SelectControl className="input-field" value={draft.serviceArea.method} onChange={e => change(old => ({ ...old, serviceArea: { ...old.serviceArea, method: e.target.value } }))}><option value="zip">ZIP codes</option><option value="radius">Radius</option></SelectControl>{draft.serviceArea.method === 'zip' ? <label className="block">ZIP codes, comma separated<input className="input-field mt-1 block w-full" value={draft.serviceArea.zipCodes.join(', ')} onChange={e => change(old => ({ ...old, serviceArea: { ...old.serviceArea, zipCodes: [...new Set(e.target.value.split(',').map(v => v.trim()).filter(v => /^\d{5}$/.test(v)))] } }))}/></label> : <label className="block">Radius in miles<input className="input-field mt-1 block w-full" type="number" min="0.1" max="300" value={draft.serviceArea.radiusMiles} onChange={e => change(old => ({ ...old, serviceArea: { ...old.serviceArea, radiusMiles: Number(e.target.value) } }))}/></label>}<p className="text-sm text-gray-600">Coverage is saved after activation and does not change existing scheduling eligibility. Address verification may be required.</p></fieldset></section>}
      {step === 6 && <section className="space-y-4 rounded-lg bg-white p-5 shadow"><h2 className="text-xl font-semibold">Import customers <span className="text-sm font-normal">(optional)</span></h2><p>Download a template, then preview and validate a CSV with Name, Email, Phone, Address, City, State, ZIP, and Notes. The validated preview stays available through activation, so the file is selected only once. Existing customers are never overwritten. An interrupted import reports its progress, and a retry safely skips saved records.</p><button className="btn-secondary" onClick={downloadTemplate}>Download sample CSV</button><input aria-label="Customer CSV file" type="file" accept=".csv,text/csv" onChange={readCsv}/>{csv && <div><p>{csv.customers.length} rows validated; {csv.duplicates} duplicate rows removed.</p><ul className="list-disc pl-5">{csv.customers.slice(0,5).map((row,i)=><li key={i}>{row.name} {row.email && `· ${row.email}`}</li>)}</ul></div>}</section>}
      {step === 7 && <section className="space-y-3 rounded-lg bg-white p-5 shadow"><h2 className="text-xl font-semibold">Review & activate</h2><p><strong>{draft.profile.businessName || 'Company name missing'}</strong> · owner {draft.profile.name || 'name missing'}</p><p>Services: {draft.services.join(', ') || 'Add at least one service'}</p><p>Team invitations: {draft.invites.length}; time zone: {draft.timeZone}; customer CSV: {csv ? `${csv.customers.length} validated rows` : 'not selected'}</p><p className="text-sm text-gray-600">Activating creates one company for this verified owner. Retrying activation returns the same company instead of creating a duplicate.</p><button disabled={busy || !currentUser?.emailVerified} className="btn-primary disabled:opacity-50" onClick={activate}>{busy ? 'Activating…' : 'Activate company'}</button></section>}
      <div className="flex justify-between"><button className="btn-secondary" disabled={step === 1 || busy} onClick={previous}>Back</button><button className="btn-primary" disabled={step === 7 || busy || !ready} onClick={nextStep}>Save & continue</button></div></>}
    {activeCompany && <section className="space-y-4 rounded-lg bg-white p-5 shadow"><h2 className="text-xl font-semibold">Workspace activated</h2><p>{message}</p>{csv && <CustomerImport initialPreview={csv} openInitially onComplete={() => setCsv(null)}/>}<button className="btn-primary" onClick={() => navigate('/')}>Open Route Logistics</button></section>}
    <p role="status" className="text-sm text-gray-600">{message}</p>
  </main>;
}
