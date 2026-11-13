import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { pushSupported, pushEnabled, enablePush, disablePush, onForegroundMessage } from '../services/push';

const NotificationToggle = () => {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(pushEnabled());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
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
  }, [enabled]);

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
    <button onClick={toggle} disabled={busy} className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md disabled:opacity-50">
      {enabled ? '🔔 Notifications on' : '🔕 Enable notifications'}
    </button>
  );
};

export default NotificationToggle;
