import { useEffect, useMemo, useRef, useState } from 'react';
import SelectControl from '../components/SelectControl';
import { useAuth } from '../contexts/AuthContext';
import { callWorkspace } from '../services/workspaceApi';
import { loadMaps } from '../services/maps';
import { useWorkspaceQuery } from '../hooks/useWorkspaceQuery';
import { addCalendarDays, analyzeLocationHistory, localMidnightUtc, todayInTimeZone } from '../utils/locationHistory';
import { DEFAULT_MAP_HEIGHT, MAP_HEIGHT_KEY, mapHeight, schematicPosition } from '../utils/locationHistoryView';
import './LocationHistoryPage.css';

const isoDay = (value, timeZone) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone });
const durationText = value => `${Math.floor(value / 60000)} min`;
const locationKey = point => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
const addressLookupError = failure => {
  const status = String(failure?.code || failure?.status || '');
  if (status === 'REQUEST_DENIED') return new Error('Google denied the address lookup. Check that the browser key permits the Geocoding API, then try again.');
  return new Error('Google could not resolve this location. Select the marker again to retry.');
};
async function approximateAddress(point, cache, lookups) {
  const key = locationKey(point);
  if (cache.current[key]) return cache.current[key];
  if (!lookups.current.has(key)) {
    const lookup = new window.google.maps.Geocoder().geocode({ location: { lat: point.lat, lng: point.lng } })
      .then(result => result.results?.[0]?.formatted_address || 'No nearby street address found.')
      .catch(failure => { throw addressLookupError(failure); })
      .then(address => { cache.current[key] = address; return address; })
      .finally(() => { lookups.current.delete(key); });
    lookups.current.set(key, lookup);
  }
  return lookups.current.get(key);
}
const eventText = event => ({
  'shift-started': 'Shift started; technician had consented to location sharing.',
  'shift-ended': 'Shift ended; location sharing was stopped.',
  'sharing-started': 'Location sharing enabled.',
  'sharing-stopped': `Location sharing stopped${event.reason ? ` (${event.reason.replaceAll('-', ' ')})` : ''}.`
}[event.event] || 'Tracking state changed.');

function markerElement(label, color) {
  const element = document.createElement('div');
  element.textContent = label;
  Object.assign(element.style, { width: '30px', height: '30px', display: 'grid', placeItems: 'center', borderRadius: '50%', border: '2px solid #fff', background: color, color: '#fff', fontWeight: '700', boxShadow: '0 1px 5px #33415599' });
  return element;
}

function ObservedRouteSchematic({ analysis }) {
  if (!analysis.points.length) return <p>No GPS fixes are recorded for this range.</p>;
  const position = point => schematicPosition(point, analysis.points);
  const first = position(analysis.points[0]), last = position(analysis.points.at(-1));
  return <figure className="rl-history-schematic">
    <svg viewBox="0 0 720 360" role="img" aria-label="Schematic of recorded GPS fixes, stops and gaps">
      <rect width="720" height="360" fill="#f1f5f9" />
      <text x="674" y="32" fill="#334155" fontSize="16" fontWeight="bold">N ↑</text>
      {analysis.segments.map((segment, index) => <polyline key={index} fill="none" stroke="#0f766e" strokeWidth="4" points={segment.map(point => { const { x, y } = position(point); return `${x},${y}`; }).join(' ')} />)}
      {analysis.gaps.map((gap, index) => {
        const before = analysis.points.find(point => point.capturedAt === gap.from), after = analysis.points.find(point => point.capturedAt === gap.to);
        if (!before || !after) return null;
        const a = position(before), b = position(after);
        return <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#64748b" strokeDasharray="7 6" strokeWidth="2" />;
      })}
      {analysis.stops.map((stop, index) => {
        const { x, y } = position(stop);
        const labelY = Math.hypot(x - first.x, y - first.y) < 24 ? y + 30 : Math.hypot(x - last.x, y - last.y) < 24 ? y - 30 : y;
        return <g key={index}>{labelY !== y && <line x1={x} y1={y} x2={x} y2={labelY} stroke="#1d4ed8" strokeWidth="1" />}<circle cx={x} cy={labelY} r="13" fill="#1d4ed8" stroke="white" strokeWidth="2" /><text x={x} y={labelY + 5} textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">{index + 1}</text></g>;
      })}
      <circle cx={first.x} cy={first.y} r="13" fill="#047857" stroke="white" strokeWidth="2" /><text x={first.x} y={first.y + 5} textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">S</text>
      <circle cx={last.x} cy={last.y} r="13" fill="#b91c1c" stroke="white" strokeWidth="2" /><text x={last.x} y={last.y + 5} textAnchor="middle" fill="white" fontSize="13" fontWeight="bold">E</text>
    </svg>
    <figcaption>Recorded GPS positions only. Solid lines connect observed fixes; dashed lines mark missing data. This is a schematic, not a road map or verified travel path.</figcaption>
  </figure>;
}

