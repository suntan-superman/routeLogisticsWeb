import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

// Firebase configuration - using the same as mobile app
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

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Initialize Functions with the same app instance (important for auth context)
// For v2 callable functions, we need to specify the region where the function is deployed
// From `firebase functions:list`, sendInvoiceEmail is deployed in us-central1
// Note: getFunctions() without region defaults to us-central1, but let's be explicit
export const functions = getFunctions(app, 'us-central1');

// Connect to emulator in development (if needed)
// if (import.meta.env.DEV) {
//   connectFunctionsEmulator(functions, 'localhost', 5001);
// }

export default app;
