import { jobAddress, jobPosition } from './dispatch.js';

export const addressKey = address => String(address || '').trim().replace(/\s+/g, ' ').toLowerCase();

// Routes JS returns DirectionalLocation/LatLngAltitude (numeric properties).
// LatLng and older Maps adapters expose methods instead. Never coerce a missing
// coordinate to zero or invent a service location from the map's center.
export function mapPoint(value) {
  if (!value) return null;
  try {
    const point = value.latLng || value;
    const lat = typeof point.lat === 'function' ? point.lat() : point.lat;
    const lng = typeof point.lng === 'function' ? point.lng() : point.lng;
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    if (typeof point.toJSON === 'function') {
      const literal = point.toJSON();
      if (literal !== point) return mapPoint(literal);
    }
  } catch { /* An invalid Maps object cannot become a marker. */ }
  return null;
}

export function createDispatchAddressResolver(loadMaps) {
  const entries = new Map();
  let sequence = Promise.resolve();
  const unique = jobs => [...new Map(jobs.filter(job => !jobPosition(job) && jobAddress(job)).map(job => [addressKey(jobAddress(job)), jobAddress(job)])).entries()];
  const snapshot = jobs => {
    const addresses = unique(jobs), points = {};
    for (const [key, entry] of entries) if (entry.point) points[key] = entry.point;
    return { points, pending: addresses.filter(([key]) => !entries.get(key)?.attempted && !entries.get(key)?.point).length,
      failed: addresses.filter(([key]) => !!entries.get(key)?.error).length };
  };
  const resolve = (jobs, { retry = false, limit = 25, anchor, isCurrent = () => true } = {}) => {
    const run = async () => {
      if (!isCurrent()) return { cancelled: true, ...snapshot(jobs) };
      const batch = unique(jobs).filter(([key]) => !entries.get(key)?.point && (retry || !entries.get(key)?.attempted)).slice(0, Math.min(25, Math.max(1, limit)));
      if (!batch.length) return { ...snapshot(jobs), processed: 0, error: '' };
      let error = '';
      try {
        const maps = await loadMaps(), { Route } = await maps.importLibrary('routes');
        if (!isCurrent()) return { cancelled: true, ...snapshot(jobs) };
        const addresses = batch.map(([, address]) => address);
        const known = jobs.map(job => jobPosition(job) || entries.get(addressKey(jobAddress(job)))?.point).find(Boolean);
        const actualAnchor = mapPoint(anchor) || (typeof anchor === 'string' && addressKey(anchor) !== batch[0][0] ? anchor : null) || known;
        const single = addresses.length === 1, anchored = single && !!actualAnchor;
        const request = { origin: anchored ? actualAnchor : addresses[0], destination: addresses.at(-1),
          intermediates: single ? [] : addresses.slice(1, -1).map(location => ({ location })),
          travelMode: 'DRIVING', routingPreference: 'TRAFFIC_UNAWARE', fields: single && !anchored ? ['legs', 'path'] : ['legs'] };
        for (const [key] of batch) entries.set(key, { attempted: true });
        const route = (await Route.computeRoutes(request)).routes?.[0];
        let points;
        if (single) {
          // A same-address route may have no legs. A returned path point is
          // usable; a zero-result response has no location and must stay unresolved.
          points = [anchored ? mapPoint(route?.legs?.at(-1)?.endLocation)
            : mapPoint(route?.legs?.[0]?.startLocation) || mapPoint(route?.legs?.at(-1)?.endLocation) || (route?.path || []).map(mapPoint).find(Boolean)];
        } else if (route?.legs?.length === addresses.length - 1) {
          points = [mapPoint(route.legs[0].startLocation), ...route.legs.map(leg => mapPoint(leg.endLocation))];
        } else points = [];
        batch.forEach(([key], index) => entries.set(key, points[index] ? { attempted: true, point: points[index] }
          : { attempted: true, error: 'No driving access point was returned. Check the service address and retry.' }));
        const failed = batch.filter(([key]) => entries.get(key)?.error).length;
        if (failed) error = `${failed} service ${failed === 1 ? 'address could' : 'addresses could'} not be located. Check the addresses, then retry unresolved addresses.`;
      } catch (failure) {
        error = failure.message || 'Address lookup failed. Check connectivity and Maps configuration, then retry.';
        for (const [key] of batch) if (!entries.get(key)?.point) entries.set(key, { attempted: true, error });
      }
      // A completed response remains useful in the address cache, but a stale
      // filter/unmounted view must never receive its markers or error message.
      if (!isCurrent()) return { cancelled: true, ...snapshot(jobs) };
      return { ...snapshot(jobs), processed: batch.length, error };
    };
    const result = sequence.then(run);
    sequence = result.catch(() => {});
    return result;
  };
  return { resolve, snapshot };
}
