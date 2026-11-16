import SelectControl from '../components/SelectControl';
import { useCallback, useEffect, useRef, useState } from 'react';
import TimeSelect from '../components/TimeSelect';
import { callWorkspace } from '../services/workspaceApi';
import { loadMaps } from '../services/maps';
import { appointmentWarnings, googleNavigation } from '../utils/routePlanning';
import { can } from '../services/tenancy';
import MyWorkPage from './MyWorkPage';
import toast from 'react-hot-toast';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useWorkspaceQuery } from '../hooks/useWorkspaceQuery';
import { workspaceAccessError } from '../services/workspaceQueryPolicy';
const call = (name, data) => callWorkspace(name, data);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function RoutePlanner({ initialMemberId = '', initialDate = today() }) {
  const [memberId, setMemberId] = useState(initialMemberId), [date, setDate] = useState(initialDate);
  const teamQuery = useWorkspaceQuery(['team'], () => call('rlGetRoutingTeam'));
  const team = teamQuery.data?.team || [];
  const routeQuery = useWorkspaceQuery(['route', memberId, date], () => call('rlGetDailyRoute', { memberId, date }), { enabled: !!memberId });
  const [stops, setStops] = useState([]), [selected, setSelected] = useState([]), [revision, setRevision] = useState(0);
  const [startAddress, setStartAddress] = useState(''), [returnToStart, setReturnToStart] = useState(true), [keepAppointments, setKeepAppointments] = useState(true), [startTime, setStartTime] = useState('08:00');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [estimate, setEstimate] = useState(null);
  const [savedRoute, setSavedRoute] = useState(null);
  const element = useRef(null), map = useRef(null), overlays = useRef([]), cache = useRef(null), generation = useRef(0);
  const saving = useRef(false), touched = useRef(false), editor = useRef(null);
  const chosen = stops.filter((stop) => selected.includes(stop.id));
  const routeInput = { memberId, date, jobIds: chosen.map(stop => stop.id), startAddress, returnToStart };
  const changed = !!savedRoute && JSON.stringify(routeInput) !== JSON.stringify(savedRoute);
  editor.current = { memberId, date, startAddress, returnToStart, changed, busy, stops, selected };
  const { confirmDiscard } = useUnsavedChanges(changed, { scope: 'route-planner', message: 'Your route changes have not been saved. Leave without saving the stop order?' });
  const clearRoute = useCallback(() => { overlays.current.forEach((item) => { if (item.setMap) item.setMap(null); else item.map = null; }); overlays.current = []; setEstimate(null); }, []);
  useEffect(() => {
    const data = teamQuery.data;
    if (!data) return;
    setMemberId(current => current || data.team[0]?.id || '');
    if (!touched.current && !editor.current.stops.length) setStartAddress(data.startAddress || '');
  }, [teamQuery.data]);
  useEffect(() => { const lifecycle = generation; return () => { lifecycle.current++; overlays.current.forEach((item) => { if (item.setMap) item.setMap(null); else item.map = null; }); }; }, []);
  const applyRoute = useCallback(data => {
    const state = editor.current, order = data.saved?.jobIds || [];
    const next = [...data.stops].sort((a, b) => (order.includes(a.id) ? order.indexOf(a.id) : 1000) - (order.includes(b.id) ? order.indexOf(b.id) : 1000));
    const chosen = next.filter(stop => (stop.location || stop.address) && (!order.length || order.includes(stop.id))).slice(0, 25).map(stop => stop.id);
    const address = data.saved?.startAddress ?? state.startAddress, returns = data.saved?.returnToStart ?? state.returnToStart;
    if (JSON.stringify(chosen) !== JSON.stringify(state.selected) || address !== state.startAddress || returns !== state.returnToStart) clearRoute();
    setStops(next); setSelected(chosen); setRevision(data.saved?.revision || 0);
    setSavedRoute({ memberId: state.memberId, date: state.date, jobIds: order, startAddress: address, returnToStart: returns });
    if (data.saved) { setStartAddress(address); setReturnToStart(returns); }
    if (data.truncated) setMessage('Showing the first 100 eligible jobs.');
  }, [clearRoute]);
  useEffect(() => {
    if (routeQuery.data && !editor.current.changed && !editor.current.busy && !touched.current && !saving.current) applyRoute(routeQuery.data);
  }, [routeQuery.data, applyRoute]);
  useEffect(() => {
    if ([teamQuery.error, routeQuery.error].some(workspaceAccessError)) { generation.current++; touched.current = false; setStops([]); setSelected([]); setSavedRoute(null); setRevision(0); setStartAddress(''); clearRoute(); }
  }, [teamQuery.error, routeQuery.error, clearRoute]);
  const reset = () => { generation.current++; touched.current = false; setStops([]); setSelected([]); setRevision(0); setSavedRoute(null); setMessage(''); clearRoute(); };
  const load = async () => {
    if (changed && !(await confirmDiscard())) return;
    const ticket = ++generation.current; setBusy(true); setError(''); setMessage(''); setSavedRoute(null); clearRoute(); setStops([]); setSelected([]);
    try {
      const result = await routeQuery.refetch(); if (ticket !== generation.current) return;
      if (result.error) throw result.error;
      touched.current = false; applyRoute(result.data);
    } catch (e) { if (ticket === generation.current) { setError(e.message); toast.error(e.message || 'The route could not be loaded.'); } } finally { if (ticket === generation.current) setBusy(false); }
  };
  const move = (index, direction) => { touched.current = true; const next = [...stops]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; setStops(next); setKeepAppointments(false); clearRoute(); };
  const calculate = async () => {
    if (!chosen.length || chosen.length > 25) { setError('Select between 1 and 25 stops.'); return; }
    if (!startAddress.trim() && chosen.length < 2) { setError('Enter a starting address for a single-stop route.'); return; }
    touched.current = true; setBusy(true); setError(''); clearRoute();
    try {
      const maps = await loadMaps(); const { Map } = await maps.importLibrary('maps'); const { Route } = await maps.importLibrary('routes'); await maps.importLibrary('marker');
      map.current ||= new Map(element.current, { center: chosen[0].location || { lat: 39, lng: -98 }, zoom: 10, mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID' });
      const ordered = keepAppointments ? [...chosen].sort((a, b) => a.time.localeCompare(b.time)) : [...chosen];
      const location = (s) => s.location || s.address;
      const origin = startAddress.trim() || location(ordered[0]);
      const destination = startAddress.trim() && returnToStart ? startAddress.trim() : location(ordered.at(-1));
      const middle = ordered.slice(startAddress.trim() ? 0 : 1, startAddress.trim() && returnToStart ? undefined : -1);
      const request = { origin, destination, intermediates: middle.map((s) => ({ location: location(s) })), travelMode: 'DRIVING', routingPreference: 'TRAFFIC_UNAWARE', optimizeWaypointOrder: !keepAppointments, fields: ['path', 'legs', 'durationMillis', 'distanceMeters', 'optimizedIntermediateWaypointIndices'] };
      const fingerprint = JSON.stringify(request);
      const route = cache.current?.key === fingerprint && Date.now() - cache.current.at < 600000 ? cache.current.route : (await Route.computeRoutes(request)).routes[0];
      if (!route) throw new Error('No driving route was found. Check stop addresses and coordinates.');
      cache.current = { key: fingerprint, route, at: Date.now() };
      const optimized = route.optimizedIntermediateWaypointIndices?.length ? route.optimizedIntermediateWaypointIndices.map((i) => middle[i]) : middle;
      const final = [...(startAddress.trim() ? [] : [ordered[0]]), ...optimized, ...(startAddress.trim() && returnToStart ? [] : [ordered.at(-1)])];
      setStops([...final, ...stops.filter((s) => !selected.includes(s.id))]);
      const lines = route.createPolylines(); lines.forEach((line) => line.setMap(map.current)); overlays.current = [...lines, ...(await route.createWaypointAdvancedMarkers({ map: map.current }))];
      const bounds = new maps.LatLngBounds(); lines.forEach((line) => line.getPath().forEach((point) => bounds.extend(point))); if (!bounds.isEmpty()) map.current.fitBounds(bounds);
      setEstimate({ minutes: Math.ceil(route.durationMillis / 60000), miles: (route.distanceMeters / 1609.344).toFixed(1), warnings: appointmentWarnings(final, route.legs || [], startTime, !startAddress.trim()) });
    } catch (e) { setError(e.message || 'Route calculation failed. Check Maps configuration and addresses.'); } finally { setBusy(false); }
  };
  const save = async () => {
    if (saving.current || !changed) return;
    const submitted = routeInput, ticket = generation.current;
    saving.current = true; setBusy(true); setError('');
    try {
      const data = await call('rlSaveDailyRoute', { ...submitted, revision });
      if (ticket !== generation.current) return;
      touched.current = false; setRevision(data.revision); setSavedRoute(submitted); setMessage('Stop order saved.'); toast.success('Stop order saved.');
    } catch (failure) { if (ticket === generation.current) { const detail = failure.message || 'Stop order was not saved. Your changes are retained.'; setError(detail); toast.error(detail); } }
    finally { saving.current = false; if (ticket === generation.current) setBusy(false); }
  };
  return <div className="space-y-5"><h1 className="text-2xl font-bold">Daily routes</h1><div className="flex flex-wrap items-end gap-3"><label>Technician<SelectControl className="block rounded border-gray-300" value={memberId} disabled={busy} onChange={async (e) => { const value = e.target.value; if (!changed || await confirmDiscard()) { reset(); setMemberId(value); } }}>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</SelectControl></label><label>Service date<input className="block rounded border-gray-300" type="date" value={date} disabled={busy} onChange={async (e) => { const value = e.target.value; if (!changed || await confirmDiscard()) { reset(); setDate(value); } }} /></label><button disabled={busy || !memberId} onClick={load} className="rounded bg-primary-600 px-4 py-2 text-white disabled:opacity-50">Load jobs</button></div>
    <div className="rounded border bg-white p-4"><label className="block">Start address<input className="mt-1 w-full rounded border-gray-300" value={startAddress} maxLength={500} onChange={(e) => { touched.current = true; setStartAddress(e.target.value); clearRoute(); }} disabled={busy} placeholder="Leave empty to start at the first job" /></label><div className="mt-3 flex flex-wrap gap-4"><label><input type="checkbox" checked={returnToStart} onChange={(e) => { touched.current = true; setReturnToStart(e.target.checked); clearRoute(); }} disabled={busy || !startAddress.trim()} /> Return to start</label><label><input type="checkbox" checked={keepAppointments} onChange={(e) => { touched.current = true; setKeepAppointments(e.target.checked); clearRoute(); }} disabled={busy} /> Keep appointment order</label><TimeSelect label="Depart" value={startTime} onChange={time => { touched.current = true; setStartTime(time); clearRoute(); }} disabled={busy} className="w-40" /></div><p className="mt-2 text-sm text-gray-600">Uncheck appointment order to optimize intermediate stops. Start/end points stay fixed; review arrival warnings before saving. Travel estimates exclude service time.</p></div>
    <ol className="divide-y rounded border bg-white">{stops.map((stop, i) => <li key={stop.id} className="flex flex-wrap items-center gap-3 p-3"><input aria-label={`Include ${stop.customerName}`} type="checkbox" checked={selected.includes(stop.id)} disabled={busy || (!stop.location && !stop.address)} onChange={(e) => { touched.current = true; setSelected(e.target.checked ? [...selected, stop.id] : selected.filter((id) => id !== stop.id)); clearRoute(); }} /><div className="min-w-0 flex-1"><strong>{stop.customerName}</strong><p className="text-sm">{stop.time} · {stop.serviceType} · {stop.address || (stop.location ? 'Coordinates available' : 'Add a valid address or coordinates')}</p></div><button disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${stop.customerName} earlier`}>↑</button><button disabled={busy || i === stops.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${stop.customerName} later`}>↓</button></li>)}</ol>
    <div className="flex flex-wrap gap-3"><button disabled={busy || !chosen.length} onClick={calculate} className="rounded bg-primary-600 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Working…' : 'Calculate route'}</button><button disabled={busy || !changed || !chosen.length || chosen.length > 25} onClick={save} className="rounded border px-4 py-2 disabled:opacity-50">Save stop order</button>{Array.from({ length: Math.ceil(chosen.length / 4) }, (_, i) => <a key={i} href={googleNavigation(chosen.slice(i * 4, i * 4 + 4))} target="_blank" rel="noreferrer" className="self-center underline">Navigate stops {i * 4 + 1}–{Math.min(chosen.length, i * 4 + 4)}</a>)}</div>
    {estimate && <div className="rounded border bg-white p-4"><p className="font-semibold">Estimated driving: {estimate.minutes} minutes · {estimate.miles} miles</p>{estimate.warnings.map((warning) => <p className="mt-2 text-amber-800" key={warning}>{warning}</p>)}</div>}
    <div ref={element} className="h-80 rounded border bg-gray-100" aria-label="Daily route map" />{message && <p role="status">{message}</p>}{(error || teamQuery.error || routeQuery.error) && <p role="alert" className="text-red-700">{error || (teamQuery.error || routeQuery.error).message}</p>}
  </div>;
}
export default function RoutesPage(props) {
  return can('routes.optimize') ? <RoutePlanner {...props} /> : <MyWorkPage />;
}
