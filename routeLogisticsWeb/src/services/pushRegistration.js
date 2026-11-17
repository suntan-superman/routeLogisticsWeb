const ACTIVATION_TIMEOUT_MS = 15_000;

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

