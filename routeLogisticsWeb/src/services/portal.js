import { initializeApp, getApps } from 'firebase/app';
import { getAuth, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import app from './firebase';
// A customer login never replaces a team session on the same browser.
const portalApp = getApps().find((item) => item.name === 'customer-portal') || initializeApp(app.options, 'customer-portal');
export const portalAuth = getAuth(portalApp);
export const portalFunctions = getFunctions(portalApp);
export const portalReady = setPersistence(portalAuth, browserSessionPersistence);
