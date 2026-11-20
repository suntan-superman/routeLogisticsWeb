import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { functions } from '../services/firebase';
import CompanyService from '../services/companyService';
import CustomerImport from '../components/CustomerImport';
import SelectControl from '../components/SelectControl';
import TimeSelect from '../components/TimeSelect';
import ServiceAreasSettings from '../components/ServiceAreasSettings';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { previewCustomers, csvCell } from '../utils/customerCsv';
import { mayReviewCompanySetup } from '../utils/companySetupAccess';
import { formatPhone, displayPhone } from '../utils/format';

const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const usStates = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],
  ['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],
  ['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],
  ['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],
  ['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
  ['AS','American Samoa'],['GU','Guam'],['MP','Northern Mariana Islands'],['PR','Puerto Rico'],['VI','U.S. Virgin Islands'],
];
const blankHours = Object.fromEntries(days.map(day => [day, { closed: ['saturday','sunday'].includes(day), open: '09:00', close: '17:00' }]));
const freshDraft = user => ({ currentStep: 1, profile: { name: user?.displayName || '', businessName: '', phone: '', address: '', city: '', state: '', zipCode: '', description: '' }, services: [], timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles', businessHours: blankHours, serviceArea: { method: 'zip', radiusMiles: 25, zipCodes: [] }, invites: [] });
const onboardingSteps = ['Company information', 'Owner & verification', 'Team invitations', 'Services provided', 'Hours & service areas', 'Customer import', 'Review & activate'];
const reviewSteps = ['Company information', 'Owner & access', 'Team', 'Services provided', 'Hours & service areas', 'Customer import', 'Review setup'];
const callable = name => httpsCallable(functions, name);
const snapshotSections = draft => ({
  profile: JSON.stringify({ businessName: draft.profile.businessName, phone: draft.profile.phone, address: draft.profile.address, city: draft.profile.city, state: draft.profile.state, zipCode: draft.profile.zipCode, description: draft.profile.description }),
  services: JSON.stringify(draft.services),
  hours: JSON.stringify({ timeZone: draft.timeZone, businessHours: draft.businessHours }),
});

export default function CompanyOnboardingPage({ mode = 'new' }) {
  const reviewMode = mode === 'review';
  const { currentUser, refreshSession, logout, role, company } = useAuth();
  const reviewRole = reviewMode ? role : null;
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => freshDraft(currentUser));
  const [revision, setRevision] = useState(0), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(reviewMode ? 'Loading current company setup…' : 'Loading saved setup…');
  const [newService, setNewService] = useState(''), [newInvite, setNewInvite] = useState(''), [inviteRole, setInviteRole] = useState('technician');
  const [csv, setCsv] = useState(null), [activeCompany, setActiveCompany] = useState(''), [team, setTeam] = useState([]), [accessDenied, setAccessDenied] = useState(false);
  const [savedSections, setSavedSections] = useState(null);
  const timer = useRef(null), saveQueue = useRef(Promise.resolve()), state = useRef({ draft, revision, ready });
  useEffect(() => { state.current = { draft, revision, ready }; }, [draft, revision, ready]);
  const currentSections = useMemo(() => snapshotSections(draft), [draft]);
  const reviewDirty = reviewMode && !!savedSections && Object.keys(currentSections).some(key => currentSections[key] !== savedSections[key]);
  useUnsavedChanges(reviewDirty, { message: 'You have unsaved company setup changes. Leave without saving them?', scope: 'company-setup-review' });

  const persist = useCallback(next => {
    if (!state.current.ready || reviewMode) return Promise.resolve(reviewMode);
    const save = async () => {
      try {
        const result = await callable('rlSaveCompanyOnboardingDraft')({ draft: next, expectedRevision: state.current.revision });
        state.current.revision = result.data.revision;
        setRevision(result.data.revision); setMessage('Setup saved securely. You can resume on another device.');
        return true;
      } catch (error) {
        setMessage(error.code === 'functions/aborted' ? 'This setup changed in another session. Reload the page to continue with the latest saved version.' : `Could not save setup: ${error.message}`);
        return false;
      }
    };
    const pending = saveQueue.current.then(save, save);
    saveQueue.current = pending.then(() => undefined, () => undefined);
    return pending;
  }, [reviewMode]);

  useEffect(() => {
    let alive = true;
    if (reviewMode && !mayReviewCompanySetup(reviewRole)) {
      setAccessDenied(true); setReady(true); setMessage('Only the company owner or an administrator can review company setup.');
      return () => { alive = false; };
    }
    const request = reviewMode ? callable('rlCompanySetupReview')({ action: 'get' }) : callable('rlGetCompanyOnboardingDraft')();
    request.then(({ data }) => {
      if (!alive) return;
      if (!reviewMode && data.activated) { navigate('/company-setup', { replace: true }); return; }
      const base = freshDraft(currentUser);
      const loaded = reviewMode
        ? { ...base, profile: { ...base.profile, ...data.profile }, services: data.services || [], timeZone: data.timeZone || base.timeZone, businessHours: { ...blankHours, ...data.businessHours } }
        : data.draft ? { ...base, ...data.draft, profile: { ...base.profile, ...data.profile, ...data.draft.profile }, businessHours: { ...blankHours, ...data.draft.businessHours } } : { ...base, profile: { ...base.profile, ...data.profile } };
      setDraft(loaded); setRevision(data.revision || 0); setTeam(data.team || []); setSavedSections(snapshotSections(loaded)); setReady(true);
      setMessage(reviewMode ? 'Current company setup loaded. Save only the sections you intentionally change.' : data.draft ? 'Your saved setup is ready to continue.' : 'Your setup will save automatically.');
    }).catch(error => { if (alive) { setReady(true); setMessage(error.message || 'Could not load setup.'); } });
    return () => { alive = false; clearTimeout(timer.current); };
  }, [currentUser, navigate, reviewMode, reviewRole]);

  const change = (updater, immediate = false) => {
    setDraft(old => {
      const next = typeof updater === 'function' ? updater(old) : updater;
      clearTimeout(timer.current);
      if (!reviewMode && ready) timer.current = setTimeout(() => persist(next), immediate ? 0 : 700);
      return next;
    });
  };
  const setProfile = (key, value) => change(old => ({ ...old, profile: { ...old.profile, [key]: key === 'phone' ? formatPhone(value) : value } }));
  const sectionDirty = section => !!savedSections && currentSections[section] !== savedSections[section];
  const saveReviewSection = async section => {
    if (!reviewMode || busy || !sectionDirty(section)) return;
    const value = section === 'profile' ? { businessName: draft.profile.businessName, phone: draft.profile.phone, address: draft.profile.address, city: draft.profile.city, state: draft.profile.state, zipCode: draft.profile.zipCode, description: draft.profile.description } : section === 'services' ? draft.services : { timeZone: draft.timeZone, businessHours: draft.businessHours };
    setBusy(true); setMessage(`Saving ${section === 'hours' ? 'business hours' : section}…`);
    try {
      const result = await callable('rlCompanySetupReview')({ action: 'save', section, value, expectedRevision: revision });
      setRevision(result.data.revision); setSavedSections(old => ({ ...old, [section]: currentSections[section] }));
      setMessage(result.data.unchanged ? 'No changes were needed.' : 'Company setup section saved successfully.');
    } catch (error) {
      setMessage(error.code === 'functions/aborted' ? 'Company setup changed in another session. Reload before saving.' : error.message || 'This company setup section could not be saved.');
    } finally { setBusy(false); }
  };
  const nextStep = async () => {
    if (!reviewMode && draft.currentStep === 1 && (!draft.profile.name.trim() || !draft.profile.businessName.trim())) { setMessage('Enter your name and company name to continue.'); return; }
    if (!reviewMode && draft.currentStep === 4 && !draft.services.length) { setMessage('Add at least one service.'); return; }
    const next = { ...draft, currentStep: Math.min(7, draft.currentStep + 1) };
    if (!reviewMode) { clearTimeout(timer.current); if (!(await persist(next))) return; }
    setDraft(next);
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
      const issues = [], area = draft.serviceArea;
      if (draft.profile.address && draft.profile.city && draft.profile.state && draft.profile.zipCode && (area.method === 'radius' || area.zipCodes.length)) {
        try { await callable('rlServiceAreas')({ action: 'save', expectedRevision: 0, settings: { operatingAddress: `${draft.profile.address}, ${draft.profile.city}, ${draft.profile.state} ${draft.profile.zipCode}`, method: area.method, radiusMiles: area.radiusMiles, zipCodes: area.zipCodes, categoryOverrides: [], acceptingNewCustomers: false, publishCoverage: false, allowOutOfAreaRequests: false } }); }
        catch (error) { issues.push(`Service-area setup needs a retry in Company Settings: ${error.message}`); }
      }
      for (const invite of draft.invites) { const result = await CompanyService.addTeamMember(data.companyId, invite.email, invite.role); if (!result.success) issues.push(`${invite.email}: ${result.error}`); }
      if (issues.length) setMessage(`Company activated. ${issues.join('; ')}`);
      else if (csv) setMessage('Company activated. Review the retained CSV preview below, then choose Import customers.');
      else { setMessage('Company activated. Opening your dashboard…'); navigate('/', { replace: true }); }
    } catch (error) { setMessage(error.message || 'Activation failed. Your saved setup is still available to retry.'); }
    finally { setBusy(false); }
  };

  const saveAndSignOut = async () => {
    if (reviewMode || busy) return;
    clearTimeout(timer.current); setBusy(true); setMessage('Saving your setup before signing out…');
    try {
      if (!(await persist(draft))) return;
      await logout();
    } catch (error) {
      setMessage(error.message || 'Your setup could not be saved. You are still signed in.');
    } finally { setBusy(false); }
  };

  if (accessDenied) return <main className="space-y-4"><h1 className="text-2xl font-bold">Review Company Setup</h1><p role="alert">{message}</p><Link className="underline" to="/company-setup">Return to Company</Link></main>;
  if (!ready) return <main className="mx-auto max-w-4xl p-8"><h1 className="text-2xl font-bold">{reviewMode ? 'Review Company Setup' : 'Set up your workspace'}</h1><p role="status" className="mt-4">{message}</p></main>;
  const step = draft.currentStep, steps = reviewMode ? reviewSteps : onboardingSteps;
  const reviewCompany = company ? { ...company, serviceCategories: draft.services, services: draft.services } : null;
  return <main className={`space-y-6 ${reviewMode ? '' : 'mx-auto max-w-4xl p-4 sm:p-8'}`}>
    <header><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-primary-700">ROUTE LOGISTICS · COMPANY SETUP</p><h1 className="mt-2 text-3xl font-bold">{reviewMode ? 'Review Company Setup' : 'Set up your workspace'}</h1></div>{!reviewMode && <button type="button" className="btn-secondary" disabled={busy || !ready} onClick={saveAndSignOut}>Save &amp; sign out</button>}</div><p className="mt-2 text-gray-600">{reviewMode ? 'Review authoritative company data and save only the sections you intentionally change. Existing customers, memberships, and operations are preserved.' : 'Progress saves to your account and is available when you sign in on another device.'}</p></header>
    {!activeCompany && <><ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Company setup steps">{steps.map((name, i) => <li key={name}><button type="button" disabled={!reviewMode || busy} onClick={() => reviewMode && change(old => ({ ...old, currentStep: i + 1 }))} className={`h-full w-full rounded border p-2 text-left text-sm ${step === i + 1 ? 'border-primary-600 bg-primary-50 font-semibold' : ''}`}><span className="text-gray-500">{i + 1}.</span> {name}</button></li>)}</ol>
      {step === 1 && <ProfileStep reviewMode={reviewMode} draft={draft} setProfile={setProfile} busy={busy} dirty={sectionDirty('profile')} save={() => saveReviewSection('profile')} />}
      {step === 2 && <section className="space-y-4 rounded-lg bg-white p-5 shadow"><h2 className="text-xl font-semibold">{reviewMode ? 'Owner account & setup access' : 'Owner account & email verification'}</h2><p>Signed in as <strong>{currentUser?.email}</strong>.</p>{reviewMode ? <><p>Current setup role: <strong>{role}</strong>. Review mode never changes the company owner, tenant identity, or role.</p><p>Verified: {currentUser?.emailVerified ? 'Yes' : 'No'}</p></> : <><p>Email verification is required before the company can be activated or management access is granted.</p><p className="text-sm text-gray-600">Use the verification email sent at signup. If you just verified, refresh your session before continuing.</p><button className="btn-secondary" onClick={() => refreshSession().then(() => setMessage('Session refreshed.'))}>Refresh verification status</button><p>Verified: {currentUser?.emailVerified ? 'Yes' : 'No — verify to continue.'}</p></>}</section>}
      {step === 3 && <TeamStep reviewMode={reviewMode} team={team} draft={draft} newInvite={newInvite} setNewInvite={setNewInvite} inviteRole={inviteRole} setInviteRole={setInviteRole} addInvite={addInvite} change={change} />}
      {step === 4 && <ServicesStep reviewMode={reviewMode} draft={draft} newService={newService} setNewService={setNewService} addService={addService} change={change} busy={busy} dirty={sectionDirty('services')} save={() => saveReviewSection('services')} />}
      {step === 5 && <HoursStep reviewMode={reviewMode} draft={draft} change={change} busy={busy} dirty={sectionDirty('hours')} save={() => saveReviewSection('hours')} company={reviewCompany} />}
      {step === 6 && <ImportStep reviewMode={reviewMode} csv={csv} readCsv={readCsv} downloadTemplate={downloadTemplate} completed={() => { setCsv(null); setMessage('Customer import completed. Existing customer records were preserved.'); }} />}
      {step === 7 && <section className="space-y-3 rounded-lg bg-white p-5 shadow"><h2 className="text-xl font-semibold">{reviewMode ? 'Review company setup' : 'Review & activate'}</h2><p><strong>{draft.profile.businessName || 'Company name missing'}</strong>{!reviewMode && ` · owner ${draft.profile.name || 'name missing'}`}</p><p>Services: {draft.services.join(', ') || 'No services configured'}</p><p>{reviewMode ? `${team.length} team record(s)` : `Team invitations: ${draft.invites.length}`}; time zone: {draft.timeZone}; customer CSV: {csv ? `${csv.customers.length} validated rows` : 'not selected'}</p>{reviewMode ? <><p className="text-sm text-gray-600">Review mode never activates a new company. Unchanged sections are not written, and unrelated company fields remain untouched.</p>{reviewDirty && <p role="alert" className="rounded bg-amber-50 p-3 text-amber-900">Save the changed company information, services, or business hours before leaving.</p>}<button type="button" className="btn-primary disabled:opacity-50" disabled={reviewDirty} onClick={() => navigate('/company-setup')}>Finish review</button></> : <><p className="text-sm text-gray-600">Activating creates one company for this verified owner. Retrying activation returns the same company instead of creating a duplicate.</p><button disabled={busy || !currentUser?.emailVerified} className="btn-primary disabled:opacity-50" onClick={activate}>{busy ? 'Activating…' : 'Activate company'}</button></>}</section>}
      <div className="flex justify-between"><button className="btn-secondary" disabled={step === 1 || busy} onClick={previous}>Back</button><button className="btn-primary" disabled={step === 7 || busy || !ready} onClick={nextStep}>{reviewMode ? 'Next section' : 'Save & continue'}</button></div></>}
    {activeCompany && <section className="space-y-4 rounded-lg bg-white p-5 shadow"><h2 className="text-xl font-semibold">Workspace activated</h2><p>{message}</p>{csv && <CustomerImport initialPreview={csv} openInitially onComplete={() => { setCsv(null); navigate('/', { replace: true }); }}/>}<button className="btn-primary" onClick={() => navigate('/', { replace: true })}>Open Route Logistics</button></section>}
    <p role="status" className="text-sm text-gray-600">{message}</p>
  </main>;
}

function ProfileStep({ reviewMode, draft, setProfile, busy, dirty, save }) {
  return <section className="space-y-4 rounded-lg bg-white p-5 shadow"><h2 className="text-xl font-semibold">Company information</h2>{reviewMode && <label className="block text-sm">Owner account name<input className="input-field mt-1 block w-full" value={draft.profile.name || ''} disabled readOnly /></label>}{[['businessName','Company name'],['phone','Company phone'],['address','Operating street address'],['city','City'],['state','State'],['zipCode','ZIP code']].map(([key,label]) => <label key={key} className="block text-sm">{label}{key === 'businessName' && ' *'}{key === 'state' ? <SelectControl aria-label="State" className="input-field mt-1 block w-full" value={draft.profile.state || ''} onChange={e => setProfile('state',e.target.value)}><option value="">Select a state</option>{draft.profile.state && !usStates.some(([code]) => code === draft.profile.state) && <option value={draft.profile.state}>{draft.profile.state} (saved value)</option>}{usStates.map(([code,name]) => <option key={code} value={code}>{name} ({code})</option>)}</SelectControl> : <input className="input-field mt-1 block w-full" type={key === 'phone' ? 'tel' : 'text'} autoComplete={key === 'phone' ? 'tel' : undefined} value={key === 'phone' ? displayPhone(draft.profile[key]) : draft.profile[key] || ''} onChange={e => setProfile(key,e.target.value)} />}</label>)}{!reviewMode && <label className="block text-sm">Owner name *<input className="input-field mt-1 block w-full" value={draft.profile.name || ''} onChange={e => setProfile('name',e.target.value)} /></label>}<label className="block text-sm">Company description<textarea className="input-field mt-1 block w-full" value={draft.profile.description} onChange={e => setProfile('description',e.target.value)} /></label>{reviewMode && <button type="button" className="btn-primary disabled:opacity-50" disabled={busy || !dirty} onClick={save}>Save company information</button>}</section>;
}

function TeamStep({ reviewMode, team, draft, newInvite, setNewInvite, inviteRole, setInviteRole, addInvite, change }) {
  return <section className="space-y-4 rounded-lg bg-white p-5 shadow"><h2 className="text-xl font-semibold">{reviewMode ? 'Current team' : <>Invite managers and technicians <span className="text-sm font-normal">(optional)</span></>}</h2>{reviewMode ? <><p>Existing memberships and invitations are shown for review and are not recreated by this wizard.</p><ul className="divide-y rounded border">{team.map(row => <li className="p-3" key={row.id}><strong>{row.name || row.email || 'Team member'}</strong><span className="ml-2 text-sm text-gray-600">{row.email} · {row.role} · {row.status}{row.invitationStatus ? ` · ${row.invitationStatus}` : ''}</span></li>)}</ul><Link className="underline" to="/company-setup">Manage invitations and memberships in Company</Link></> : <><p>Invitations are sent after activation using the existing verified-email invitation flow.</p><div className="flex flex-wrap gap-2"><input aria-label="Teammate email" className="input-field" type="email" value={newInvite} onChange={e => setNewInvite(e.target.value)} placeholder="teammate@example.com"/><SelectControl aria-label="Invite role" className="input-field" value={inviteRole} onChange={e => setInviteRole(e.target.value)}><option value="technician">Technician</option><option value="manager">Manager</option></SelectControl><button className="btn-secondary" onClick={addInvite}>Add invite</button></div><ul className="list-disc pl-5">{draft.invites.map(row => <li key={row.email}>{row.email} · {row.role} <button className="underline" onClick={() => change(old => ({ ...old, invites: old.invites.filter(v => v.email !== row.email) }), true)}>Remove</button></li>)}</ul></>}</section>;
}

function ServicesStep({ reviewMode, draft, newService, setNewService, addService, change, busy, dirty, save }) {
  const inputRef = useRef(null);
  const addAndFocus = () => { addService(); inputRef.current?.focus(); };
  return <section className="space-y-4 rounded-lg bg-white p-5 shadow"><h2 className="text-xl font-semibold">Services provided</h2><p>{reviewMode ? 'Changes update the company service catalog only. Existing jobs, estimates, and customer history are preserved.' : 'Add standard or custom service names. You can refine the service catalog later.'}</p><div className="flex gap-2"><input ref={inputRef} aria-label="Service name" className="input-field flex-1" value={newService} onChange={e => setNewService(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(),addAndFocus())} placeholder="e.g. Pest control"/><button type="button" className="btn-secondary" onClick={addAndFocus}>Add service</button></div><ul className="list-disc pl-5">{draft.services.map(service => <li key={service}>{service} <button className="underline" onClick={() => change(old => ({ ...old, services: old.services.filter(v => v !== service) }), true)}>Remove</button></li>)}</ul>{reviewMode && <button type="button" className="btn-primary disabled:opacity-50" disabled={busy || !dirty} onClick={save}>Save services</button>}</section>;
}

function HoursStep({ reviewMode, draft, change, busy, dirty, save, company }) {
  const updateDay = (day, field, value) => change(old => ({
    ...old,
    businessHours: {
      ...old.businessHours,
      [day]: { ...old.businessHours[day], [field]: value },
    },
  }));
  const copyMonday = () => change(old => {
    const monday = old.businessHours.monday || blankHours.monday;
    return {
      ...old,
      businessHours: {
        ...old.businessHours,
        ...Object.fromEntries(days.slice(1, 5).map(day => [day, { ...old.businessHours[day], closed: !!monday.closed, open: monday.open, close: monday.close }])),
      },
    };
  }, true);
  return <div className="space-y-6">
    <section className="space-y-4 rounded-lg bg-white p-5 shadow">
      <h2 className="text-xl font-semibold">Business hours</h2>
      <label className="block">Company time zone
        <SelectControl className="input-field mt-1 block w-full" value={draft.timeZone} onChange={e => change(old => ({ ...old, timeZone: e.target.value }))}>
          {[draft.timeZone,'America/Los_Angeles','America/Denver','America/Chicago','America/New_York','Pacific/Honolulu','America/Anchorage'].filter((v,i,a) => a.indexOf(v)===i).map(zone => <option key={zone}>{zone}</option>)}
        </SelectControl>
      </label>
      <p className="text-sm text-gray-600">These hours describe the business. Existing scheduling continues to use technician availability.</p>
      <button type="button" className="btn-secondary" disabled={busy} onClick={copyMonday}>Copy Monday to weekdays</button>
      <div className="space-y-2">{days.map(day => <div key={day} className="flex flex-wrap items-center gap-3">
        <span className="w-24 capitalize">{day}</span>
        <label><input type="checkbox" checked={draft.businessHours[day]?.closed || false} onChange={e => updateDay(day, 'closed', e.target.checked)}/> Closed</label>
        {!draft.businessHours[day]?.closed && <>
          <TimeSelect label={day + ' opens'} hideLabel className="w-36" value={draft.businessHours[day]?.open || '09:00'} onChange={time => updateDay(day, 'open', time)} />
          <span>to</span>
          <TimeSelect label={day + ' closes'} hideLabel className="w-36" value={draft.businessHours[day]?.close || '17:00'} onChange={time => updateDay(day, 'close', time)} />
        </>}
      </div>)}</div>
      {reviewMode && <button type="button" className="btn-primary disabled:opacity-50" disabled={busy || !dirty} onClick={save}>Save business hours</button>}
      {!reviewMode && <fieldset className="space-y-3 border-t pt-4">
        <legend className="font-medium">Service area (optional)</legend>
        <SelectControl className="input-field" value={draft.serviceArea.method} onChange={e => change(old => ({ ...old, serviceArea: { ...old.serviceArea, method: e.target.value } }))}>
          <option value="zip">ZIP codes</option><option value="radius">Radius</option>
        </SelectControl>
        {draft.serviceArea.method === 'zip'
          ? <label className="block">ZIP codes, comma separated<input className="input-field mt-1 block w-full" value={draft.serviceArea.zipCodes.join(', ')} onChange={e => change(old => ({ ...old, serviceArea: { ...old.serviceArea, zipCodes: [...new Set(e.target.value.split(',').map(v => v.trim()).filter(v => /^\d{5}$/.test(v)))] } }))}/></label>
          : <label className="block">Radius in miles<input className="input-field mt-1 block w-full" type="number" min="0.1" max="300" value={draft.serviceArea.radiusMiles} onChange={e => change(old => ({ ...old, serviceArea: { ...old.serviceArea, radiusMiles: Number(e.target.value) } }))}/></label>}
        <p className="text-sm text-gray-600">Coverage is saved after activation and does not change existing scheduling eligibility. Address verification may be required.</p>
      </fieldset>}
    </section>
    {reviewMode && company && <ServiceAreasSettings company={company} />}
  </div>;
}

function ImportStep({ reviewMode, csv, readCsv, downloadTemplate, completed }) {
  return <section className="space-y-4 rounded-lg bg-white p-5 shadow"><h2 className="text-xl font-semibold">Import customers <span className="text-sm font-normal">(optional)</span></h2><p>Download a template, then preview and validate a CSV with Name, Email, Phone, Address, City, State, ZIP, and Notes. Select the file once. Existing customers are never overwritten, and retry safely skips rows already saved.</p><button className="btn-secondary" onClick={downloadTemplate}>Download sample CSV</button><input aria-label="Customer CSV file" type="file" accept=".csv,text/csv" onChange={readCsv}/>{csv && <div className="space-y-3"><p>{csv.customers.length} rows validated; {csv.duplicates} duplicate rows removed.</p><ul className="list-disc pl-5">{csv.customers.slice(0,5).map((row,i)=><li key={i}>{row.name} {row.email && `· ${row.email}`}</li>)}</ul>{reviewMode && <CustomerImport initialPreview={csv} openInitially onComplete={completed}/>}</div>}</section>;
}
