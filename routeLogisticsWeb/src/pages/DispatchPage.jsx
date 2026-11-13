import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { readWorkspace, callWorkspace } from '../services/workspaceApi';
import { loadMaps } from '../services/maps';
import { STATUS_COLORS, scheduleWarning, jobPosition, jobAddress } from '../utils/dispatch';
import { googleNavigation } from '../utils/routePlanning';
import RoutesPage from './RoutesPage';
import JobPhotos from '../components/JobPhotos';

const today = () => new Date().toLocaleDateString('en-CA');
export default function DispatchPage() {
  const { company, can } = useAuth();
  const [date, setDate] = useState(today), [jobs, setJobs] = useState([]), [team, setTeam] = useState([]), [locations, setLocations] = useState([]);
  const [member, setMember] = useState('all'), [status, setStatus] = useState('all'), [area, setArea] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [more, setMore] = useState(false), [selected, setSelected] = useState(null), [routeMember, setRouteMember] = useState('');
  const [mapReady, setMapReady] = useState(false), [resolved, setResolved] = useState({}), [now, setNow] = useState(() => new Date());
  const element = useRef(null), map = useRef(null), markers = useRef([]), addressCache = useRef(new Map()), generation = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++generation.current; setBusy(true); setError('');
    try {
      const [work, staff, positions] = await Promise.all([readWorkspace('jobs', { date, limit: 500 }), callWorkspace('rlGetRoutingTeam'), callWorkspace('rlGetTeamLocations')]);
      if (ticket !== generation.current) return;
      setJobs(work.jobs); setMore(work.hasMore); setTeam(staff.team); setLocations(positions.locations); setNow(new Date());
    } catch (e) { if (ticket === generation.current) setError(e.message); }
    finally { if (ticket === generation.current) setBusy(false); }
  }, [date]);
  useEffect(() => { const lifecycle = generation; setJobs([]); setSelected(null); load(); return () => { lifecycle.current++; }; }, [load]);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  const filtered = useMemo(() => jobs.filter(job => (member === 'all' || (member === 'unassigned' ? !job.assignedTo : job.assignedTo === member)) && (status === 'all' || job.status === status) && (!area || `${job.serviceArea || ''} ${job.city || ''} ${job.zipCode || ''}`.toLowerCase().includes(area.toLowerCase()))), [jobs, member, status, area]);
  const position = job => jobPosition(job) || resolved[jobAddress(job)];
  useEffect(() => {
    if (!mapReady) return;
    let active = true;
    (async () => {
      const maps = await loadMaps(), { AdvancedMarkerElement, PinElement } = await maps.importLibrary('marker');
      if (!active) return;
      markers.current.forEach(marker => { marker.map = null; }); markers.current = [];
      const bounds = new maps.LatLngBounds();
      filtered.forEach(job => {
        const point = jobPosition(job) || resolved[jobAddress(job)]; if (!point) return;
        const pin = new PinElement({ background: STATUS_COLORS[job.status] || '#6b7280', borderColor: '#ffffff', glyphColor: '#ffffff' });
        const marker = new AdvancedMarkerElement({ map: map.current, position: point, title: `${job.customerName || 'Job'} · ${job.status}`, content: pin.element });
        marker.addListener('click', () => setSelected(job)); markers.current.push(marker); bounds.extend(point);
      });
      locations.filter(location => member === 'all' || member === location.memberId).forEach(location => {
        const pin = new PinElement({ background: location.state === 'live' ? '#0f766e' : '#475569', glyph: 'T', glyphColor: '#ffffff' });
        const marker = new AdvancedMarkerElement({ map: map.current, position: { lat: location.lat, lng: location.lng }, title: `${location.name} · ${location.state} · ${location.updatedAt}`, content: pin.element });
        markers.current.push(marker); bounds.extend({ lat: location.lat, lng: location.lng });
      });
      if (!bounds.isEmpty()) map.current.fitBounds(bounds, 40);
    })().catch(e => setError(e.message));
    return () => { active = false; markers.current.forEach(marker => { marker.map = null; }); };
  }, [filtered, resolved, locations, member, mapReady]);
  const openMap = async () => {
    setBusy(true); setError('');
    try { const maps = await loadMaps(), { Map: GoogleMap } = await maps.importLibrary('maps'); map.current ||= new GoogleMap(element.current, { center: { lat: 39, lng: -98 }, zoom: 4, mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID' }); setMapReady(true); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const locate = async () => {
    const pending = [...new Map(filtered.filter(job => !position(job) && jobAddress(job)).map(job => [jobAddress(job), job])).values()].slice(0, 25);
    if (!pending.length) return;
    setBusy(true); setError('');
    try {
      const addresses = pending.map(jobAddress), fingerprint = addresses.join('|');
      let points = addressCache.current.get(fingerprint);
      if (!points) {
        const maps = await loadMaps(), { Route } = await maps.importLibrary('routes');
        const request = { origin: addresses[0], destination: addresses.at(-1), intermediates: addresses.slice(1, -1).map(location => ({ location })), travelMode: 'DRIVING', routingPreference: 'TRAFFIC_UNAWARE', fields: ['legs'] };
        const result = (await Route.computeRoutes(request)).routes[0];
        if (!result?.legs?.length) throw new Error('These addresses could not be located. Check the service addresses.');
        points = {};
        const locations = [result.legs[0].startLocation, ...result.legs.map(leg => leg.endLocation)];
        addresses.forEach((address, index) => { const point = locations[index]; if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) points[address] = { lat: point.lat, lng: point.lng }; });
        addressCache.current.set(fingerprint, points);
      }
      setResolved(previous => ({ ...previous, ...points }));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const assign = async (job, memberId) => {
    if (!can('jobs.assign')) return;
    setBusy(true); setError('');
    try { await callWorkspace('rlManageJob', { action: 'assign', id: job.id, memberId: memberId || null, expectedVersion: job.updatedAt || null }); setSelected(null); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  if (!can('dispatch.manage')) return <p role="alert">Dispatch access is required.</p>;
  return <div className="space-y-5">
    <div><h1 className="text-2xl font-bold">Dispatch Board</h1><p className="text-gray-600">{company?.name} · Daily field operations</p></div>
    <div className="flex flex-wrap items-end gap-3 rounded border bg-white p-4">
      <label>Service date<input className="block rounded border-gray-300" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <label>Technician<select className="block rounded border-gray-300" value={member} onChange={e => setMember(e.target.value)}><option value="all">All technicians</option><option value="unassigned">Unassigned</option>{team.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>Status<select className="block rounded border-gray-300" value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option>{Object.keys(STATUS_COLORS).map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Service area<input className="block rounded border-gray-300" value={area} onChange={e => setArea(e.target.value)} placeholder="Area, city or ZIP" /></label>
      <button className="rounded border px-4 py-2" onClick={load} disabled={busy}>Refresh</button>
    </div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <div className="rounded border bg-white p-4 space-y-3">
      <div className="flex flex-wrap gap-3">{!mapReady && <button className="rounded bg-primary-600 px-4 py-2 text-white" disabled={busy} onClick={openMap}>Show dispatch map</button>}{mapReady && <button className="rounded border px-4 py-2" disabled={busy || !filtered.some(job => !position(job) && jobAddress(job))} onClick={locate}>Locate next 25 service addresses</button>}<span>{filtered.length} jobs · {jobs.filter(job => !job.assignedTo).length} unassigned</span></div>
      <div ref={element} className={mapReady ? 'h-96 rounded bg-gray-100' : 'h-0'} aria-label="Dispatch map" />
      <div className="flex flex-wrap gap-4 text-sm">{Object.entries(STATUS_COLORS).map(([label, color]) => <span key={label}><span style={{ color }}>●</span> {label}</span>)}</div>
      <p className="text-sm text-gray-600">{filtered.filter(job => !position(job)).length} jobs need a mapped address. Address lookup runs only when requested, in batches of 25. Map points resolved from driving routes are approximate road access points.</p>
    </div>
    <div className="grid gap-5 lg:grid-cols-3"><div className="lg:col-span-2 space-y-3">
      {more && <p role="status">Showing the first 500 jobs for this date.</p>}
      {!filtered.length && <p>No jobs match these filters.</p>}
      {filtered.map(job => <article key={job.id} className="rounded border bg-white p-4 space-y-2" style={{ borderLeft: `5px solid ${STATUS_COLORS[job.status] || '#6b7280'}` }}>
        <button className="font-semibold underline" onClick={() => setSelected(job)}>{job.customerName || 'Customer'} · {job.serviceType}</button><p>{job.time || 'Time not set'} · {job.status} · {jobAddress(job) || 'Service address not set'}</p>
        {scheduleWarning(job, now, company?.timeZone) && <p className="text-amber-800">{scheduleWarning(job, now, company?.timeZone)} · schedule-based, not a traffic prediction</p>}
        <label>Assigned to <select aria-label={`Assign ${job.customerName || job.id}`} className="rounded border-gray-300" value={job.assignedTo || ''} disabled={busy} onChange={e => assign(job, e.target.value)}><option value="">Unassigned</option>{team.map(row => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label>
        {(jobAddress(job) || position(job)) && <a className="ml-3 underline" href={googleNavigation([{ ...job, address: jobAddress(job), location: position(job) }])} target="_blank" rel="noreferrer">Navigate</a>}
      </article>)}
    </div><aside className="space-y-3"><h2 className="font-semibold">Team locations and routes</h2><p className="text-sm text-gray-600">Positions are shared voluntarily during work. Refresh to retrieve newer positions.</p>
      {team.map(row => { const location = locations.find(item => item.memberId === row.id); const state = location?.state === 'live' && now - new Date(location.updatedAt) > 180000 ? 'stale' : location?.state || 'unavailable'; return <div key={row.id} className="rounded border bg-white p-3"><strong>{row.name}</strong><p>{state.replaceAll('-', ' ')}</p>{location && <p className="text-sm">Last fix: {new Date(location.updatedAt).toLocaleString()} · ±{Math.round(location.accuracy)} m</p>}<button className="underline" onClick={() => setRouteMember(row.id)}>Open daily route</button></div>; })}
    </aside></div>
    {selected && <section className="rounded border bg-white p-5 space-y-3" aria-label="Job details"><button onClick={() => setSelected(null)} className="float-right underline">Close details</button><h2 className="text-xl font-bold">{selected.customerName} · {selected.serviceType}</h2><p>{jobAddress(selected)} · {selected.date} {selected.time}</p><p>{selected.notes}</p><p>{selected.actualWorkDone || selected.completionNotes}</p><JobPhotos job={selected} /></section>}
    {routeMember && <section className="rounded border bg-white p-5"><button className="mb-4 underline" onClick={() => setRouteMember('')}>Close route planner</button><RoutesPage key={`${date}:${routeMember}`} initialDate={date} initialMemberId={routeMember} /></section>}
  </div>;
}
