export function googleNavigation(stops) {
  if (!stops.length) return null;
  const place = (s) => s.location ? `${s.location.lat},${s.location.lng}` : s.address;
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1'); url.searchParams.set('travelmode', 'driving');
  // Small groups work with mobile browser handoff limits. Never silently drop later stops.
  url.searchParams.set('destination', place(stops.at(-1)));
  if (stops.length > 1) url.searchParams.set('waypoints', stops.slice(0, -1).map(place).join('|'));
  return url.toString();
}
export function appointmentWarnings(stops, legs, startTime, startsAtFirstStop = false) {
  const minutes = (time) => /^\d{2}:\d{2}$/.test(time || '') ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null;
  let arrival = minutes(startTime) ?? 480;
  return stops.flatMap((stop, i) => {
    const leg = legs[i - (startsAtFirstStop ? 1 : 0)];
    if (leg) arrival += Number(leg.durationMillis || 0) / 60000;
    const earliest = minutes(stop.windowStart), latest = minutes(stop.windowEnd) ?? earliest;
    if (earliest != null) arrival = Math.max(arrival, earliest);
    const late = latest != null && arrival > latest + 1;
    const result = late ? [`${stop.customerName}: estimated arrival is ${Math.ceil(arrival - latest)} minutes after the appointment time/window.`] : [];
    arrival += Number(stop.durationMinutes || 0);
    return result;
  });
}
