export const THEME_STORAGE_KEY = 'rl-web-theme';
export const THEME_PREFERENCES = ['system', 'light', 'dark'];
export const normalizePreference = value => THEME_PREFERENCES.includes(value) ? value : 'system';
export const resolveTheme = (preference, systemDark) => preference === 'dark' || preference === 'system' && systemDark ? 'dark' : 'light';

export function readThemePreference(storage) {
  try { return normalizePreference(storage?.getItem(THEME_STORAGE_KEY)); } catch { return 'system'; }
}
export function applyTheme(document, theme) {
  const root = document?.documentElement;
  if (!root) return;
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  root.style.backgroundColor = theme === 'dark' ? '#071510' : '#f9fafb';
  document.querySelector?.('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#071510' : '#f9fafb');
}

// Appearance belongs to this browser, independently of sign-in, tenant and query
// caches. Updating the store changes presentation without remounting the app.
export function createThemeStore(browser = typeof window === 'undefined' ? null : window) {
  let storage, media;
  try { storage = browser?.localStorage; } catch { /* Private browsing can deny storage. */ }
  try { media = browser?.matchMedia?.('(prefers-color-scheme: dark)'); } catch { /* Use light when media queries are unavailable. */ }
  let systemDark = media?.matches === true;
  let snapshot = Object.freeze({ preference: readThemePreference(storage), theme: 'light' });
  snapshot = Object.freeze({ ...snapshot, theme: resolveTheme(snapshot.preference, systemDark) });
  const listeners = new Set();
  const refresh = preference => {
    const theme = resolveTheme(preference, systemDark);
    applyTheme(browser?.document, theme);
    if (snapshot.preference === preference && snapshot.theme === theme) return;
    snapshot = Object.freeze({ preference, theme });
    listeners.forEach(notify => notify());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: notify => { listeners.add(notify); return () => listeners.delete(notify); },
    setPreference: preference => {
      if (!THEME_PREFERENCES.includes(preference)) return false;
      let saved = false;
      try { storage?.setItem(THEME_STORAGE_KEY, preference); saved = !!storage; } catch { /* The current page still changes appearance. */ }
      refresh(preference);
      return saved;
    },
    start: () => {
      systemDark = media?.matches === true;
      refresh(readThemePreference(storage));
      const systemChanged = event => { systemDark = event.matches === true; refresh(snapshot.preference); };
      const storageChanged = event => {
        if (event.key !== null && event.key !== THEME_STORAGE_KEY || event.storageArea && event.storageArea !== storage) return;
        refresh(readThemePreference(storage));
      };
      if (media?.addEventListener) media.addEventListener('change', systemChanged);
      else media?.addListener?.(systemChanged);
      browser?.addEventListener?.('storage', storageChanged);
      return () => {
        if (media?.removeEventListener) media.removeEventListener('change', systemChanged);
        else media?.removeListener?.(systemChanged);
        browser?.removeEventListener?.('storage', storageChanged);
      };
    },
  };
}
