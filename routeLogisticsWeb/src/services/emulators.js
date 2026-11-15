import { connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator } from 'firebase/firestore';
import { connectFunctionsEmulator } from 'firebase/functions';
import { connectStorageEmulator } from 'firebase/storage';

export function localFirestoreTransport() {
  // Firebase 11.10/WebKit on Windows cannot reliably replay emulator fetch
  // streams. Only local test builds use long-polling/XHR; production keeps SDK defaults.
  return import.meta.env.VITE_FIREBASE_EMULATORS === 'true'
    ? { experimentalForceLongPolling: true, experimentalAutoDetectLongPolling: false, useFetchStreams: false }
    : {};
}

// Explicit local-only opt-in. A misconfigured test build must never use a real project.
export function connectLocalEmulators({ auth, db, functions, storage }, projectId) {
  if (import.meta.env.VITE_FIREBASE_EMULATORS !== 'true') return;
  if (!projectId?.startsWith('demo-') || !['localhost', '127.0.0.1', '[::1]'].includes(globalThis.location?.hostname)) {
    throw new Error('Firebase emulator mode requires a demo project on localhost.');
  }
  if (auth) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  if (db) connectFirestoreEmulator(db, '127.0.0.1', 8080);
  if (functions) connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  if (storage) connectStorageEmulator(storage, '127.0.0.1', 9199);
}
