import { getMessaging, getToken, deleteToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import app, { db, auth } from './firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;
const TOKEN_KEY = 'rl_push_token';

export const pushConfigured = () => !!VAPID_KEY;

export const pushEnabled = () => typeof Notification !== 'undefined' && Notification.permission === 'granted' && !!localStorage.getItem(TOKEN_KEY);

export async function pushSupported() {
  return pushConfigured() && 'serviceWorker' in navigator && 'Notification' in window && (await isSupported().catch(() => false));
}

const swUrl = () => {
  const p = new URLSearchParams({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
  return `/firebase-messaging-sw.js?${p}`;
};

export async function enablePush() {
  if (!(await pushSupported())) throw new Error('Push notifications are not available in this browser');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted');
  const registration = await navigator.serviceWorker.register(swUrl());
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error('Could not get a notification token');
  const uid = auth.currentUser.uid;
  await setDoc(doc(db, 'deviceTokens', `${uid}_${token}`), {
    userId: uid,
    token,
    platform: 'web',
    userAgent: navigator.userAgent.slice(0, 200),
    updatedAt: serverTimestamp(),
  });
  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

export async function disablePush() {
  const token = localStorage.getItem(TOKEN_KEY);
  const uid = auth.currentUser?.uid;
  localStorage.removeItem(TOKEN_KEY);
  if (!token) return;
  if (uid) await deleteDoc(doc(db, 'deviceTokens', `${uid}_${token}`)).catch(() => {});
  await deleteToken(getMessaging(app)).catch(() => {});
}

// Shows a callback for messages that arrive while the app is open (background ones are handled by the service worker).
export async function onForegroundMessage(callback) {
  if (!(await pushSupported())) return () => {};
  return onMessage(getMessaging(app), callback);
}
