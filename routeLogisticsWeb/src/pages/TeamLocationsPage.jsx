import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { loadMaps } from '../services/maps';
export default function TeamLocationsPage() {
  const { company, currentUser } = useAuth();
  const [locations, setLocations] = useState([]), [hours, setHours] = useState(24), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const element = useRef(null), map = useRef(null), markers = useRef([]), live = useRef(true);
  const load = useCallback(async () => {
    try { const { data } = await httpsCallable(functions, 'rlGetTeamLocations')(); if (live.current) { setLocations(data.locations); setHours(data.retentionHours); setError(data.truncated ? 'Showing the first 500 location records.' : ''); } }
    catch (e) { if (live.current) { setLocations([]); setError(e.message); } }
  }, []);
  useEffect(() => { live.current = true; load(); const interval = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30000); return () => { live.current = false; clearInterval(interval); markers.current.forEach((m) => { m.map = null; }); }; }, [load]);
  const showMap = async () => {
    setBusy(true); setError('');
    try {
      const maps = await loadMaps(); const { Map } = await maps.importLibrary('maps'); const { AdvancedMarkerElement } = await maps.importLibrary('marker');
      map.current ||= new Map(element.current, { center: locations[0] || { lat: 39, lng: -98 }, zoom: 10, mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID' });
      markers.current.forEach((m) => { m.map = null; });
      const bounds = new maps.LatLngBounds();
      markers.current = locations.map((location) => { const position = { lat: location.lat, lng: location.lng }; bounds.extend(position); return new AdvancedMarkerElement({ map: map.current, position, title: `${location.name} · ${location.stale ? 'Stale' : location.sharing ? 'Sharing' : 'Stopped'} · ${new Date(location.updatedAt).toLocaleString()}` }); });
      if (!bounds.isEmpty()) map.current.fitBounds(bounds);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  // A refreshed list invalidates previously drawn markers until the map is explicitly refreshed.
  useEffect(() => { markers.current.forEach((m) => { m.map = null; }); markers.current = []; }, [locations]);
  const saveRetention = async () => { setBusy(true); try { await httpsCallable(functions, 'rlSetLocationRetention')({ companyId: company.id, hours: Number(hours) }); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <div className="space-y-5"><h1 className="text-2xl font-bold">Team work locations</h1><p>Only technicians who explicitly start sharing during active work appear here. Positions older than three minutes are marked stale; sharing expires without a heartbeat.</p><div className="flex gap-3"><button onClick={load} className="underline">Refresh list</button><button onClick={showMap} disabled={busy || !locations.length} className="underline disabled:opacity-50">Show current locations on map</button></div>{company?.ownerId === currentUser?.uid && <div className="flex items-center gap-3"><label>Last-location retention (hours)<input className="ml-2 w-24 rounded border-gray-300" type="number" min="1" max="168" value={hours} onChange={(e) => setHours(e.target.value)} /></label><button disabled={busy} onClick={saveRetention} className="underline">Save retention</button></div>}<ul className="divide-y rounded border bg-white">{locations.map((location) => <li className="p-4" key={location.id}><strong>{location.name}</strong> · {location.stale ? 'Stale' : location.sharing ? 'Sharing' : 'Stopped'}<p className="text-sm">Last update: {new Date(location.updatedAt).toLocaleString()} · Accuracy about {Math.round(location.accuracy)} m</p></li>)}</ul>{!locations.length && !error && <p>No current locations are shared.</p>}<div ref={element} className="h-80 rounded border bg-gray-100" aria-label="Team location map" />{error && <p role="alert" className="text-red-700">{error}</p>}</div>;
}
