import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

// Config comes from Vite env vars (see .env.example). Web API keys are not secrets, but keeping them
// out of source lets dev/prod point at different Firebase projects.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error('Missing Firebase config. Copy .env.example to .env and fill in the VITE_FIREBASE_* values.');
}

const app = initializeApp(firebaseConfig);

// App Check blocks API abuse from non-app clients. Enabled only when a reCAPTCHA v3 site key is configured.
if (import.meta.env.VITE_APPCHECK_SITE_KEY) {
  if (import.meta.env.DEV && import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_APPCHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

// Full financial documents must not persist across browser sessions. Assigned
// field-work projections and queued work have their own identity/role-scoped cache.
// Do not clear the old IndexedDB database: it may contain unsynchronized writes.
const createDb = () => initializeFirestore(app, { localCache: memoryLocalCache() });

export const auth = getAuth(app);
export const db = createDb();
export const storage = getStorage(app);
export const functions = getFunctions(app);

export default app;
