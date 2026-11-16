import SelectControl from '../components/SelectControl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { readWorkspace, callWorkspace } from '../services/workspaceApi';
import { loadMaps } from '../services/maps';
import { STATUS_COLORS, scheduleWarning, jobPosition, jobAddress } from '../utils/dispatch';
import { googleNavigation } from '../utils/routePlanning';
import RoutesPage from './RoutesPage';
import JobPhotos from '../components/JobPhotos';
import ServiceChecklist from '../components/ServiceChecklist';
import TeamLocationStatus from '../components/TeamLocationStatus';
import StaffAvailabilityEditor from '../components/StaffAvailabilityEditor';
import { LOCATION_LABELS, locationState, nearestOnDuty } from '../utils/workLocations';
import { addressKey, createDispatchAddressResolver, mapPoint } from '../utils/dispatchMap';
import { useConfirmUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useWorkspaceQuery } from '../hooks/useWorkspaceQuery';
import { workspaceAccessError } from '../services/workspaceQueryPolicy';
import { deriveJobExceptions, REASSIGNMENT_REASONS } from '../utils/jobExceptions';
import { useConfirm } from '../components/ConfirmProvider';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useInvalidateWorkspace } from '../hooks/useWorkspaceQuery';
import toast from 'react-hot-toast';

