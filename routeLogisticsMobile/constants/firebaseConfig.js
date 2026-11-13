// Public Firebase JS client identifiers, not Admin/service-account credentials.
// Keep direct EXPO_PUBLIC_ reads so Expo can inline overrides into native bundles.
function getMobileFirebaseConfig() {
  const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyAEHhLccanbJalSN0Zbdnvq_CwSSbpllrg",
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "mi-factotum-field-service.firebaseapp.com",
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "mi-factotum-field-service",
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "mi-factotum-field-service.firebasestorage.app",
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "1030013411579",
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:1030013411579:web:37cdb1ce1e57c1e75c505e",
    measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-VS61WKSG39"
  };
  return validateFirebaseConfig(firebaseConfig);
}

function validateFirebaseConfig(input) {
  const config = Object.fromEntries(Object.entries(input).map(([field, value]) => [field, typeof value === 'string' ? value.trim() : value]));
  for (const field of ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']) {
    if (!config[field] || /YOUR_|REPLACE|PLACEHOLDER/i.test(config[field])) throw new Error('Invalid mobile Firebase ' + field + '. Remove placeholder overrides or configure the existing mi-factotum-field-service client.');
  }
  if (!/^AIza[0-9A-Za-z_-]{35}$/.test(config.apiKey)) throw new Error('Invalid mobile Firebase apiKey. Use the Firebase client API key, never an Admin credential or another service key.');
  const expected = { projectId: 'mi-factotum-field-service', authDomain: 'mi-factotum-field-service.firebaseapp.com', storageBucket: 'mi-factotum-field-service.firebasestorage.app', messagingSenderId: '1030013411579' };
  for (const [field, value] of Object.entries(expected)) {
    if (config[field] !== value) throw new Error('Mobile Firebase ' + field + ' must target the existing mi-factotum-field-service project.');
  }
  if (!/^1:1030013411579:web:[a-f0-9]+$/.test(config.appId)) throw new Error('Mobile Firebase appId must be a Firebase JS client registered in mi-factotum-field-service.');
  return config;
}

module.exports = { getMobileFirebaseConfig, validateFirebaseConfig };
