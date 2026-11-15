import { initializeApp, getApps } from 'firebase/app';
import { getAuth, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import app from './firebase';
import { connectLocalEmulators } from './emulators';
// A customer login never replaces a team session on the same browser.
const portalApp = getApps().find((item) => item.name === 'customer-portal') || initializeApp(app.options, 'customer-portal');
export const portalAuth = getAuth(portalApp);
export const portalFunctions = getFunctions(portalApp);
connectLocalEmulators({ auth: portalAuth, functions: portalFunctions }, app.options.projectId);
export const portalReady = setPersistence(portalAuth, browserSessionPersistence);
