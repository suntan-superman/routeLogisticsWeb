const ACTIVATION_TIMEOUT_MS = 15_000;

export const DUCKDUCKGO_PUSH_MESSAGE = 'DuckDuckGo for Windows does not support web push notifications. Use Chrome or Edge to receive browser notifications.';
export const WEBVIEW2_PUSH_MESSAGE = 'This Windows browser uses WebView2, which does not support web push notifications. Use Chrome or Edge to receive browser notifications.';

export function getUnsupportedWebPushBrowser(browser = globalThis.navigator, browserWindow = globalThis.window) {
  const userAgent = browser?.userAgent || '';
  const platform = browser?.userAgentData?.platform || browser?.platform || '';
  const brands = [
    ...(browser?.userAgentData?.brands || []),
    ...(browser?.userAgentData?.fullVersionList || []),
  ];
  const isDuckDuckGo = /(?:DuckDuckGo|Ddg)\//i.test(userAgent)
    || brands.some(({ brand = '' }) => /DuckDuckGo/i.test(brand));
  const isWindows = /Windows/i.test(userAgent) || /^Win/i.test(platform);
  if (!isWindows) return null;
  if (isDuckDuckGo) return 'duckduckgo-windows';

  // DuckDuckGo for Windows deliberately uses a Chromium-style user agent, so
  // its name is not always visible to a website. It is hosted in WebView2,
  // which exposes this host-only bridge and does not implement Web Push.
  return browserWindow?.chrome?.webview ? 'windows-webview2' : null;
}

export function getUnsupportedWebPushMessage(reason) {
  return reason === 'duckduckgo-windows'
    ? DUCKDUCKGO_PUSH_MESSAGE
    : WEBVIEW2_PUSH_MESSAGE;
}

const activationError = () => new Error('Notification service worker could not start. Reload the page and try again.');

/**
 * register() resolves once a service worker has been registered, which can be
 * before its worker reaches the active state. PushManager rejects subscriptions
 * made during that window, so always wait for the active registration.
 */
export async function waitForActiveServiceWorker(serviceWorkerContainer, registered, timeoutMs = ACTIVATION_TIMEOUT_MS) {
  if (registered?.active) return registered;
  if (!serviceWorkerContainer?.ready) throw activationError();

  let timeout;
  try {
    const ready = await Promise.race([
      serviceWorkerContainer.ready,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(activationError()), timeoutMs);
      }),
    ]);
    if (!ready?.active) throw activationError();
    return ready;
  } finally {
    clearTimeout(timeout);
  }
}

