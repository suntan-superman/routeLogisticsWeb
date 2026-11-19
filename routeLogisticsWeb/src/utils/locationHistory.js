const EARTH_RADIUS_METERS = 6371000;
const radians = value => value * Math.PI / 180;

export function distanceMeters(first, second) {
  const lat = radians(second.lat - first.lat), lng = radians(second.lng - first.lng);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(lng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function wallParts(timestamp, timeZone) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(timestamp)).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  return values;
}

export function localMidnightUtc(day, timeZone = 'UTC') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Choose a valid calendar date.');
  const [year, month, date] = day.split('-').map(Number);
  const target = Date.UTC(year, month - 1, date);
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = wallParts(guess, timeZone);
    const observed = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const correction = target - observed;
    guess += correction;
    if (!correction) break;
  }
  return new Date(guess).toISOString();
}

export function addCalendarDays(day, count) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}

export function todayInTimeZone(timeZone = 'UTC', now = new Date()) {
  const parts = wallParts(now.getTime(), timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function analyzeLocationHistory(input, {
  minDwellMinutes = 15,
  radiusMeters = 100,
  maxAccuracyMeters = 50,
  intervalMinutes = 3
} = {}) {
  const points = [...input].filter(point => Number.isFinite(Date.parse(point.capturedAt))
    && Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180
    && Number.isFinite(point.accuracy) && point.accuracy >= 0 && point.accuracy <= maxAccuracyMeters)
    .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  const maxGapMs = Math.max(5, intervalMinutes * 3) * 60000;
  const segments = [], gaps = [];
  for (const point of points) {
    const previous = segments.at(-1)?.at(-1);
    if (previous && Date.parse(point.capturedAt) - Date.parse(previous.capturedAt) > maxGapMs) {
      gaps.push({ from: previous.capturedAt, to: point.capturedAt });
      segments.push([point]);
    } else if (previous) segments.at(-1).push(point);
    else segments.push([point]);
  }

  const stops = [];
  const minimumMs = Math.max(1, Number(minDwellMinutes) || 15) * 60000;
  for (const segment of segments) {
    let cluster = [];
    const finish = () => {
      if (cluster.length < 2) { cluster = []; return; }
      const first = cluster[0], last = cluster.at(-1), durationMs = Date.parse(last.capturedAt) - Date.parse(first.capturedAt);
      if (durationMs >= minimumMs) {
        const center = cluster.reduce((value, point) => ({ lat: value.lat + point.lat / cluster.length, lng: value.lng + point.lng / cluster.length }), { lat: 0, lng: 0 });
        stops.push({ lat: center.lat, lng: center.lng, arrivalAt: first.capturedAt, departureAt: last.capturedAt, durationMs, samples: cluster.length });
      }
      cluster = [];
    };
    for (const point of segment) {
      if (!cluster.length) { cluster = [point]; continue; }
      const anchor = cluster[0], uncertainty = Math.max(anchor.accuracy, point.accuracy);
      if (distanceMeters(anchor, point) - uncertainty <= radiusMeters) cluster.push(point);
      else { finish(); cluster = [point]; }
    }
    finish();
  }
  return { points, segments, gaps, stops, maxGapMs };
}
