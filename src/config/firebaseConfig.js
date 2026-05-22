export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const requiredFirebaseConfigKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];

export function assertFirebaseConfig() {
  const missingKeys = requiredFirebaseConfigKeys.filter((key) => !firebaseConfig[key]);

  if (missingKeys.length > 0) {
    throw new Error(`Missing Firebase configuration: ${missingKeys.join(', ')}`);
  }
}

export const firebaseProjectId = firebaseConfig.projectId;
export const firebaseFunctionsRegion =
  import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1';

export const functionsBaseUrl =
  import.meta.env.VITE_FIREBASE_FUNCTIONS_BASE_URL ||
  (firebaseProjectId
    ? `https://${firebaseFunctionsRegion}-${firebaseProjectId}.cloudfunctions.net`
    : '');

export function getFunctionUrl(functionName) {
  if (!functionsBaseUrl) {
    throw new Error('Firebase Functions base URL is not configured');
  }

  return `${functionsBaseUrl.replace(/\/$/, '')}/${functionName}`;
}
