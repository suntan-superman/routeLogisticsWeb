const KEY = 'rl.rememberedEmail';
const PORTAL_KEY = 'rl.customerPortalRememberedEmail';

function readEmail(key) {
  try { return window.localStorage.getItem(key) || ''; }
  catch { return ''; }
}

function saveEmail(key, email, remember) {
  try {
    const normalized = email.trim().toLowerCase();
    if (remember && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) window.localStorage.setItem(key, normalized);
    else window.localStorage.removeItem(key);
  } catch { /* Sign-in still works if browser storage is unavailable. */ }
}

export const rememberedEmail = () => readEmail(KEY);
export const rememberEmail = (email, remember) => saveEmail(KEY, email, remember);
export const rememberedPortalEmail = () => readEmail(PORTAL_KEY);
export const rememberPortalEmail = (email, remember) => saveEmail(PORTAL_KEY, email, remember);
