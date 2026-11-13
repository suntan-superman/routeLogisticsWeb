import { useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';
import { loadMaps } from '../services/maps';
import { appointmentWarnings, googleNavigation } from '../utils/routePlanning';
const call = (name, data) => httpsCallable(functions, name)(data).then((r) => r.data);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function RoutesPage() {
  const [team, setTeam] = useState([]), [memberId, setMemberId] = useState(''), [date, setDate] = useState(today);
  const [stops, setStops] = useState([]), [selected, setSelected] = useState([]), [revision, setRevision] = useState(0);
  const [startAddress, setStartAddress] = useState(''), [returnToStart, setReturnToStart] = useState(true), [keepAppointments, setKeepAppointments] = useState(true), [startTime, setStartTime] = useState('08:00');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [estimate, setEstimate] = useState(null);
  const element = useRef(null), map = useRef(null), overlays = useRef([]), cache = useRef(null), generation = useRef(0);
  const clearRoute = () => { overlays.current.forEach((item) => { if (item.setMap) item.setMap(null); else item.map = null; }); overlays.current = []; setEstimate(null); };
  useEffect(() => { const lifecycle = generation; let active = true; call('rlGetRoutingTeam').then((data) => { if (active) { setTeam(data.team); setMemberId(data.team[0]?.id || ''); setStartAddress(data.startAddress); } }).catch((e) => { if (active) setError(e.message); }); return () => { active = false; lifecycle.current++; overlays.current.forEach((item) => { if (item.setMap) item.setMap(null); else item.map = null; }); }; }, []);
  const reset = () => { generation.current++; setStops([]); setSelected([]); setRevision(0); setMessage(''); clearRoute(); };
  const load = async () => {
    const ticket = ++generation.current; setBusy(true); setError(''); setMessage(''); clearRoute(); setStops([]); setSelected([]);
    try {
      const data = await call('rlGetDailyRoute', { memberId, date }); if (ticket !== generation.current) return;
      const order = data.saved?.jobIds || []; data.stops.sort((a, b) => (order.includes(a.id) ? order.indexOf(a.id) : 1000) - (order.includes(b.id) ? order.indexOf(b.id) : 1000));
      setStops(data.stops); setSelected(data.stops.filter((s) => (s.location || s.address) && (!order.length || order.includes(s.id))).slice(0, 25).map((s) => s.id)); setRevision(data.saved?.revision || 0);
      if (data.saved) { setStartAddress(data.saved.startAddress); setReturnToStart(data.saved.returnToStart); }
      if (data.truncated) setMessage('Showing the first 100 eligible jobs.');
    } catch (e) { setError(e.message); } finally { if (ticket === generation.current) setBusy(false); }
  };
  const chosen = stops.filter((s) => selected.includes(s.id));
  const move = (index, direction) => { const next = [...stops]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; setStops(next); setKeepAppointments(false); clearRoute(); };
  const calculate = async () => {
    if (!chosen.length || chosen.length > 25) { setError('Select between 1 and 25 stops.'); return; }
    if (!startAddress.trim() && chosen.length < 2) { setError('Enter a starting address for a single-stop route.'); return; }
    setBusy(true); setError(''); clearRoute();
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
  const save = async () => { setBusy(true); setError(''); try { const data = await call('rlSaveDailyRoute', { memberId, date, jobIds: chosen.map((s) => s.id), startAddress, returnToStart, revision }); setRevision(data.revision); setMessage('Stop order saved.'); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <div className="space-y-5"><h1 className="text-2xl font-bold">Daily routes</h1><div className="flex flex-wrap items-end gap-3"><label>Technician<select className="block rounded border-gray-300" value={memberId} disabled={busy} onChange={(e) => { reset(); setMemberId(e.target.value); }}>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>Service date<input className="block rounded border-gray-300" type="date" value={date} disabled={busy} onChange={(e) => { reset(); setDate(e.target.value); }} /></label><button disabled={busy || !memberId} onClick={load} className="rounded bg-primary-600 px-4 py-2 text-white disabled:opacity-50">Load jobs</button></div>
    <div className="rounded border bg-white p-4"><label className="block">Start address<input className="mt-1 w-full rounded border-gray-300" value={startAddress} onChange={(e) => { setStartAddress(e.target.value); clearRoute(); }} disabled={busy} placeholder="Leave empty to start at the first job" /></label><div className="mt-3 flex flex-wrap gap-4"><label><input type="checkbox" checked={returnToStart} onChange={(e) => { setReturnToStart(e.target.checked); clearRoute(); }} disabled={busy || !startAddress.trim()} /> Return to start</label><label><input type="checkbox" checked={keepAppointments} onChange={(e) => { setKeepAppointments(e.target.checked); clearRoute(); }} disabled={busy} /> Keep appointment order</label><label>Depart <input type="time" value={startTime} onChange={(e) => { setStartTime(e.target.value); clearRoute(); }} disabled={busy} /></label></div><p className="mt-2 text-sm text-gray-600">Uncheck appointment order to optimize intermediate stops. Start/end points stay fixed; review arrival warnings before saving. Travel estimates exclude service time.</p></div>
    <ol className="divide-y rounded border bg-white">{stops.map((stop, i) => <li key={stop.id} className="flex flex-wrap items-center gap-3 p-3"><input aria-label={`Include ${stop.customerName}`} type="checkbox" checked={selected.includes(stop.id)} disabled={busy || (!stop.location && !stop.address)} onChange={(e) => { setSelected(e.target.checked ? [...selected, stop.id] : selected.filter((id) => id !== stop.id)); clearRoute(); }} /><div className="min-w-0 flex-1"><strong>{stop.customerName}</strong><p className="text-sm">{stop.time} · {stop.serviceType} · {stop.address || (stop.location ? 'Coordinates available' : 'Add a valid address or coordinates')}</p></div><button disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${stop.customerName} earlier`}>↑</button><button disabled={busy || i === stops.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${stop.customerName} later`}>↓</button></li>)}</ol>
    <div className="flex flex-wrap gap-3"><button disabled={busy || !chosen.length} onClick={calculate} className="rounded bg-primary-600 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Working…' : 'Calculate route'}</button><button disabled={busy || !chosen.length || chosen.length > 25} onClick={save} className="rounded border px-4 py-2 disabled:opacity-50">Save stop order</button>{Array.from({ length: Math.ceil(chosen.length / 4) }, (_, i) => <a key={i} href={googleNavigation(chosen.slice(i * 4, i * 4 + 4))} target="_blank" rel="noreferrer" className="self-center underline">Navigate stops {i * 4 + 1}–{Math.min(chosen.length, i * 4 + 4)}</a>)}</div>
    {estimate && <div className="rounded border bg-white p-4"><p className="font-semibold">Estimated driving: {estimate.minutes} minutes · {estimate.miles} miles</p>{estimate.warnings.map((warning) => <p className="mt-2 text-amber-800" key={warning}>{warning}</p>)}</div>}
    <div ref={element} className="h-80 rounded border bg-gray-100" aria-label="Daily route map" />{message && <p role="status">{message}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}
