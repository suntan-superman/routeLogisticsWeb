import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { pushSupported, pushEnabled, enablePush, disablePush, onForegroundMessage } from '../services/push';
import { DUCKDUCKGO_PUSH_MESSAGE, getUnsupportedWebPushBrowser } from '../services/pushRegistration';

const NotificationToggle = () => {
  const unsupportedBrowser = getUnsupportedWebPushBrowser();
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(pushEnabled());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    if (unsupportedBrowser) return () => { cancelled = true; };
    pushSupported().then(async (ok) => {
      if (cancelled) return;
      setSupported(ok);
      if (ok && pushEnabled()) {
        const off = await onForegroundMessage((payload) => {
          toast(`${payload.notification?.title || 'Notification'}: ${payload.notification?.body || ''}`);
        });
        if (cancelled) off();
        else unsubscribe = off;
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, unsupportedBrowser]);

  if (unsupportedBrowser === 'duckduckgo-windows') {
    return (
      <button
        type="button"
        onClick={() => toast(DUCKDUCKGO_PUSH_MESSAGE, { icon: 'ℹ️' })}
        aria-label="Web notifications unavailable"
        title={DUCKDUCKGO_PUSH_MESSAGE}
        className="shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
      >
        <span aria-hidden="true">🔕</span><span className="hidden sm:inline"> Notifications unavailable</span>
      </button>
    );
  }

  if (!supported) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
        toast.success('Notifications turned off');
      } else {
        await enablePush();
        setEnabled(true);
        toast.success('Notifications turned on');
      }
    } catch (error) {
      toast.error(error.message || 'Could not change notification settings');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button onClick={toggle} disabled={busy} aria-label={enabled ? 'Notifications on' : 'Enable notifications'} title={enabled ? 'Notifications on' : 'Enable notifications'} className="shrink-0 whitespace-nowrap text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md disabled:opacity-50">
      <span aria-hidden="true">{enabled ? '🔔' : '🔕'}</span><span className="hidden sm:inline"> {enabled ? 'Notifications on' : 'Enable notifications'}</span>
    </button>
  );
};

export default NotificationToggle;
