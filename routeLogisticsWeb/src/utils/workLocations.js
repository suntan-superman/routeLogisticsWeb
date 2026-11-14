export const LOCATION_LABELS = { live: 'Current GPS location', stale: 'GPS update overdue', 'sharing-disabled': 'Location sharing stopped', 'awaiting-fix': 'Waiting for first GPS fix', unavailable: 'No GPS location' };
export function locationState(location, now = Date.now(), freshAfterSeconds = 300) {
  if (!location) return 'unavailable';
  const captured = Date.parse(location.capturedAt || location.updatedAt);
  if (location.state === 'sharing-disabled' || location.sharing === false && !location.stale) return 'sharing-disabled';
  if (!Number.isFinite(captured) || now - captured > freshAfterSeconds * 1000 || captured > now + 60000 || location.stale || location.state === 'stale') return 'stale';
  return location.state || 'live';
}
export function dutyLabel(member) {
  return member?.dutyStatus === 'on-duty' || member?.onDuty ? 'On duty' : 'Off duty';
}
export function distanceMeters(a, b) {
  if (![a?.lat, a?.lng, b?.lat, b?.lng].every(Number.isFinite) || [a.lat,b.lat].some(value => Math.abs(value) > 90) || [a.lng,b.lng].some(value => Math.abs(value) > 180)) return null;
  const radians = value => value * Math.PI / 180, dLat = radians(b.lat-a.lat), dLng = radians(b.lng-a.lng);
  const value = Math.sin(dLat/2)**2 + Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(dLng/2)**2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0,1-value)));
}
export function nearestOnDuty(roster, destination, now = Date.now(), freshAfterSeconds = 300) {
  if (!destination) return [];
  return (roster || []).filter(member => (member.onDuty || member.dutyStatus === 'on-duty') && locationState(member.location, now, freshAfterSeconds) === 'live' && Number.isFinite(member.location.accuracy) && member.location.accuracy <= 200)
    .map(member => ({ ...member, distance: distanceMeters(member.location, destination) })).filter(member => member.distance != null).sort((a,b) => a.distance-b.distance);
}
