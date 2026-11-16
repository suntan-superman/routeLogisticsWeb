// Blocking head script applies the saved appearance before the app/CSS paint.
// Keep the storage key and preference rules aligned with src/services/theme.js.
(function () {
  let preference = 'system';
  try {
    const stored = window.localStorage.getItem('rl-web-theme');
    if (['system', 'light', 'dark'].includes(stored)) preference = stored;
  } catch { /* Appearance still follows the device when storage is unavailable. */ }
  let systemDark = false;
  try { systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { /* Light fallback. */ }
  const theme = preference === 'dark' || preference === 'system' && systemDark ? 'dark' : 'light';
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  root.style.backgroundColor = theme === 'dark' ? '#071510' : '#f9fafb';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#071510' : '#f9fafb');
}());
