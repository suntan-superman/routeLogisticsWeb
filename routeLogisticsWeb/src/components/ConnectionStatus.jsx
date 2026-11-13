import { useEffect, useState } from 'react';
export default function ConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online ? null : <p role="status" className="mb-4 rounded border border-amber-200 bg-amber-50 p-3">You’re offline. Previously loaded data may be available. Reconnect to upload photos, accept invitations, import customers, or generate visits.</p>;
}
