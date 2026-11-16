import SelectControl from '../components/SelectControl';
import { useEffect, useRef, useState } from 'react';
import { callWorkspace } from '../services/workspaceApi';
import { useAuth } from '../contexts/AuthContext';
import { loadMaps } from '../services/maps';
import TeamLocationStatus from '../components/TeamLocationStatus';
import StaffAvailabilityEditor from '../components/StaffAvailabilityEditor';
import { locationState, LOCATION_LABELS } from '../utils/workLocations';
import toast from 'react-hot-toast';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useWorkspaceQuery } from '../hooks/useWorkspaceQuery';
const EMPTY_LOCATIONS = [];

export default function TeamLocationsPage() {
  const { company, currentUser } = useAuth();
  return <TeamLocationsWorkspace key={`${currentUser?.uid || ''}:${company?.id || ''}`} />;
}

function TeamLocationsWorkspace() {
  const { company, currentUser, role } = useAuth();
  const teamQuery = useWorkspaceQuery(['team-locations'], () => callWorkspace('rlGetTeamLocations'));
  const locations = teamQuery.data?.locations || EMPTY_LOCATIONS;
  const roster = teamQuery.data?.roster || locations.map(row => ({ ...row, dutyStatus: 'unknown', location: row }));
  const policy = teamQuery.data?.policy || { intervalMinutes: 3, retentionHours: 24, freshAfterSeconds: 300, maxShiftHours: 12 };
  const setPolicy = updater => teamQuery.setData(previous => ({ ...previous, policy: typeof updater === 'function' ? updater(previous?.policy || policy) : updater }));
  const [intervalMinutes, setIntervalMinutes] = useState(3), [hours, setHours] = useState(24);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [mapReady, setMapReady] = useState(false), [now, setNow] = useState(Date.now);
  const element = useRef(null), map = useRef(null), markers = useRef([]), generation = useRef(0), dirtyRef = useRef({ interval: false, retention: false }), saving = useRef(false);
  const intervalChanged = Number(intervalMinutes) !== Number(policy.intervalMinutes), retentionChanged = Number(hours) !== Number(policy.retentionHours);
  dirtyRef.current = { interval: intervalChanged, retention: retentionChanged };
  useUnsavedChanges(company?.ownerId === currentUser?.uid && (intervalChanged || retentionChanged), { message: 'You have unsaved location policy changes. Leave without saving them?' });
  const load = async () => {
    const result = await teamQuery.refetch();
    if (result.error) setError(result.error.message);
    else setError('');
    return result.data;
  };
  useEffect(() => {
    if (!teamQuery.data) return;
    const next = teamQuery.data.policy || { intervalMinutes: 3, retentionHours: teamQuery.data.retentionHours || 24, freshAfterSeconds: 300, maxShiftHours: 12 };
    setNow(Date.now());
    if (!dirtyRef.current.retention) setHours(next.retentionHours);
    if (!dirtyRef.current.interval) setIntervalMinutes(next.intervalMinutes);
  }, [teamQuery.data]);
  useEffect(() => {
    const lifecycle = generation;
    lifecycle.current++; dirtyRef.current = { interval: false, retention: false };
    return () => { lifecycle.current++; markers.current.forEach(marker => { marker.map = null; }); };
  }, [company?.id]);
  useEffect(() => {
    if (!mapReady) return;
    let active = true;
    (async () => {
      const maps = await loadMaps(), { AdvancedMarkerElement, PinElement } = await maps.importLibrary('marker');
      if (!active) return;
      markers.current.forEach(marker => { marker.map = null; }); markers.current = [];
      const bounds = new maps.LatLngBounds();
      markers.current = locations.map(location => {
        const position = { lat: location.lat, lng: location.lng }, state = locationState(location, now, policy.freshAfterSeconds);
        bounds.extend(position);
        const pin = new PinElement({ background: state === 'live' ? '#047857' : '#64748b', glyph: 'T', glyphColor: '#ffffff' });
        return new AdvancedMarkerElement({ map: map.current, position, content: pin.element, title: location.name + ' · ' + (LOCATION_LABELS[state] || LOCATION_LABELS.unavailable) + ' · ' + (location.capturedAt || location.updatedAt) });
      });
      if (!bounds.isEmpty()) map.current.fitBounds(bounds, 40);
    })().catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; markers.current.forEach(marker => { marker.map = null; }); markers.current = []; };
  }, [locations, mapReady, now, policy.freshAfterSeconds]);
  const showMap = async () => {
    setBusy(true); setError('');
    try {
      const maps = await loadMaps(), { Map: GoogleMap } = await maps.importLibrary('maps'), first = locations[0];
      map.current ||= new GoogleMap(element.current, { center: first ? { lat: first.lat, lng: first.lng } : { lat: 39, lng: -98 }, zoom: 10, mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID' });
      setMapReady(true);
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };
  const save = async retention => {
    if (busy || saving.current || company?.ownerId !== currentUser?.uid || !(retention ? retentionChanged : intervalChanged)) return;
    const ticket = generation.current, value = Number(retention ? hours : intervalMinutes);
    saving.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      if (retention) await callWorkspace('rlSetLocationRetention', { companyId: company.id, hours: value });
      else await callWorkspace('rlSetLocationPolicy', { companyId: company.id, intervalMinutes: value });
      if (ticket !== generation.current) return;
      setPolicy(previous => ({ ...previous, [retention ? 'retentionHours' : 'intervalMinutes']: value }));
      dirtyRef.current = { ...dirtyRef.current, [retention ? 'retention' : 'interval']: false };
      setMessage(retention ? 'Location retention saved.' : 'Location interval saved. Active shifts pick up the new interval at their next successful update.');
      toast.success(retention ? 'Location retention saved.' : 'Location interval saved.');
      await load();
    } catch (failure) { if (ticket === generation.current) { setError(failure.message); toast.error(failure.message || 'Location policy could not be saved.'); } }
    finally { saving.current = false; if (ticket === generation.current) setBusy(false); }
  };
  return <div className="space-y-5">
    <h1 className="text-2xl font-bold">Team shifts and locations</h1>
    <p>On-duty staff share their position between jobs as well as during visits. Shift status is separate from GPS freshness. Mobile updates target every {policy.intervalMinutes} minutes; device permissions and operating-system scheduling can delay them.</p>
    <p className="text-sm text-gray-600">Staff explicitly start and end shifts in the mobile app. A shift lasts at most {policy.maxShiftHours || 12} hours. This page refreshes every 30 seconds.</p>
    {company?.ownerId === currentUser?.uid && <section className="space-y-4 rounded border bg-white p-4" aria-label="Owner location policy">
      <h2 className="font-semibold">Location policy</h2>
      <div className="flex flex-wrap items-end gap-3"><label>On-duty GPS update interval<SelectControl aria-label="On-duty GPS update interval" className="mt-1 block rounded border-gray-300" value={intervalMinutes} disabled={busy} onChange={event => setIntervalMinutes(Number(event.target.value))}>{[1,3,5].map(value => <option key={value} value={value}>{value} minute{value === 1 ? '' : 's'}</option>)}</SelectControl></label><button className="btn-primary" disabled={busy || !intervalChanged} onClick={() => save(false)}>Save interval</button></div>
      <div className="flex flex-wrap items-end gap-3"><label>Last-location retention (hours)<input aria-label="Last-location retention (hours)" className="mt-1 block w-24 rounded border-gray-300" type="number" min="1" max="168" value={hours} disabled={busy} onChange={event => setHours(event.target.value)} /></label><button className="btn-secondary" disabled={busy || !retentionChanged || !Number.isFinite(Number(hours)) || Number(hours) < 1 || Number(hours) > 168} onClick={() => save(true)}>Save retention</button></div>
    </section>}
    <div className="flex flex-wrap items-center gap-4"><button onClick={load} className="underline">Refresh list</button>{!mapReady && <button onClick={showMap} disabled={busy || !locations.length} className="underline disabled:opacity-50">Show team locations on map</button>}</div>
    {message && <p role="status" className="text-emerald-800">{message}</p>}
    {(error || teamQuery.error || teamQuery.data?.truncated) && <p role="alert" className="text-red-700">{error || teamQuery.error?.message || 'Showing the first 500 location records.'}</p>}
    <ul className="divide-y rounded border bg-white">{roster.map(member => <li className="space-y-2 p-4" key={member.memberId}><strong>{member.name}</strong><TeamLocationStatus member={member} now={now} freshAfterSeconds={policy.freshAfterSeconds} /><StaffAvailabilityEditor companyId={company?.id} member={member} allowed={['owner', 'manager'].includes(role)} onChanged={load} /></li>)}</ul>
    {!roster.length && !error && <p>No active team members are available to display.</p>}
    <div ref={element} className={mapReady ? 'h-96 rounded border bg-gray-100' : 'h-0'} aria-label="Team location map" />
  </div>;
}
