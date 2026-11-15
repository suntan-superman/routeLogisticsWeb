// This is a native client key, embedded in the Android binary. Restrict it to
// Maps SDK for Android plus the app package and signing-certificate SHA-1s.
// Never use the backend routing key or Firebase Admin credentials here.
function getNativeMapsConfig(environment = process.env) {
  const value = String(environment.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY || environment.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim();
  const apiKey = /^AIza[A-Za-z0-9_-]{35}$/.test(value) ? value : '';
  return { android: apiKey ? { googleMaps: { apiKey } } : {}, androidConfigured: !!apiKey };
}
module.exports = { getNativeMapsConfig };
