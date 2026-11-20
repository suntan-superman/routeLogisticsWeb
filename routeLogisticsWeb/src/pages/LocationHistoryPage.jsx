import { useEffect, useMemo, useRef, useState } from 'react';
import SelectControl from '../components/SelectControl';
import { useAuth } from '../contexts/AuthContext';
import { callWorkspace } from '../services/workspaceApi';
import { loadMaps } from '../services/maps';
import { useWorkspaceQuery } from '../hooks/useWorkspaceQuery';
import { addCalendarDays, analyzeLocationHistory, localMidnightUtc, todayInTimeZone } from '../utils/locationHistory';

const isoDay = (value, timeZone) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) });
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

export default function LocationHistoryPage() {
  const { company, role, can } = useAuth();
  const allowed = can('locations.viewTeam') && ['owner', 'admin', 'manager'].includes(role);
  const timeZone = company?.timeZone || 'UTC';
  const [today, setToday] = useState(() => todayInTimeZone(timeZone));
  const [memberId, setMemberId] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [radius, setRadius] = useState(100);
  const [minimumDwell, setMinimumDwell] = useState(15);
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
  const mapElement = useRef(null), map = useRef(null), overlays = useRef([]), detailWindow = useRef(null), addressCache = useRef({}), addressLookups = useRef(new Map()), requestSequence = useRef(0);
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
      const openDetails = async (marker, point, title, timeText) => {
        detailWindow.current?.close();
        const content = document.createElement('div'), heading = document.createElement('strong'), addressLine = document.createElement('p'), timeLine = document.createElement('p');
        heading.textContent = title;
        addressLine.textContent = `Approximate address: ${addressCache.current[locationKey(point)] || 'Looking up address…'}`;
        timeLine.textContent = timeText;
        content.append(heading, addressLine, timeLine);
        const windowForMarker = new maps.InfoWindow({ content, ariaLabel: `${title} location details` });
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
        marker.addListener('click', () => { void openDetails(marker, point, title, `Recorded: ${isoDay(point.capturedAt, timeZone)}`); });
        created.push(marker);
      }
      analysis.stops.forEach((stop, index) => {
        const position = { lat: stop.lat, lng: stop.lng };
        bounds.extend(position);
        const marker = new AdvancedMarkerElement({ map: map.current, position, content: markerElement(String(index + 1), '#1d4ed8'), title: `Stop ${index + 1} · ${durationText(stop.durationMs)}` });
        marker.addListener('click', () => { void openDetails(marker, stop, `Stop ${index + 1}`, `Observed: ${isoDay(stop.arrivalAt, timeZone)} to ${isoDay(stop.departureAt, timeZone)}`); });
        created.push(marker);
      });
      overlays.current = created;
      if (!bounds.isEmpty()) map.current.fitBounds(bounds, 40);
    })().catch(failure => { if (active) setError(failure.message || 'The route map could not be drawn.'); });
    return () => { active = false; detailWindow.current?.close(); detailWindow.current = null; created.forEach(overlay => { if (overlay.setMap) overlay.setMap(null); else overlay.map = null; }); };
  }, [mapReady, mapRevision, analysis, timeZone]);

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
      setLoadedRange({ startAt: new Date(startUtc).toISOString(), endAt: new Date(endUtc).toISOString(), timeZone });
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

  return <div className="space-y-5">
    <header><h1 className="text-2xl font-bold">Technician location history</h1><p className="mt-1 text-sm text-gray-600">Recorded GPS fixes only. Lines connect observed fixes; they do not represent a road-matched or fabricated route.</p></header>
    <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">History begins when this feature is deployed. Company location retention is currently {retentionHours} hours (maximum 168 hours). Missing fixes are shown as gaps and may reflect GPS, permission, app, or network interruptions.</p>
    <section className="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Location history filters">
      <label className="text-sm font-medium">Technician<SelectControl className="mt-1 block w-full rounded border-gray-300" value={memberId} onChange={event => { setMemberId(event.target.value); setPoints([]); setEvents([]); setLoadedRange(null); }}><option value="">Choose technician</option>{(membersQuery.data?.technicians || []).map(person => <option key={person.memberId} value={person.memberId}>{person.name}{person.status !== 'active' ? ` (${person.status})` : ''}</option>)}</SelectControl></label>
      <label className="text-sm font-medium">Start date<input type="date" className="mt-1 block w-full rounded border-gray-300" value={startDate} max={endDate || today} onChange={event => setStartDate(event.target.value)} /></label>
      <label className="text-sm font-medium">End date<input type="date" className="mt-1 block w-full rounded border-gray-300" value={endDate} min={startDate} max={today} onChange={event => setEndDate(event.target.value)} /></label>
      <label className="text-sm font-medium">Minimum stop duration (minutes)<input type="number" min="1" max="240" className="mt-1 block w-full rounded border-gray-300" value={minimumDwell} onChange={event => setMinimumDwell(Math.min(240, Math.max(1, Number(event.target.value) || 1)))} /></label>
      <label className="text-sm font-medium">Stop radius (meters)<input type="number" min="25" max="500" step="25" className="mt-1 block w-full rounded border-gray-300" value={radius} onChange={event => setRadius(Math.min(500, Math.max(25, Number(event.target.value) || 25)))} /></label>
      <div className="sm:col-span-2 lg:col-span-5"><button type="button" onClick={() => requestPage()} disabled={busy || !memberId} className="rounded bg-primary-700 px-4 py-2 font-medium text-white disabled:opacity-50">{busy ? 'Loading…' : 'Load history'}</button></div>
    </section>
    {(error || membersQuery.error || membersQuery.data?.truncated) && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error || membersQuery.error?.message || 'The technician list is limited to the first 500 company members.'}</p>}
    {membersQuery.data && !membersQuery.data.technicians.length && <p className="rounded border bg-white p-4">No current or former technicians were found for this company.</p>}
    {loadedRange && <section className="space-y-4">
      <div className="rounded border bg-white p-4"><h2 className="font-semibold">{selectedTechnician?.name || 'Technician'} · recorded activity</h2><p className="mt-1 text-sm text-gray-600">{points.length} fixes loaded · {analysis.stops.length} recorded stop{analysis.stops.length === 1 ? '' : 's'} · sample interval target {intervalMinutes} min · times shown in {timeZone}</p><p className="text-sm text-gray-600">Stop bounds are estimated from the first and last GPS fixes that meet the dwell rule. Fixes with accuracy worse than 50 m are omitted from stops and the map.</p>
        <div className="mt-3 flex flex-wrap gap-3">{points.length > 0 && <button type="button" onClick={showMap} disabled={mapBusy} className="underline">{mapBusy ? 'Loading map…' : mapReady ? 'Refresh map' : 'Show observed route on map'}</button>}{mapReady && analysis.stops.length > 0 && <button type="button" onClick={resolveAddresses} disabled={addressBusy} className="underline">{addressBusy ? 'Resolving…' : 'Resolve approximate stop addresses'}</button>}{hasMore && <button type="button" onClick={() => requestPage({ cursor: nextCursor, append: true })} disabled={busy} className="underline">Load next 200 fixes</button>}</div>
        {mapRequested && <div ref={mapElement} className="mt-4 h-96 rounded border bg-slate-100" aria-label="Observed technician GPS route map" aria-busy={!mapReady} />}
      </div>
      {hasMore && <p role="status" className="text-sm text-gray-600">More history is available. The map and stop analysis include the fixes loaded so far.</p>}
      {!points.length && <p className="rounded border bg-white p-4">No GPS fixes are recorded for this technician and date range. History is not available for dates before the feature was deployed.</p>}
      {analysis.gaps.length > 0 && <section className="rounded border bg-white p-4"><h2 className="font-semibold">GPS gaps</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{analysis.gaps.map(gap => <li key={`${gap.from}:${gap.to}`}>No fixes recorded between {isoDay(gap.from)} and {isoDay(gap.to)}.</li>)}</ul></section>}
      {disabledPeriods.length > 0 && <section className="rounded border bg-white p-4"><h2 className="font-semibold">Recorded tracking-disabled periods</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{disabledPeriods.map(period => <li key={`${period.from}:${period.to}`}>Sharing disabled from {isoDay(period.from)} to {isoDay(period.to)}{period.reason ? ` (${period.reason.replaceAll('-', ' ')})` : ''}.</li>)}</ul></section>}
      {analysis.stops.length > 0 && <section className="rounded border bg-white p-4"><h2 className="font-semibold">Recorded stops</h2><ol className="mt-3 divide-y">{analysis.stops.map((stop, index) => <li key={`${stop.arrivalAt}:${stop.departureAt}`} className="py-3"><strong>Stop {index + 1}</strong><p className="text-sm">Arrival estimate: {isoDay(stop.arrivalAt)} · departure estimate: {isoDay(stop.departureAt)} · observed dwell: {durationText(stop.durationMs)} ({stop.samples} fixes)</p>{addresses[locationKey(stop)] && <p className="text-sm text-gray-600">Approximate address: {addresses[locationKey(stop)]}. Confirm on the map; this may identify a nearby street or parcel.</p>}</li>)}</ol></section>}
      {points.length > 0 && <section className="rounded border bg-white p-4"><h2 className="font-semibold">History timeline</h2><ol className="mt-3 space-y-2 text-sm">{events.map(event => <li key={event.id} className="border-l-2 border-amber-400 pl-3">{isoDay(event.occurredAt)} · {eventText(event)}</li>)}{analysis.gaps.map(gap => <li key={`gap:${gap.from}`} className="border-l-2 border-slate-400 pl-3">{isoDay(gap.from)}–{isoDay(gap.to)} · No recorded GPS fix; the cause is unknown.</li>)}{analysis.stops.map((stop, index) => <li key={`stop:${stop.arrivalAt}`} className="border-l-2 border-blue-500 pl-3">{isoDay(stop.arrivalAt)} · Stop {index + 1}, {durationText(stop.durationMs)} observed dwell.</li>)}</ol></section>}
    </section>}
  </div>;
}
