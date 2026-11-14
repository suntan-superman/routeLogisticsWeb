import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { setNativePushScope, subscribePushJobOpen, subscribePushUpdates, retryNativePushOpen } from '../services/nativePush';
export default function NativePushBridge({ onOpenJob, onUpdate, blocked = false }) {
  const { user, accessStatus = 'ready' } = useAuth(), latest = useRef({ onOpenJob, onUpdate, blocked });
  latest.current = { onOpenJob, onUpdate, blocked };
  const scope = [user?.id, user?.companyId, user?.role, user?.membershipId].join(':');
  useEffect(() => { void setNativePushScope(user, accessStatus).catch(() => {}); }, [scope, accessStatus]);
  useEffect(() => {
    const open = subscribePushJobOpen(({ job }) => { if (latest.current.blocked) return false; latest.current.onOpenJob?.(job); return true; });
    const updates = subscribePushUpdates(() => { Promise.resolve(latest.current.onUpdate?.()).catch(() => {}); });
    return () => { open(); updates(); void setNativePushScope(null, 'signed-out').catch(() => {}); };
  }, []);
  useEffect(() => { if (!blocked) void retryNativePushOpen(); }, [blocked]);
  return null;
}
