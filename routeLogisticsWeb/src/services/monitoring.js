import app from './firebase';
export async function initializeMonitoring() {
  if (import.meta.env.VITE_FIREBASE_PERFORMANCE_ENABLED !== 'true') return;
  try {
    const { getPerformance, isSupported, trace } = await import('firebase/performance');
    if (!(await isSupported())) return;
    const performance = getPerformance(app);
    const startup = trace(performance, 'rl_app_ready');
    startup.start();
    requestAnimationFrame(() => requestAnimationFrame(() => startup.stop()));
  } catch (error) { console.warn('Performance monitoring unavailable:', error.code || 'unsupported'); }
}
export function scrubErrorEvent(event) {
  // Invite secrets, OTPs and customer data do not belong in telemetry.
  if (event.request) { delete event.request.data; delete event.request.cookies; delete event.request.headers; if (event.request.url) event.request.url = event.request.url.split(/[?#]/)[0]; }
  delete event.user;
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.filter((b) => !['console', 'ui.input'].includes(b.category)).map((b) => ({ ...b, data: undefined }));
  return event;
}
