export const MAP_HEIGHT_KEY = 'rl-location-history-map-height';
export const DEFAULT_MAP_HEIGHT = 560;
export const MIN_MAP_HEIGHT = 320;
export const MAX_MAP_HEIGHT = 900;

export function mapHeight(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= MIN_MAP_HEIGHT && number <= MAX_MAP_HEIGHT ? Math.round(number) : DEFAULT_MAP_HEIGHT;
}

// This schematic uses only the company's own recorded GPS fixes. It contains no Google tiles.
export function schematicPosition(point, points, width = 720, height = 360) {
  const latitudes = points.map(item => item.lat), longitudes = points.map(item => item.lng);
  const minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes), maxLng = Math.max(...longitudes);
  const centerLat = (minLat + maxLat) / 2;
  const xSpan = Math.max((maxLng - minLng) * Math.cos(centerLat * Math.PI / 180), 0.0001);
  const ySpan = Math.max(maxLat - minLat, 0.0001);
  const scale = Math.min((width - 80) / xSpan, (height - 80) / ySpan);
  return {
    x: width / 2 + ((point.lng - (minLng + maxLng) / 2) * Math.cos(centerLat * Math.PI / 180)) * scale,
    y: height / 2 - (point.lat - centerLat) * scale
  };
}
