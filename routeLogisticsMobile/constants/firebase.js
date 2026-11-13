// Firebase configuration for Route Logistics
// Environment variables should be set in your app.config.js or environment

import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAEHhLccanbJalSN0Zbdnvq_CwSSbpllrg",
  authDomain: "mi-factotum-field-service.firebaseapp.com",
  projectId: "mi-factotum-field-service",
  storageBucket: "mi-factotum-field-service.firebasestorage.app",
  messagingSenderId: "1030013411579",
  appId: "1:1030013411579:web:37cdb1ce1e57c1e75c505e",
  measurementId: "G-VS61WKSG39"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services with AsyncStorage persistence
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (error) {
  // If already initialized, get the existing instance
  if (error.code === 'auth/already-initialized') {
    const { getAuth } = require('firebase/auth');
    auth = getAuth(app);
  } else {
    throw error;
  }
}
export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Connect to emulators in development (disabled for now)
// if (__DEV__) {
//   try {
//     // Only connect if not already connected
//     if (!auth.config.emulator) {
//       connectAuthEmulator(auth, 'http://localhost:9099');
//     }
//     if (!db._delegate._databaseId.projectId.includes('demo-')) {
//       connectFirestoreEmulator(db, 'localhost', 8080);
//     }
//     if (!storage._delegate._host.includes('localhost')) {
//       connectStorageEmulator(storage, 'localhost', 9199);
//     }
//     if (!functions._delegate._url.includes('localhost')) {
//       connectFunctionsEmulator(functions, 'localhost', 5001);
//     }
//   } catch (error) {
//     console.log('Emulator connection failed (likely already connected):', error);
//   }
// }

export default app;
