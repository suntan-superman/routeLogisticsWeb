const KEY = 'rl.rememberedEmail';

export function rememberedEmail() {
  try { return window.localStorage.getItem(KEY) || ''; }
  catch { return ''; }
}

export function rememberEmail(email, remember) {
  try {
    const normalized = email.trim().toLowerCase();
    if (remember && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) window.localStorage.setItem(KEY, normalized);
    else window.localStorage.removeItem(KEY);
  } catch { /* Sign-in still works if browser storage is unavailable. */ }
}