const WINDOW_FILTER_KEY = 'rl-location-history-window-filters';

export default function LocationHistoryPage({ standalone = false }) {
  const { company, role, can } = useAuth();
  const allowed = can('locations.viewTeam') && ['owner', 'admin', 'manager'].includes(role);
  const timeZone = company?.timeZone || 'UTC';
  const initialWindowFilters = useMemo(() => {
    if (!standalone) return null;
    try {
      const saved = JSON.parse(sessionStorage.getItem(WINDOW_FILTER_KEY) || 'null');
      return saved?.companyId === company?.id ? saved : null;
    } catch { return null; }
  }, [standalone, company?.id]);
  const [today, setToday] = useState(() => todayInTimeZone(timeZone));
  const [memberId, setMemberId] = useState(initialWindowFilters?.memberId || '');
  const [startDate, setStartDate] = useState(initialWindowFilters?.startDate || today);
  const [endDate, setEndDate] = useState(initialWindowFilters?.endDate || today);
  const [radius, setRadius] = useState(initialWindowFilters?.radius || 100);
  const [minimumDwell, setMinimumDwell] = useState(initialWindowFilters?.minimumDwell || 15);
  const [preferredHeight, setPreferredHeight] = useState(() => {
    try { return mapHeight(localStorage.getItem(MAP_HEIGHT_KEY)); } catch { return DEFAULT_MAP_HEIGHT; }
  });
  const [points, setPoints] = useState([]);
  const [events, setEvents] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [retentionHours, setRetentionHours] = useState(24);
  const [intervalMinutes, setIntervalMinutes] = useState(3);
  const [loadedRange, setLoadedRange] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mapRequested, setMapRequested] = useState(false);
  const [mapBusy, setMapBusy] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapRevision, setMapRevision] = useState(0);
  const [addressBusy, setAddressBusy] = useState(false);
  const [addresses, setAddresses] = useState({});
  const [logoPreview, setLogoPreview] = useState('');
  const mapElement = useRef(null), map = useRef(null), overlays = useRef([]), detailWindow = useRef(null), addressCache = useRef({}), addressLookups = useRef(new Map()), requestSequence = useRef(0), routeBounds = useRef(null), autoLoaded = useRef(false);
  const membersQuery = useWorkspaceQuery(['location-history-members'], () => callWorkspace('rlGetLocationHistoryMembers'), { enabled: allowed });
  const analysis = useMemo(() => analyzeLocationHistory(points, { minDwellMinutes: minimumDwell, radiusMeters: radius, intervalMinutes }), [points, minimumDwell, radius, intervalMinutes]);
  const selectedTechnician = membersQuery.data?.technicians?.find(person => person.memberId === memberId);

  useEffect(() => {
    const localToday = todayInTimeZone(timeZone);
    setToday(localToday);
    setStartDate(value => value === today ? localToday : value);
    setEndDate(value => value === today ? localToday : value);
  }, [timeZone, today]);

  useEffect(() => {
    if (!mapRequested || !analysis.points.length || map.current) return undefined;
    let active = true;
    setMapBusy(true);
    setError('');
    (async () => {
      const maps = await loadMaps(), { Map: GoogleMap } = await maps.importLibrary('maps');
      if (!active) return;
      if (!mapElement.current) throw new Error('The route map container is not available.');
      map.current = new GoogleMap(mapElement.current, { center: { lat: analysis.points[0].lat, lng: analysis.points[0].lng }, zoom: 12, mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID' });
      setMapReady(true);
    })().catch(failure => {
      if (!active) return;
      map.current = null;
      setMapRequested(false);
      setError(failure.message || 'Maps could not be loaded.');
    }).finally(() => { if (active) setMapBusy(false); });
    return () => { active = false; };
  }, [mapRequested, analysis.points]);

  useEffect(() => {
    if (!mapRequested || !mapElement.current) return undefined;
    const element = mapElement.current;
    const observer = new ResizeObserver(() => {
      if (!standalone && window.innerWidth > 640) {
        const height = Math.round(element.getBoundingClientRect().height);
        if (height >= 320 && height <= 900) {
          setPreferredHeight(previous => previous === height ? previous : height);
          try { localStorage.setItem(MAP_HEIGHT_KEY, String(height)); } catch { /* Storage may be disabled. */ }
        }
      }
      if (map.current) window.google?.maps?.event?.trigger(map.current, 'resize');
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [mapRequested, standalone]);

  useEffect(() => {
    if (!mapReady || !map.current || !analysis.points.length) return undefined;
    let active = true;
    const created = [];
    (async () => {
      const maps = await loadMaps();
      const [{ Polyline }, { AdvancedMarkerElement }] = await Promise.all([maps.importLibrary('maps'), maps.importLibrary('marker')]);
      if (!active) return;
      overlays.current.forEach(overlay => { if (overlay.setMap) overlay.setMap(null); else overlay.map = null; });
      overlays.current = [];
      const bounds = new maps.LatLngBounds();
      for (const segment of analysis.segments) {
        if (segment.length < 2) continue;
        const path = segment.map(point => ({ lat: point.lat, lng: point.lng }));
        path.forEach(point => bounds.extend(point));
        created.push(new Polyline({ map: map.current, path, geodesic: true, strokeColor: '#0f766e', strokeOpacity: 0.85, strokeWeight: 4 }));
      }
      const first = analysis.points[0], last = analysis.points.at(-1);
      const technicianName = selectedTechnician?.name || 'Technician';
      const openDetails = async (marker, point, title, detailLines) => {
        detailWindow.current?.close();
        const content = document.createElement('div'), heading = document.createElement('strong'), addressLine = document.createElement('p');
        heading.textContent = `${technicianName} · ${title}`;
        addressLine.textContent = `Approximate address: ${addressCache.current[locationKey(point)] || 'Looking up address…'}`;
        content.append(heading, addressLine);
        detailLines.forEach(line => { const paragraph = document.createElement('p'); paragraph.textContent = line; content.append(paragraph); });
        const windowForMarker = new maps.InfoWindow({ content, ariaLabel: `${technicianName} ${title} location details` });
        detailWindow.current = windowForMarker;
        windowForMarker.open({ map: map.current, anchor: marker, shouldFocus: true });
        if (addressCache.current[locationKey(point)]) return;
        try {
          const address = await approximateAddress(point, addressCache, addressLookups);
          if (detailWindow.current === windowForMarker && active) {
            addressLine.textContent = `Approximate address: ${address}`;
            setError('');
          }
        } catch (failure) {
          if (detailWindow.current === windowForMarker && active) addressLine.textContent = failure.message;
          if (active) setError(failure.message);
        }
      };
      for (const [label, color, point] of [['S', '#047857', first], ['E', '#b91c1c', last]]) {
        const position = { lat: point.lat, lng: point.lng };
        bounds.extend(position);
        const title = label === 'S' ? 'Start' : 'End';
        const marker = new AdvancedMarkerElement({ map: map.current, position, content: markerElement(label, color), title: `${title} · ${isoDay(point.capturedAt, timeZone)}` });
        marker.addListener('click', () => { void openDetails(marker, point, title, [`Recorded: ${isoDay(point.capturedAt, timeZone)}`]); });
        created.push(marker);
      }
      analysis.stops.forEach((stop, index) => {
        const position = { lat: stop.lat, lng: stop.lng };
        bounds.extend(position);
        const marker = new AdvancedMarkerElement({ map: map.current, position, content: markerElement(String(index + 1), '#1d4ed8'), title: `Stop ${index + 1} · ${durationText(stop.durationMs)}` });
        marker.addListener('click', () => { void openDetails(marker, stop, `Estimated stop ${index + 1}`, [`Estimated arrival: ${isoDay(stop.arrivalAt, timeZone)}`, `Estimated departure: ${isoDay(stop.departureAt, timeZone)}`, `Observed dwell: ${durationText(stop.durationMs)} · ${stop.samples} GPS fixes`]); });
        created.push(marker);
      });
      overlays.current = created;
      routeBounds.current = bounds;
      if (!bounds.isEmpty()) map.current.fitBounds(bounds, 40);
    })().catch(failure => { if (active) setError(failure.message || 'The route map could not be drawn.'); });
    return () => { active = false; detailWindow.current?.close(); detailWindow.current = null; created.forEach(overlay => { if (overlay.setMap) overlay.setMap(null); else overlay.map = null; }); };
  }, [mapReady, mapRevision, analysis, timeZone, selectedTechnician?.name]);

  const requestPage = async ({ cursor = null, append = false } = {}) => {
    if (!memberId) { setError('Choose a technician.'); return; }
    if (!startDate || !endDate || endDate < startDate) { setError('Choose a valid start and end date.'); return; }
    const startUtc = Date.parse(localMidnightUtc(startDate, timeZone));
    const exclusiveEndDate = addCalendarDays(endDate, 1);
    const endUtc = Date.parse(localMidnightUtc(exclusiveEndDate, timeZone));
    const calendarDays = Math.round((Date.parse(`${exclusiveEndDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000);
    if (calendarDays > 7) { setError('Choose a range of seven calendar days or less.'); return; }
    const sequence = ++requestSequence.current;
    setBusy(true); setError('');
    try {
      const result = await callWorkspace('rlGetLocationHistory', { memberId, startAt: new Date(startUtc).toISOString(), endAt: new Date(endUtc).toISOString(), cursor, limit: 200 });
      if (sequence !== requestSequence.current) return;
      setPoints(previous => append ? [...previous, ...result.points.filter(point => !previous.some(row => row.id === point.id))] : result.points);
      setEvents(result.events || []);
      if (result.eventsTruncated) setError('This date range has more than 200 tracking-state events; narrow the dates to see all of them.');
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
      setRetentionHours(result.retentionHours);
      setIntervalMinutes(result.intervalMinutes);
      setLoadedRange({ startAt: new Date(startUtc).toISOString(), endAt: new Date(endUtc).toISOString(), startDate, endDate, memberId, timeZone });
      setAddresses({});
      addressCache.current = {};
      addressLookups.current.clear();
      detailWindow.current?.close(); detailWindow.current = null;
      overlays.current.forEach(overlay => { if (overlay.setMap) overlay.setMap(null); else overlay.map = null; });
      overlays.current = [];
      map.current = null;
      setMapRequested(false);
      setMapReady(false);
    } catch (failure) {
      if (sequence === requestSequence.current) setError(failure.message || 'Location history could not be loaded.');
    } finally { if (sequence === requestSequence.current) setBusy(false); }
  };

  useEffect(() => {
    if (!standalone || !initialWindowFilters || memberId) return;
    setMemberId(initialWindowFilters.memberId);
    setStartDate(initialWindowFilters.startDate);
    setEndDate(initialWindowFilters.endDate);
    setRadius(initialWindowFilters.radius);
    setMinimumDwell(initialWindowFilters.minimumDwell);
  }, [standalone, initialWindowFilters, memberId]);

  useEffect(() => {
    if (!standalone || !initialWindowFilters || autoLoaded.current || !allowed || !memberId) return;
    autoLoaded.current = true;
    void requestPage();
  // Initial popup filters are fixed for this window; subsequent requests use the form controls.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standalone, initialWindowFilters, allowed, memberId]);

  useEffect(() => {
    if (standalone && loadedRange && points.length) setMapRequested(true);
  }, [standalone, loadedRange, points.length]);

  useEffect(() => {
    if (!loadedRange || !company?.logo) { setLogoPreview(''); return undefined; }
    let active = true;
    callWorkspace('rlCompanyLogo', { action: 'read' }).then(result => {
      if (active) setLogoPreview(result.preview || '');
    }).catch(() => { if (active) setLogoPreview(''); });
    return () => { active = false; };
  }, [loadedRange, company?.logo]);

  const fitRoute = () => {
    if (map.current && routeBounds.current && !routeBounds.current.isEmpty()) map.current.fitBounds(routeBounds.current, 40);
  };

  const openMapWindow = () => {
    const filters = { companyId: company?.id, memberId: loadedRange.memberId, startDate: loadedRange.startDate, endDate: loadedRange.endDate, radius, minimumDwell };
    try {
      sessionStorage.setItem(WINDOW_FILTER_KEY, JSON.stringify(filters));
      const popup = window.open('/location-history/map', '_blank');
      if (!popup) setError('The map window was blocked. Allow popups for Route Logistics, then try again.');
    } catch {
      setError('The map window could not open. Allow popups and browser session storage, then try again.');
    } finally { try { sessionStorage.removeItem(WINDOW_FILTER_KEY); } catch { /* Storage may be disabled. */ } }
  };

  const showMap = () => {
    setError('');
    if (map.current) setMapRevision(value => value + 1);
    else setMapRequested(true);
  };

  const resolveAddresses = async () => {
    if (!mapReady || !analysis.stops.length) return;
    setAddressBusy(true); setError('');
    try {
      const next = { ...addresses };
      for (const stop of analysis.stops.slice(0, 30)) {
        const key = locationKey(stop);
        if (next[key]) continue;
        next[key] = await approximateAddress(stop, addressCache, addressLookups);
        setAddresses({ ...next });
      }
      if (analysis.stops.length > 30) setError('Approximate address lookup is limited to the first 30 stops per request.');
    } catch (failure) { setError(failure.message || 'Approximate addresses are unavailable.'); }
    finally { setAddressBusy(false); }
  };

  const disabledPeriods = [];
  let sharingStopped = null;
  for (const event of events) {
    if (event.event === 'sharing-stopped') sharingStopped = event;
    if (event.event === 'sharing-started' && sharingStopped) {
      disabledPeriods.push({ from: sharingStopped.occurredAt, to: event.occurredAt, reason: sharingStopped.reason });
      sharingStopped = null;
    }
  }
  if (sharingStopped && loadedRange) disabledPeriods.push({ from: sharingStopped.occurredAt, to: new Date(Math.min(Date.now(), Date.parse(loadedRange.endAt))).toISOString(), reason: sharingStopped.reason });

  if (!allowed) return <section className="rounded-lg border bg-white p-6"><h1 className="text-2xl font-bold">Location history</h1><p className="mt-2" role="alert">Owner, admin, or manager access is required.</p></section>;
  const DetailShell = standalone ? 'details' : 'div';

  return <div className={`rl-history-page space-y-5 ${standalone ? 'mx-auto max-w-screen-2xl p-4' : ''}`}>
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Technician location history{standalone ? ' map' : ''}</h1><p className="mt-1 text-sm text-gray-600">Recorded GPS fixes only. Lines connect observed fixes; they do not represent a road-matched or fabricated route.</p></div>{standalone && <button type="button" onClick={() => window.close()} className="rounded border px-3 py-2">Close window</button>}</header>
    <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">History begins when this feature is deployed. Company location retention is currently {retentionHours} hours (maximum 168 hours). Missing fixes are shown as gaps and may reflect GPS, permission, app, or network interruptions.</p>
    {standalone && !initialWindowFilters && <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-4">Open this map from Technician Location History after loading a technician and date range. No private history is included in the link.</p>}
    {!standalone && <section className="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Location history filters">
      <label className="text-sm font-medium">Technician<SelectControl className="mt-1 block w-full rounded border-gray-300" value={memberId} onChange={event => { setMemberId(event.target.value); setPoints([]); setEvents([]); setLoadedRange(null); }}><option value="">Choose technician</option>{(membersQuery.data?.technicians || []).map(person => <option key={person.memberId} value={person.memberId}>{person.name}{person.status !== 'active' ? ` (${person.status})` : ''}</option>)}</SelectControl></label>
      <label className="text-sm font-medium">Start date<input type="date" className="mt-1 block w-full rounded border-gray-300" value={startDate} max={endDate || today} onChange={event => setStartDate(event.target.value)} /></label>
      <label className="text-sm font-medium">End date<input type="date" className="mt-1 block w-full rounded border-gray-300" value={endDate} min={startDate} max={today} onChange={event => setEndDate(event.target.value)} /></label>
      <label className="text-sm font-medium">Minimum stop duration (minutes)<input type="number" min="1" max="240" className="mt-1 block w-full rounded border-gray-300" value={minimumDwell} onChange={event => setMinimumDwell(Math.min(240, Math.max(1, Number(event.target.value) || 1)))} /></label>
      <label className="text-sm font-medium">Stop radius (meters)<input type="number" min="25" max="500" step="25" className="mt-1 block w-full rounded border-gray-300" value={radius} onChange={event => setRadius(Math.min(500, Math.max(25, Number(event.target.value) || 25)))} /></label>
      <div className="sm:col-span-2 lg:col-span-5"><button type="button" onClick={() => requestPage()} disabled={busy || !memberId} className="rounded bg-primary-700 px-4 py-2 font-medium text-white disabled:opacity-50">{busy ? 'Loading…' : 'Load history'}</button></div>
    </section>}
    {standalone && <section className="rounded border bg-white p-3 text-sm"><strong>{selectedTechnician?.name || 'Technician'}</strong> · {startDate} to {endDate} · minimum stop {minimumDwell} minutes · radius {radius} meters · {timeZone}</section>}
    {(error || membersQuery.error || membersQuery.data?.truncated) && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error || membersQuery.error?.message || 'The technician list is limited to the first 500 company members.'}</p>}
    {membersQuery.data && !membersQuery.data.technicians.length && <p className="rounded border bg-white p-4">No current or former technicians were found for this company.</p>}
    {loadedRange && <section className="space-y-4">
      <div className="rounded border bg-white p-4"><h2 className="font-semibold">{selectedTechnician?.name || 'Technician'} · recorded activity</h2><p className="mt-1 text-sm text-gray-600">{points.length} fixes loaded · {analysis.stops.length} recorded stop{analysis.stops.length === 1 ? '' : 's'} · sample interval target {intervalMinutes} min · times shown in {timeZone}</p><p className="text-sm text-gray-600">Stop bounds are estimated from the first and last GPS fixes that meet the dwell rule. Fixes with accuracy worse than 50 m are omitted from stops and the map.</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">{points.length > 0 && <button type="button" onClick={showMap} disabled={mapBusy} className="underline">{mapBusy ? 'Loading map…' : mapReady ? 'Refresh map' : 'Show observed route on map'}</button>}{mapReady && <button type="button" onClick={fitRoute} className="underline">Fit Route</button>}{mapReady && analysis.stops.length > 0 && <button type="button" onClick={resolveAddresses} disabled={addressBusy} className="underline">{addressBusy ? 'Resolving…' : 'Resolve approximate stop addresses'}</button>}{points.length > 0 && !standalone && <button type="button" onClick={openMapWindow} className="underline">Open Map in New Window</button>}<button type="button" onClick={() => window.print()} className="underline">Print Location Report</button>{mapReady && !standalone && <button type="button" onClick={() => setPreferredHeight(DEFAULT_MAP_HEIGHT)} className="underline">Reset Size</button>}{hasMore && <button type="button" onClick={() => requestPage({ cursor: nextCursor, append: true })} disabled={busy} className="underline">Load next 200 fixes</button>}</div>
        {points.length > 0 && <p className="mt-2 text-xs text-gray-600" aria-label="Map legend"><span className="text-green-700">● Start</span> · <span className="text-red-700">● End</span> · <span className="text-blue-700">● Estimated stops</span> · green line: observed fixes · gap: no recorded fixes</p>}
        {mapRequested && <div ref={mapElement} style={standalone ? undefined : { height: preferredHeight }} className={`rl-history-map mt-4 rounded border bg-slate-100 ${standalone ? 'rl-history-map-window' : ''}`} aria-label="Observed technician GPS route map" aria-busy={!mapReady} />}
      </div>
      <DetailShell className={standalone ? 'rounded border bg-white p-4' : 'space-y-4'}>
      {standalone && <summary className="cursor-pointer font-semibold">Show stop, gap and timeline details</summary>}
      {hasMore && <p role="status" className="text-sm text-gray-600">More history is available. The map and stop analysis include the fixes loaded so far.</p>}
      {!points.length && <p className="rounded border bg-white p-4">No GPS fixes are recorded for this technician and date range. History is not available for dates before the feature was deployed.</p>}
      {analysis.gaps.length > 0 && <section className="rounded border bg-white p-4"><h2 className="font-semibold">GPS gaps</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{analysis.gaps.map(gap => <li key={`${gap.from}:${gap.to}`}>No fixes recorded between {isoDay(gap.from, timeZone)} and {isoDay(gap.to, timeZone)}.</li>)}</ul></section>}
      {disabledPeriods.length > 0 && <section className="rounded border bg-white p-4"><h2 className="font-semibold">Recorded tracking-disabled periods</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{disabledPeriods.map(period => <li key={`${period.from}:${period.to}`}>Sharing disabled from {isoDay(period.from, timeZone)} to {isoDay(period.to, timeZone)}{period.reason ? ` (${period.reason.replaceAll('-', ' ')})` : ''}.</li>)}</ul></section>}
      {analysis.stops.length > 0 && <section className="rounded border bg-white p-4"><h2 className="font-semibold">Recorded stops</h2><ol className="mt-3 divide-y">{analysis.stops.map((stop, index) => <li key={`${stop.arrivalAt}:${stop.departureAt}`} className="py-3"><strong>Stop {index + 1}</strong><p className="text-sm">Arrival estimate: {isoDay(stop.arrivalAt, timeZone)} · departure estimate: {isoDay(stop.departureAt, timeZone)} · observed dwell: {durationText(stop.durationMs)} ({stop.samples} fixes)</p>{addresses[locationKey(stop)] && <p className="text-sm text-gray-600">Approximate address: {addresses[locationKey(stop)]}. Confirm on the map; this may identify a nearby street or parcel.</p>}</li>)}</ol></section>}
      {points.length > 0 && <section className="rounded border bg-white p-4"><h2 className="font-semibold">History timeline</h2><ol className="mt-3 space-y-2 text-sm">{events.map(event => <li key={event.id} className="border-l-2 border-amber-400 pl-3">{isoDay(event.occurredAt, timeZone)} · {eventText(event)}</li>)}{analysis.gaps.map(gap => <li key={`gap:${gap.from}`} className="border-l-2 border-slate-400 pl-3">{isoDay(gap.from, timeZone)}–{isoDay(gap.to, timeZone)} · No recorded GPS fix; the cause is unknown.</li>)}{analysis.stops.map((stop, index) => <li key={`stop:${stop.arrivalAt}`} className="border-l-2 border-blue-500 pl-3">{isoDay(stop.arrivalAt, timeZone)} · Stop {index + 1}, {durationText(stop.durationMs)} observed dwell.</li>)}</ol></section>}
      </DetailShell>
      <article className="rl-history-print-report" aria-label="Printable location history report">
        <header className="rl-history-print-header">{logoPreview && <img src={logoPreview} alt={`${company?.name || 'Company'} logo`} />}<div><h1>{company?.name || 'Route Logistics'}</h1><h2>Technician Location History</h2></div></header>
        <div className="rl-history-print-meta"><p><strong>Technician:</strong> {selectedTechnician?.name || 'Technician'}</p><p><strong>Selected dates:</strong> {loadedRange.startDate} to {loadedRange.endDate}</p><p><strong>Observed activity:</strong> {analysis.points.length ? `${isoDay(analysis.points[0].capturedAt, timeZone)} to ${isoDay(analysis.points.at(-1).capturedAt, timeZone)}` : 'No recorded GPS fixes'}</p><p><strong>Company time zone:</strong> {timeZone}</p><p><strong>Stop rule:</strong> at least {minimumDwell} minutes within {radius} meters</p><p><strong>Generated:</strong> {isoDay(new Date(), timeZone)}</p></div>
        <p className="rl-history-print-warning">Recorded GPS fixes only. Stop times are estimates, not verified physical arrivals or departures. Missing fixes may reflect GPS, permission, app, or network interruptions. Positions with accuracy worse than 50 m are excluded. {hasMore ? 'More pages of fixes exist; this report contains only the loaded fixes.' : ''}</p>
        <ObservedRouteSchematic analysis={analysis} />
        <h3>Estimated stops ({analysis.stops.length})</h3>
        {analysis.stops.length ? <ol>{analysis.stops.map((stop, index) => <li key={`${stop.arrivalAt}:${index}`}><strong>Stop {index + 1}</strong> · {addresses[locationKey(stop)] || 'Approximate address unavailable'}<br />Estimated {isoDay(stop.arrivalAt, timeZone)} to {isoDay(stop.departureAt, timeZone)} · {durationText(stop.durationMs)} observed dwell · {stop.samples} GPS fixes</li>)}</ol> : <p>No stops meet the selected rule.</p>}
        <h3>GPS gaps ({analysis.gaps.length})</h3>
        {analysis.gaps.length ? <ul>{analysis.gaps.map(gap => <li key={gap.from}>{isoDay(gap.from, timeZone)} to {isoDay(gap.to, timeZone)} · no recorded fixes</li>)}</ul> : <p>No gaps detected in the loaded fixes.</p>}
        <h3>Tracking-disabled periods ({disabledPeriods.length})</h3>
        {disabledPeriods.length ? <ul>{disabledPeriods.map(period => <li key={period.from}>{isoDay(period.from, timeZone)} to {isoDay(period.to, timeZone)}{period.reason ? ` · ${period.reason.replaceAll('-', ' ')}` : ''}</li>)}</ul> : <p>No tracking-disabled period is recorded in this range.</p>}
        <footer>Location data belongs to {company?.name || 'the company'}. This schematic is derived from recorded GPS fixes, not Google Maps tiles. Approximate street addresses, when shown, are provided by Google Maps and may refer to a nearby street or parcel. © Google for geocoded address content.</footer>
      </article>
    </section>}
  </div>;
}
