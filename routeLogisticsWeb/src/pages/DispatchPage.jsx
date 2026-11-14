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
import { LOCATION_LABELS, locationState, nearestOnDuty } from '../utils/workLocations';
import { addressKey, createDispatchAddressResolver, mapPoint } from '../utils/dispatchMap';

const today = () => new Date().toLocaleDateString('en-CA');
const locationLabels = LOCATION_LABELS;
export default function DispatchPage() {
  const { company, can } = useAuth();
  const [date, setDate] = useState(today), [jobs, setJobs] = useState([]), [team, setTeam] = useState([]), [locations, setLocations] = useState([]);
  const [roster, setRoster] = useState([]), [policy, setPolicy] = useState({ intervalMinutes: 3, freshAfterSeconds: 300 }), [nearbyJob, setNearbyJob] = useState(null);
  const [member, setMember] = useState('all'), [status, setStatus] = useState('all'), [area, setArea] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [more, setMore] = useState(false), [selected, setSelected] = useState(null), [routeMember, setRouteMember] = useState('');
  const [mapReady, setMapReady] = useState(false), [resolved, setResolved] = useState({}), [now, setNow] = useState(() => new Date());
  const [mapBusy, setMapBusy] = useState(false), [mapError, setMapError] = useState(''), [markerCount, setMarkerCount] = useState(0), [lookupRequest, setLookupRequest] = useState({ id: 0, retry: false });
  const element = useRef(null), map = useRef(null), markers = useRef([]), generation = useRef(0), resolver = useRef(null), mapJobs = useRef([]), mapAnchor = useRef(null), fitKey = useRef(''), opener = useRef(null), heading = useRef(null), mapOpening = useRef(false), mapLifetime = useRef(0);
  if (!resolver.current) resolver.current = createDispatchAddressResolver(loadMaps);
  const openDetails = useCallback((job, trigger) => { opener.current = trigger || document.activeElement; setSelected(job); }, []);
  const closeDetails = useCallback(() => setSelected(null), []);
  useEffect(() => { const lifetime = ++mapLifetime.current; return () => { if (mapLifetime.current === lifetime) mapLifetime.current++; markers.current.forEach(marker => { marker.map = null; }); }; }, []);
  const load = useCallback(async () => {
    const ticket = ++generation.current; setBusy(true); setError('');
    try {
      const [work, staff, positions] = await Promise.all([readWorkspace('jobs', { date, limit: 500 }), callWorkspace('rlGetRoutingTeam'), callWorkspace('rlGetTeamLocations')]);
      if (ticket !== generation.current) return;
      setJobs(work.jobs); setMore(work.hasMore); setTeam(staff.team); setLocations(positions.locations); setRoster(positions.roster || []); setPolicy(positions.policy || { intervalMinutes: 3, freshAfterSeconds: 300 }); setNow(new Date());
    } catch (e) { if (ticket === generation.current) setError(e.message); }
    finally { if (ticket === generation.current) setBusy(false); }
  }, [date]);
  useEffect(() => { const lifecycle = generation; setJobs([]); setSelected(null); load(); return () => { lifecycle.current++; }; }, [load]);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => { const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30000); return () => clearInterval(timer); }, [load]);
  const filtered = useMemo(() => jobs.filter(job => (member === 'all' || (member === 'unassigned' ? !job.assignedTo : job.assignedTo === member)) && (status === 'all' || job.status === status) && (!area || `${job.serviceArea || ''} ${job.city || ''} ${job.zipCode || ''}`.toLowerCase().includes(area.toLowerCase()))), [jobs, member, status, area]);
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
    if (!can('jobs.assign')) return;
    setBusy(true); setError('');
    try { await callWorkspace('rlManageJob', { action: 'assign', id: job.id, memberId: memberId || null, expectedVersion: job.updatedAt || null }); setSelected(null); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const currentSelection = selected && (jobs.find(job => job.id === selected.id) || selected);
  if (!can('dispatch.manage')) return <p role="alert">Dispatch access is required.</p>;
  return <><div className="space-y-5" inert={selected ? true : undefined}>
    <div><h1 ref={heading} tabIndex={-1} className="text-2xl font-bold">Dispatch Board</h1><p className="text-gray-600">{company?.name} · Daily field operations</p></div>
    <div className="flex flex-wrap items-end gap-3 rounded border bg-white p-4">
      <label>Service date<input className="block rounded border-gray-300" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <label>Technician<select className="block rounded border-gray-300" value={member} onChange={e => setMember(e.target.value)}><option value="all">All technicians</option><option value="unassigned">Unassigned</option>{team.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>Status<select className="block rounded border-gray-300" value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option>{Object.keys(STATUS_COLORS).map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Service area<input className="block rounded border-gray-300" value={area} onChange={e => setArea(e.target.value)} placeholder="Area, city or ZIP" /></label>
      <button className="rounded border px-4 py-2" onClick={load} disabled={busy}>Refresh</button>
    </div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
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
        <label>Assigned to <select aria-label={`Assign ${job.customerName || job.id}`} className="rounded border-gray-300" value={job.assignedTo || ''} disabled={busy} onChange={e => assign(job, e.target.value)}><option value="">Unassigned</option>{team.map(row => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label>
        {(jobAddress(job) || position(job)) && <a className="ml-3 underline" href={googleNavigation([{ ...job, address: jobAddress(job), location: position(job) }])} target="_blank" rel="noreferrer">Navigate</a>}
        <button className="ml-3 underline" onClick={() => setNearbyJob(job)}>Find nearby on-duty staff</button>
        {nearbyJob?.id === job.id && <section className="space-y-2 rounded bg-emerald-50 p-3" aria-label="Nearby on-duty staff"><strong>Nearby on-duty staff</strong><p className="text-xs">Approximate straight-line distances from current GPS fixes, not driving time. Off-duty, overdue and low-accuracy positions are excluded.</p>
          {!position(job) ? <p>Show the dispatch map to locate service addresses and compare distances for this job.</p> : <>
            {!nearestOnDuty(roster, position(job), Number(now), policy.freshAfterSeconds).length && <p>No on-duty staff have a recent, sufficiently accurate location.</p>}
            {nearestOnDuty(roster, position(job), Number(now), policy.freshAfterSeconds).map(row => <div key={row.memberId} className="flex flex-wrap items-center justify-between gap-2"><span>{row.name} · {(row.distance / 1609.344).toFixed(1)} mi · ±{Math.round(row.location.accuracy)} m</span><button className="underline" disabled={busy || !can('jobs.assign')} onClick={() => assign(job, row.memberId)}>Assign to {row.name}</button></div>)}
          </>}
          <button className="text-sm underline" onClick={() => setNearbyJob(null)}>Close nearby staff</button>
        </section>}
      </article>)}
    </div><aside className="space-y-3"><h2 className="font-semibold">Team shifts, locations and routes</h2><p className="text-sm text-gray-600">Staff start and end their shift in the mobile app. GPS updates target every {policy.intervalMinutes} minutes while on duty, including between jobs. Shift status and GPS freshness are separate. This board refreshes every 30 seconds.</p>
      {team.map(row => { const staff = roster.find(item => item.memberId === row.id) || { memberId: row.id, name: row.name, dutyStatus: 'unknown', location: locations.find(item => item.memberId === row.id) }; return <div key={row.id} className="space-y-1 rounded border bg-white p-3"><strong>{row.name}</strong><TeamLocationStatus member={staff} now={now} freshAfterSeconds={policy.freshAfterSeconds} /><button className="underline" onClick={() => setRouteMember(row.id)}>Open daily route</button></div>; })}
    </aside></div>
    {routeMember && <section className="rounded border bg-white p-5"><button className="mb-4 underline" onClick={() => setRouteMember('')}>Close route planner</button><RoutesPage key={`${date}:${routeMember}`} initialDate={date} initialMemberId={routeMember} /></section>}
  </div>{currentSelection && <DispatchJobDetails job={currentSelection} onClose={closeDetails} returnFocus={opener.current} fallbackFocus={heading.current} destination={position(currentSelection)} />}</>;
}

function DispatchJobDetails({ job, onClose, returnFocus, fallbackFocus, destination }) {
  const panel = useRef(null), close = useRef(null);
  const [visits, setVisits] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(false), [retry, setRetry] = useState(0);
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
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    callWorkspace('rlJobVisit', { action: 'list', jobId: job.id }).then(result => { if (active) setVisits(result.events || []); })
      .catch(failure => { if (active) { setVisits([]); setError(failure.message || 'Visit records could not be loaded. Retry while connected.'); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [job.id, retry]);
  return <div className="fixed inset-0 z-50 flex justify-end bg-gray-900/50" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }} data-testid="job-details-backdrop">
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="dispatch-job-title" tabIndex={-1} className="h-[100dvh] w-full max-w-lg overflow-y-auto bg-white p-5 shadow-2xl sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-sm text-gray-500">Job details</p><h2 id="dispatch-job-title" className="text-xl font-bold">{job.customerName || 'Customer'} · {job.serviceType || 'Service visit'}</h2></div><button ref={close} className="min-h-11 rounded border px-3 py-2" onClick={onClose}>Close details</button></div>
      <div className="space-y-5"><div className="space-y-2 rounded border p-4"><p className="font-semibold" style={{ color: STATUS_COLORS[job.status] || '#374151' }}>Status: {job.status || 'Not set'}</p><p>{job.date} · {job.time || 'Time not set'}</p><p>{jobAddress(job) || 'Service address not set'}</p>{(destination || jobAddress(job)) && <a className="inline-block underline" href={googleNavigation([{ ...job, address: jobAddress(job), location: destination }])} target="_blank" rel="noreferrer">Navigate to service location</a>}</div>
        {!!(job.workNotes || job.notes) && <section><h3 className="mb-2 font-semibold">Work notes</h3><p className="whitespace-pre-wrap">{job.workNotes || job.notes}</p></section>}
        {!!(job.actualWorkDone || job.completionNotes) && <section><h3 className="mb-2 font-semibold">Completed work</h3><p className="whitespace-pre-wrap">{job.actualWorkDone}</p><p className="whitespace-pre-wrap">{job.completionNotes}</p></section>}
        <section><h3 className="mb-2 font-semibold">Visit record</h3><p className="mb-2 text-xs text-gray-600">Manual reports and GPS evidence do not independently verify access to the property.</p>{loading && <p role="status">Loading visit records…</p>}{error && <div><p role="alert" className="text-red-700">{error}</p><button className="mt-2 underline" onClick={() => setRetry(value => value + 1)}>Retry visit records</button></div>}{!loading && !error && !visits.length && <p>No visit events recorded.</p>}
          {visits.map(visit => <article key={visit.id} className="mb-3 rounded border p-3"><strong>{{ arrived: 'Arrived', departed: 'Departed', 'access-blocked': 'Couldn’t access property' }[visit.type] || 'Visit event'}</strong><p className="text-sm">{new Date(visit.capturedAt || visit.recordedAt).toLocaleString()} · {{ manual: 'Reported manually', 'manual-gps': 'Reported manually with GPS', 'gps-evidence': 'Estimated from GPS evidence' }[visit.source] || 'Visit report'}</p>{Number.isFinite(visit.accuracy) && <p className="text-sm">GPS accuracy: ±{Math.round(visit.accuracy)} m</p>}{visit.note && <p className="whitespace-pre-wrap">{visit.note}</p>}</article>)}
        </section><JobPhotos key={job.id} job={job} /><ServiceChecklist key={'form-' + job.id} job={job} />
      </div>
    </section>
  </div>;
}