const today = () => new Date().toLocaleDateString('en-CA');
const locationLabels = LOCATION_LABELS;
const EMPTY_ROWS = [];
export default function DispatchPage() {
  const { company, can, role } = useAuth();
  const confirmDiscard = useConfirmUnsavedChanges();
  const confirm = useConfirm(), invalidate = useInvalidateWorkspace();
  const [date, setDate] = useState(today), [nearbyJob, setNearbyJob] = useState(null);
  const jobsQuery = useWorkspaceQuery(['jobs', date, 500], () => readWorkspace('jobs', { date, limit: 500 }));
  const teamQuery = useWorkspaceQuery(['team'], () => callWorkspace('rlGetRoutingTeam'));
  const locationsQuery = useWorkspaceQuery(['team-locations'], () => callWorkspace('rlGetTeamLocations'));
  const jobs = jobsQuery.data?.jobs || EMPTY_ROWS, team = teamQuery.data?.team || EMPTY_ROWS, locations = locationsQuery.data?.locations || EMPTY_ROWS;
  const roster = locationsQuery.data?.roster || [], policy = locationsQuery.data?.policy || { intervalMinutes: 3, freshAfterSeconds: 300 };
  const more = jobsQuery.data?.hasMore === true;
  const [member, setMember] = useState('all'), [status, setStatus] = useState('all'), [area, setArea] = useState('');
  const [exceptionFilter, setExceptionFilter] = useState('all');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [selected, setSelected] = useState(null), [routeMember, setRouteMember] = useState('');
  const [mapReady, setMapReady] = useState(false), [resolved, setResolved] = useState({}), [now, setNow] = useState(() => new Date());
  const [mapBusy, setMapBusy] = useState(false), [mapError, setMapError] = useState(''), [markerCount, setMarkerCount] = useState(0), [lookupRequest, setLookupRequest] = useState({ id: 0, retry: false });
  const element = useRef(null), map = useRef(null), markers = useRef([]), resolver = useRef(null), mapJobs = useRef([]), mapAnchor = useRef(null), fitKey = useRef(''), opener = useRef(null), heading = useRef(null), mapOpening = useRef(false), mapLifetime = useRef(0);
  const localAction = useRef(0), viewState = useRef(null); viewState.current = { selected, routeMember, date, companyId: company?.id };
  if (!resolver.current) resolver.current = createDispatchAddressResolver(loadMaps);
  const transition = useCallback(async (change, resetsForm, scope) => {
    const ticket = ++localAction.current, companyId = viewState.current.companyId;
    if (resetsForm && !(await confirmDiscard(scope))) return;
    if (ticket === localAction.current && companyId === viewState.current.companyId) change();
  }, [confirmDiscard]);
  const openDetails = useCallback((job, trigger) => {
    if (viewState.current.selected?.id === job.id) return;
    return transition(() => { opener.current = trigger || document.activeElement; setSelected(job); }, !!viewState.current.selected, `job:${viewState.current.selected?.id}`);
  }, [transition]);
  const closeDetails = useCallback(() => transition(() => setSelected(null), true, `job:${viewState.current.selected?.id}`), [transition]);
  const changeRoute = value => { if (value !== routeMember) return transition(() => setRouteMember(value), !!routeMember, 'route-planner'); };
  const changeDate = value => { if (value !== date) return transition(() => setDate(value), !!(selected || routeMember)); };
  useEffect(() => { const lifetimeCounter = mapLifetime, actionCounter = localAction, lifetime = ++lifetimeCounter.current; return () => { actionCounter.current++; if (lifetimeCounter.current === lifetime) lifetimeCounter.current++; markers.current.forEach(marker => { marker.map = null; }); }; }, []);
  const load = async () => {
    setError('');
    await Promise.all([jobsQuery.refetch(), teamQuery.refetch(), locationsQuery.refetch()]);
    setNow(new Date());
  };
  useEffect(() => { setSelected(null); setNearbyJob(null); }, [date, jobsQuery.scopeId]);
  useEffect(() => {
    if ([jobsQuery.error, teamQuery.error, locationsQuery.error].some(workspaceAccessError)) { setSelected(null); setNearbyJob(null); }
  }, [jobsQuery.error, teamQuery.error, locationsQuery.error]);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  const baseFiltered = useMemo(() => jobs.filter(job => (member === 'all' || (member === 'unassigned' ? !job.assignedTo : job.assignedTo === member)) && (status === 'all' || job.status === status) && (!area || `${job.serviceArea || ''} ${job.city || ''} ${job.zipCode || ''}`.toLowerCase().includes(area.toLowerCase()))), [jobs, member, status, area]);
  const exceptions = useMemo(() => new Map(jobs.map(job => [job.id, deriveJobExceptions(job, { now, timeZone: company?.timeZone })])), [jobs, now, company?.timeZone]);
  const exceptionCounts = useMemo(() => ({ late: baseFiltered.filter(job => exceptions.get(job.id).potentiallyLate).length, overdue: baseFiltered.filter(job => exceptions.get(job.id).overdue).length, requests: baseFiltered.filter(job => exceptions.get(job.id).reassignmentRequested).length }), [baseFiltered, exceptions]);
  const filtered = useMemo(() => baseFiltered.filter(job => exceptionFilter === 'all' || exceptions.get(job.id)[exceptionFilter]), [baseFiltered, exceptionFilter, exceptions]);
  const assignableTeam = useMemo(() => team.filter(row => ['owner', 'manager', 'technician'].includes(row.role) && row.fieldWorkEnabled !== false && row.availability?.fieldWorkEnabled !== false), [team]);
  const position = job => jobPosition(job) || resolved[addressKey(jobAddress(job))];
  mapJobs.current = filtered;
  const companyAddress = company?.address;
  mapAnchor.current = jobPosition(company || {}) || jobAddress({ ...company,
    address: typeof companyAddress === 'object' ? companyAddress?.street || companyAddress?.line1 : companyAddress,
    city: company?.city || companyAddress?.city, state: company?.state || companyAddress?.state, zipCode: company?.zipCode || companyAddress?.zipCode,
  }) || locations.map(mapPoint).find(Boolean) || null;
  const addressFingerprint = JSON.stringify([...new Set(filtered.filter(job => !jobPosition(job) && jobAddress(job)).map(job => addressKey(jobAddress(job))))].sort());
  const lookup = resolver.current.snapshot(filtered);
  useEffect(() => {
    if (!mapReady) return;
    let active = true;
    setMapBusy(true); setMapError('');
    resolver.current.resolve(mapJobs.current, { retry: lookupRequest.retry, anchor: mapAnchor.current, isCurrent: () => active }).then(result => {
      if (!active || result.cancelled) return;
      setResolved(previous => ({ ...previous, ...result.points })); setMapError(result.error || '');
    }).catch(e => { if (active) setMapError(e.message || 'Address lookup failed. Retry while connected.'); })
      .finally(() => { if (active) setMapBusy(false); });
    return () => { active = false; };
  }, [mapReady, addressFingerprint, lookupRequest]);
  useEffect(() => {
    if (!mapReady) return;
    let active = true;
    (async () => {
      const maps = await loadMaps(), { AdvancedMarkerElement, PinElement } = await maps.importLibrary('marker');
      if (!active) return;
      markers.current.forEach(marker => { marker.map = null; }); markers.current = [];
      const bounds = new maps.LatLngBounds();
      filtered.forEach(job => {
        const point = jobPosition(job) || resolved[addressKey(jobAddress(job))]; if (!point) return;
        const pin = new PinElement({ background: STATUS_COLORS[job.status] || '#6b7280', borderColor: '#ffffff', glyphColor: '#ffffff' });
        const marker = new AdvancedMarkerElement({ map: map.current, position: point, title: `${job.customerName || 'Job'} · ${job.status}`, content: pin.element });
        marker.addListener('click', () => openDetails(job, marker.element || marker)); markers.current.push(marker); bounds.extend(point);
      });
      locations.filter(location => member === 'all' || member === location.memberId).forEach(location => {
        const point = mapPoint(location); if (!point) return;
        const state = locationState(location, Number(now), policy.freshAfterSeconds);
        const pin = new PinElement({ background: state === 'live' ? '#0f766e' : '#475569', glyph: 'T', glyphColor: '#ffffff' });
        const marker = new AdvancedMarkerElement({ map: map.current, position: point, title: `${location.name} · ${locationLabels[state] || locationLabels.unavailable} · ${location.capturedAt || location.updatedAt}`, content: pin.element });
        markers.current.push(marker); bounds.extend(point);
      });
      setMarkerCount(markers.current.length);
      const nextFit = JSON.stringify(markers.current.map(marker => mapPoint(marker.position)).filter(Boolean).sort((a,b) => a.lat - b.lat || a.lng - b.lng));
      if (!bounds.isEmpty() && fitKey.current !== nextFit) { fitKey.current = nextFit; map.current.fitBounds(bounds, 40); }
    })().catch(e => { if (active) setMapError(e.message); });
    return () => { active = false; markers.current.forEach(marker => { marker.map = null; }); };
  }, [filtered, resolved, locations, member, mapReady, now, policy.freshAfterSeconds, openDetails]);
  const openMap = async () => {
    if (mapOpening.current) return;
    const lifetime = mapLifetime.current; mapOpening.current = true; setMapBusy(true); setMapError('');
    try {
      const maps = await loadMaps(), { Map: GoogleMap } = await maps.importLibrary('maps');
      if (lifetime !== mapLifetime.current) return;
      const center = filtered.map(position).find(Boolean) || locations.map(mapPoint).find(Boolean) || { lat: 39, lng: -98 };
      map.current ||= new GoogleMap(element.current, { center, zoom: 12, mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID' }); setMapReady(true);
    } catch (e) { if (lifetime === mapLifetime.current) setMapError(e.message); }
    finally { mapOpening.current = false; if (lifetime === mapLifetime.current) setMapBusy(false); }
  };
  const assign = async (job, memberId) => {
    if (!can('jobs.assign') || busy) return;
    const changed = (job.assignedTo || '') !== (memberId || '');
    if (!changed) return;
    const reviewStartedWork = job.status === 'in-progress';
    if (reviewStartedWork && !(await confirm({ title: 'Review in-progress reassignment', message: 'Review existing work, photos, visit evidence and any unsynchronized technician work before reassigning. Existing evidence is retained; pending offline changes may require reconciliation.', confirmText: 'Reassign after review' }))) return;
    setBusy(true); setError('');
    try { await callWorkspace('rlManageJob', { action: 'assign', id: job.id, memberId: memberId || null, expectedVersion: job.updatedAt || null, ...(reviewStartedWork ? { reviewStartedWork: true } : {}) }); await jobsQuery.refetch(); toast.success('Job assignment updated.'); return { success: true }; }
    catch (e) { setError(e.message); return { error: e.message }; } finally { setBusy(false); }
  };
  const exceptionChanged = result => {
    const request = result.request?.status === 'pending' ? result.request : null;
    const update = job => job?.id === result.jobId && (!job.reassignmentRequest || job.reassignmentRequest.id === result.request?.id) ? { ...job, reassignmentRequest: request } : job;
    jobsQuery.setData(previous => previous && ({ ...previous, jobs: previous.jobs.map(update) }));
    setSelected(update);
    return invalidate(['jobs', 'job', 'job-exceptions']);
  };
  const currentSelection = selected && (jobs.find(job => job.id === selected.id) || selected);
  if (!can('dispatch.manage')) return <p role="alert">Dispatch access is required.</p>;
  return <><div className="space-y-5" inert={selected ? true : undefined}>
    <div><h1 ref={heading} tabIndex={-1} className="text-2xl font-bold">Dispatch Board</h1><p className="text-gray-600">{company?.name} · Daily field operations</p></div>
    <div className="flex flex-wrap items-end gap-3 rounded border bg-white p-4">
      <label>Service date<input className="block rounded border-gray-300" type="date" value={date} onChange={e => changeDate(e.target.value)} /></label>
      <label>Technician<SelectControl className="block rounded border-gray-300" value={member} onChange={e => setMember(e.target.value)}><option value="all">All technicians</option><option value="unassigned">Unassigned</option>{team.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</SelectControl></label>
      <label>Status<SelectControl className="block rounded border-gray-300" value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option>{Object.keys(STATUS_COLORS).map(value => <option key={value}>{value}</option>)}</SelectControl></label>
      <label>Service area<input className="block rounded border-gray-300" value={area} onChange={e => setArea(e.target.value)} placeholder="Area, city or ZIP" /></label>
      <button className="rounded border px-4 py-2" onClick={load} disabled={busy}>Refresh</button>
    </div>
    {(error || jobsQuery.error || teamQuery.error || locationsQuery.error) && <p role="alert" className="text-red-700">{error || (jobsQuery.error || teamQuery.error || locationsQuery.error).message}</p>}
    <section aria-label="Operational exceptions" className="space-y-2 rounded border bg-white p-3"><div className="flex flex-wrap gap-2">{[['all', `All jobs (${baseFiltered.length})`], ['potentiallyLate', `Potentially late (${exceptionCounts.late})`], ['overdue', `Overdue (${exceptionCounts.overdue})`], ['reassignmentRequested', `Reassignment requested (${exceptionCounts.requests})`]].map(([value, label]) => <button key={value} type="button" aria-pressed={exceptionFilter === value} onClick={() => setExceptionFilter(value)} className={`rounded-full border px-3 py-1 text-sm ${exceptionFilter === value ? 'border-primary-700 bg-primary-50 font-semibold text-primary-900' : 'border-gray-300'}`}>{label}</button>)}</div><p className="text-xs text-gray-600">Potential lateness uses a 30-minute grace period in the company time zone. No arrival confirmed does not prove absence; the technician may be working offline. These indicators do not change assignments or appointments.</p></section>
    <div className="rounded border bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">{!mapReady && <button className="rounded bg-primary-600 px-4 py-2 text-white" disabled={mapBusy} onClick={openMap}>{mapBusy ? 'Opening dispatch map…' : 'Show dispatch map'}</button>}{mapReady && lookup.pending > 0 && <button className="rounded border px-4 py-2" disabled={mapBusy} onClick={() => setLookupRequest(previous => ({ id: previous.id + 1, retry: false }))}>Locate next 25 service addresses</button>}{mapReady && lookup.failed > 0 && <button className="rounded border px-4 py-2" disabled={mapBusy} onClick={() => setLookupRequest(previous => ({ id: previous.id + 1, retry: true }))}>Retry unresolved addresses</button>}<span className="whitespace-nowrap">{filtered.length} jobs · {jobs.filter(job => !job.assignedTo).length} unassigned</span></div>
      {mapError && <p role="alert" className="text-red-700">{mapError}</p>}
      <div className="relative"><div ref={element} className={mapReady ? 'h-96 rounded bg-gray-100' : 'h-0'} aria-label="Dispatch map" />
        {mapReady && markerCount === 0 && <div role="status" className="absolute inset-0 flex items-center justify-center rounded bg-gray-100 p-6 text-center text-gray-700">{mapBusy ? 'Locating service addresses…' : mapError || 'No mapped jobs or shared team positions are available. Check service addresses or retry unresolved addresses.'}</div>}
      </div>
      <div className="flex flex-wrap gap-4 text-sm">{Object.entries(STATUS_COLORS).map(([label, color]) => <span key={label}><span style={{ color }}>●</span> {label}</span>)}</div>
      <p role="status" className="text-sm text-gray-600">{mapBusy && mapReady ? 'Locating up to 25 service addresses… ' : ''}{filtered.filter(job => position(job)).length} of {filtered.length} jobs mapped. {filtered.filter(job => !position(job)).length} jobs need a mapped address.{mapReady && lookup.pending > 0 ? ` ${lookup.pending} addresses remain for the next batch.` : ''}{mapReady && lookup.failed > 0 ? ` ${lookup.failed} addresses need review or retry.` : ''} Address lookup begins when you show the map; each batch contains at most 25 unique addresses. Map points resolved from driving routes are approximate road access points. Team positions use a distinct T marker.</p>
    </div>
    <div className="grid gap-5 lg:grid-cols-3"><div className="lg:col-span-2 space-y-3">
      {more && <p role="status">Showing the first 500 jobs for this date.</p>}
      {!filtered.length && <p>No jobs match these filters.</p>}
      {filtered.map(job => <article key={job.id} className="rounded border bg-white p-4 space-y-2" style={{ borderLeft: `5px solid ${STATUS_COLORS[job.status] || '#6b7280'}` }}>
        <button className="font-semibold underline" onClick={event => openDetails(job, event.currentTarget)}>{job.customerName || 'Customer'} · {job.serviceType}</button><p>{job.time || 'Time not set'} · {job.status} · {jobAddress(job) || 'Service address not set'}</p>
        {scheduleWarning(job, now, company?.timeZone) && <p className="text-amber-800">{scheduleWarning(job, now, company?.timeZone)} · schedule-based, not a traffic prediction</p>}
        <ExceptionIndicators value={exceptions.get(job.id)} />
        <label>Assigned to <SelectControl aria-label={`Assign ${job.customerName || job.id}`} className="rounded border-gray-300" value={job.assignedTo || ''} disabled={busy || !can('jobs.assign')} onChange={e => assign(job, e.target.value)}><option value="">Unassigned</option>{job.assignedTo && !assignableTeam.some(row => row.id === job.assignedTo) && <option value={job.assignedTo} disabled>{job.assignedToName || team.find(row => row.id === job.assignedTo)?.name || 'Previously assigned technician'} (review assignment)</option>}{assignableTeam.map(row => <option value={row.id} key={row.id}>{row.name}</option>)}</SelectControl></label>
        {job.assignmentNeedsAttention && <p role="status" className="text-sm font-medium text-amber-800">{job.assignmentReview || 'A dispatcher needs to assign this visit.'}</p>}
        {(jobAddress(job) || position(job)) && <a className="ml-3 underline" href={googleNavigation([{ ...job, address: jobAddress(job), location: position(job) }])} target="_blank" rel="noreferrer">Navigate</a>}
        <button className="ml-3 underline" onClick={() => setNearbyJob(job)}>Find nearby on-duty staff</button>
        {nearbyJob?.id === job.id && <section className="space-y-2 rounded bg-emerald-50 p-3" aria-label="Nearby on-duty staff"><strong>Nearby on-duty staff</strong><p className="text-xs">Approximate straight-line distances from current GPS fixes, not driving time. Office-only, off-duty, overdue and low-accuracy positions are excluded.</p>
          {!position(job) ? <p>Show the dispatch map to locate service addresses and compare distances for this job.</p> : <>
            {!nearestOnDuty(roster, position(job), Number(now), policy.freshAfterSeconds).length && <p>No on-duty staff have a recent, sufficiently accurate location.</p>}
            {nearestOnDuty(roster, position(job), Number(now), policy.freshAfterSeconds).map(row => <div key={row.memberId} className="flex flex-wrap items-center justify-between gap-2"><span>{row.name} · {(row.distance / 1609.344).toFixed(1)} mi · ±{Math.round(row.location.accuracy)} m</span><button className="underline" disabled={busy || !can('jobs.assign')} onClick={() => assign(job, row.memberId)}>Assign to {row.name}</button></div>)}
          </>}
          <button className="text-sm underline" onClick={() => setNearbyJob(null)}>Close nearby staff</button>
        </section>}
      </article>)}
    </div><aside className="space-y-3"><h2 className="font-semibold">Team shifts, locations and routes</h2><p className="text-sm text-gray-600">Staff start and end their shift in the mobile app. GPS updates target every {policy.intervalMinutes} minutes while on duty, including between jobs. Shift status and GPS freshness are separate. This board refreshes every 30 seconds.</p>
      {team.map(row => { const staff = { ...row, ...(roster.find(item => item.memberId === row.id) || { memberId: row.id, dutyStatus: 'unknown', location: locations.find(item => item.memberId === row.id) }) }; return <div key={row.id} className="space-y-2 rounded border bg-white p-3"><strong>{row.name}</strong><TeamLocationStatus member={staff} now={now} freshAfterSeconds={policy.freshAfterSeconds} /><button className="underline" onClick={() => changeRoute(row.id)}>Open daily route</button><StaffAvailabilityEditor companyId={company?.id} member={staff} allowed={['owner', 'manager'].includes(role)} onChanged={load} /></div>; })}
    </aside></div>
    {routeMember && <section className="rounded border bg-white p-5"><button className="mb-4 underline" onClick={() => changeRoute('')}>Close route planner</button><RoutesPage key={`${date}:${routeMember}`} initialDate={date} initialMemberId={routeMember} /></section>}
  </div>{currentSelection && <DispatchJobDetails job={currentSelection} onClose={closeDetails} returnFocus={opener.current} fallbackFocus={heading.current} destination={position(currentSelection)} exceptionState={exceptions.get(currentSelection.id) || deriveJobExceptions(currentSelection, { now, timeZone: company?.timeZone })} canManageRequests={can('jobs.assign')} onExceptionChanged={exceptionChanged} onAssign={assign} assignmentTeam={assignableTeam} assigning={busy} />}</>;
}

function ExceptionIndicators({ value }) {
  if (!value?.indicators.length) return null;
  return <ul aria-label="Job exceptions" className="flex flex-wrap gap-2">{value.indicators.map(indicator => <li key={indicator.code} title={indicator.detail} className="rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">{indicator.label}</li>)}</ul>;
}

function JobExceptionReview({ job, value, allowed, onChanged, onAssign, assignmentTeam, assigning }) {
  const [retained, setRetained] = useState(job.reassignmentRequest), [explanation, setExplanation] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const locked = useRef(false), attempts = useRef(new Map()), generation = useRef(0), mounted = useRef(false);
  const pending = job.reassignmentRequest?.status === 'pending' ? job.reassignmentRequest : null;
  const dirty = !!explanation.trim(), request = dirty && retained ? retained : pending || retained;
  const changedRequest = !!(dirty && pending && retained && (pending.id !== retained.id || pending.revision !== retained.revision));
  const { confirmDiscard } = useUnsavedChanges(dirty, { scope: `job:${job.id}`, message: 'Your reassignment review explanation has not been saved. Leave without saving it?' });
  useEffect(() => { mounted.current = true; const lifecycle = generation, sequence = ++lifecycle.current; return () => { mounted.current = false; if (sequence === lifecycle.current) lifecycle.current++; }; }, [job.id]);
  useEffect(() => { if (!dirty && !locked.current) { setRetained(pending); setError(''); } }, [pending, dirty]);
  const act = async action => {
    if (!allowed || !pending || changedRequest || locked.current) return;
    locked.current = true; setBusy(true); setError(''); setMessage(''); const ticket = generation.current;
    const fingerprint = JSON.stringify([action, job.id, pending.id, pending.revision, job.updatedAt, explanation.trim()]);
    if (!attempts.current.has(fingerprint)) attempts.current.set(fingerprint, crypto.randomUUID());
    try {
      const result = await callWorkspace('rlJobException', { action, jobId: job.id, requestId: pending.id, operationId: attempts.current.get(fingerprint), expectedVersion: job.updatedAt || null, expectedRevision: pending.revision, explanation: explanation.trim() });
      if (!mounted.current || ticket !== generation.current) return;
      setExplanation(''); setRetained(null); setMessage(action === 'resolve' ? 'Reassignment request resolved. The assignment is unchanged.' : 'Reassignment request dismissed. The assignment is unchanged.'); toast.success(action === 'resolve' ? 'Reassignment request resolved.' : 'Reassignment request dismissed.');
      try { await onChanged(result); } catch { if (mounted.current && ticket === generation.current) setError('The request was saved, but the board could not refresh. Refresh dispatch to see current requests.'); }
    } catch (failure) { if (mounted.current && ticket === generation.current) { setError(failure.message || 'This request could not be updated. Review the latest job and retry.'); toast.error(failure.message || 'Request update failed.'); } }
    finally { locked.current = false; if (mounted.current && ticket === generation.current) setBusy(false); }
  };
  if (!value?.needsAttention && !request && !message && !dirty) return null;
  return <section aria-label="Operational exception review" className="space-y-3 rounded border border-amber-200 bg-amber-50 p-4"><h3 className="font-semibold">Operational attention</h3><ExceptionIndicators value={value} />{value?.indicators.filter(indicator => indicator.code !== 'reassignment-requested').map(indicator => <p key={indicator.code} className="text-sm">{indicator.detail}</p>)}
    {request && <div className="space-y-2"><h4 className="font-semibold">Reassignment request</h4><p>{REASSIGNMENT_REASONS[request.reason] || 'Management review requested'}</p>{request.requestedAt && <p className="text-sm">Requested {new Date(request.requestedAt).toLocaleString()}</p>}{request.notes && <p className="whitespace-pre-wrap break-words">{request.notes}</p>}{!pending && <p role="status">This request is no longer pending. Any unfinished explanation is retained here for review.</p>}
      {changedRequest && <p role="alert">A newer reassignment request is available. Your unfinished explanation is retained; review the latest request before resolving it.</p>}
      {allowed && <><label className="block text-sm font-medium">Resolution explanation (optional)<textarea aria-label="Reassignment resolution explanation" maxLength={2000} value={explanation} disabled={busy} onChange={event => setExplanation(event.target.value)} className="input-field mt-1 block w-full" /></label><div className="flex flex-wrap gap-2"><button className="btn-secondary" disabled={busy || !pending || changedRequest} onClick={() => act('resolve')}>Resolve request</button><button className="btn-secondary" disabled={busy || !pending || changedRequest} onClick={() => act('dismiss')}>Dismiss request</button>{changedRequest && <button className="btn-secondary" disabled={busy} onClick={async () => { if (await confirmDiscard()) { setExplanation(''); setRetained(pending); setError(''); } }}>Review latest request</button>}</div></>}
    </div>}
    {allowed && <div className="space-y-2 border-t border-amber-200 pt-3"><label className="block text-sm font-medium">Reassign through checked scheduling<SelectControl aria-label="Reassign selected job" className="input-field mt-1 block w-full" value={job.assignedTo || ''} disabled={busy || assigning} onChange={async event => { const result = await onAssign(job, event.target.value); if (mounted.current && result?.error) setError(result.error); else if (mounted.current && result?.success) { setError(''); setMessage('Job assignment updated. Existing work is retained.'); } }}><option value="">Unassigned</option>{job.assignedTo && !assignmentTeam.some(row => row.id === job.assignedTo) && <option value={job.assignedTo} disabled>Current assignee (review assignment)</option>}{assignmentTeam.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</SelectControl></label><p className="text-xs">Availability and the latest assignment are checked on save. Reassigning resolves a pending request and preserves existing work.</p>{job.status === 'in-progress' && <p className="text-sm font-medium">Work is in progress. An explicit management review is required before changing assignment.</p>}</div>}
    {error && <p role="alert" className="text-red-800">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}

function DispatchJobDetails({ job, onClose, returnFocus, fallbackFocus, destination, exceptionState, canManageRequests, onExceptionChanged, onAssign, assignmentTeam, assigning }) {
  const panel = useRef(null), close = useRef(null);
  const visitsQuery = useWorkspaceQuery(['job-visits', job.id], () => callWorkspace('rlJobVisit', { action: 'list', jobId: job.id }));
  const visits = visitsQuery.data?.events || [], error = visitsQuery.error?.message || '', loading = visitsQuery.isPending;
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; close.current?.focus();
    const onKey = event => {
      // Photo deletion uses ConfirmProvider's higher overlay. Its Escape/focus
      // belongs to that confirmation while it is open, not to this drawer.
      if ([...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(dialog => dialog !== panel.current && !panel.current?.contains(dialog))) return;
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      else if (event.key === 'Tab') {
        const controls = [...(panel.current?.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])') || [])].filter(node => !node.hidden && node.getAttribute('type') !== 'hidden');
        const first = controls[0], last = controls.at(-1);
        if (!first) { event.preventDefault(); panel.current?.focus(); }
        else if (!panel.current?.contains(document.activeElement) || event.shiftKey && document.activeElement === first) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; const target = returnFocus?.isConnected === false ? fallbackFocus : returnFocus || fallbackFocus; target?.focus?.({ preventScroll: true }); };
  }, [onClose, returnFocus, fallbackFocus]);
  return <div className="fixed inset-0 z-50 flex justify-end bg-gray-900/50" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }} data-testid="job-details-backdrop">
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="dispatch-job-title" tabIndex={-1} className="h-[100dvh] w-full max-w-lg overflow-y-auto bg-white p-5 shadow-2xl sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-sm text-gray-500">Job details</p><h2 id="dispatch-job-title" className="text-xl font-bold">{job.customerName || 'Customer'} · {job.serviceType || 'Service visit'}</h2></div><button ref={close} className="min-h-11 rounded border px-3 py-2" onClick={onClose}>Close details</button></div>
      <div className="space-y-5"><div className="space-y-2 rounded border p-4"><p className="font-semibold" style={{ color: STATUS_COLORS[job.status] || '#374151' }}>Status: {job.status || 'Not set'}</p><p>{job.date} · {job.time || 'Time not set'}</p><p>{jobAddress(job) || 'Service address not set'}</p>{(destination || jobAddress(job)) && <a className="inline-block underline" href={googleNavigation([{ ...job, address: jobAddress(job), location: destination }])} target="_blank" rel="noreferrer">Navigate to service location</a>}</div>
        <JobExceptionReview key={'exception-' + job.id} job={job} value={exceptionState} allowed={canManageRequests} onChanged={onExceptionChanged} onAssign={onAssign} assignmentTeam={assignmentTeam} assigning={assigning} />
        {!!(job.workNotes || job.notes) && <section><h3 className="mb-2 font-semibold">Work notes</h3><p className="whitespace-pre-wrap">{job.workNotes || job.notes}</p></section>}
        {!!(job.actualWorkDone || job.completionNotes) && <section><h3 className="mb-2 font-semibold">Completed work</h3><p className="whitespace-pre-wrap">{job.actualWorkDone}</p><p className="whitespace-pre-wrap">{job.completionNotes}</p></section>}
        <section><h3 className="mb-2 font-semibold">Visit record</h3><p className="mb-2 text-xs text-gray-600">Manual reports and GPS evidence do not independently verify access to the property.</p>{loading && <p role="status">Loading visit records…</p>}{error && <div><p role="alert" className="text-red-700">{error}</p><button className="mt-2 underline" onClick={() => visitsQuery.refetch()}>Retry visit records</button></div>}{!loading && !error && !visits.length && <p>No visit events recorded.</p>}
          {visits.map(visit => <article key={visit.id} className="mb-3 rounded border p-3"><strong>{{ arrived: 'Arrived', departed: 'Departed', 'access-blocked': 'Couldn’t access property' }[visit.type] || 'Visit event'}</strong><p className="text-sm">{new Date(visit.capturedAt || visit.recordedAt).toLocaleString()} · {{ manual: 'Reported manually', 'manual-gps': 'Reported manually with GPS', 'gps-evidence': 'Estimated from GPS evidence' }[visit.source] || 'Visit report'}</p>{Number.isFinite(visit.accuracy) && <p className="text-sm">GPS accuracy: ±{Math.round(visit.accuracy)} m</p>}{visit.note && <p className="whitespace-pre-wrap">{visit.note}</p>}</article>)}
        </section><JobPhotos key={job.id} job={job} /><ServiceChecklist key={'form-' + job.id} job={job} />
      </div>
    </section>
  </div>;
}
