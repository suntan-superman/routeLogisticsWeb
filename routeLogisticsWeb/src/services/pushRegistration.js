const ACTIVATION_TIMEOUT_MS = 15_000;

export const DUCKDUCKGO_PUSH_MESSAGE = 'DuckDuckGo for Windows does not support web push notifications. Use Chrome or Edge to receive browser notifications.';

export function getUnsupportedWebPushBrowser(browser = globalThis.navigator) {
  const userAgent = browser?.userAgent || '';
  const platform = browser?.userAgentData?.platform || browser?.platform || '';
  const isDuckDuckGo = /(?:DuckDuckGo|Ddg)\//i.test(userAgent);
  const isWindows = /Windows/i.test(userAgent) || /^Win/i.test(platform);
  return isDuckDuckGo && isWindows ? 'duckduckgo-windows' : null;
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

