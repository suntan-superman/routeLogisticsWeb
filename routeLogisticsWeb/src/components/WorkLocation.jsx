import { useEffect, useRef, useState } from 'react';
import { callWorkspace } from '../services/workspaceApi';
export default function WorkLocation({ job }) {
  const [consent, setConsent] = useState(false), [sharing, setSharing] = useState(false), [error, setError] = useState('');
  const session = useRef(null), watch = useRef(null), lastSent = useRef(0);
  const stop = async () => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null; const id = session.current; session.current = null; setSharing(false);
    if (id) await callWorkspace('rlUpdateWorkLocation', { action: 'stop', sessionId: id }).catch(() => {});
  };
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden') void stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); void stop(); };
  }, [job.id, job.status]);
  const start = async () => {
    if (!consent || job.status !== 'in-progress') return;
    setError('');
    try {
      if (!navigator.geolocation) throw new Error('This browser does not support location sharing.');
      const first = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 }));
      const result = await callWorkspace('rlUpdateWorkLocation', { action: 'start', jobId: job.id, consent: true });
      session.current = result.sessionId; setSharing(true);
      const send = async position => {
        if (!session.current || Date.now() - lastSent.current < 15000) return;
        lastSent.current = Date.now();
        try { await callWorkspace('rlUpdateWorkLocation', { action: 'position', sessionId: session.current, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }); }
        catch (e) { setError(e.message); await stop(); }
      };
      await send(first);
      if (session.current) watch.current = navigator.geolocation.watchPosition(send, e => { setError(e.message); void stop(); }, { enableHighAccuracy: true, maximumAge: 15000 });
    } catch (e) { setError(e.message); await stop(); }
  };
  return <section className="rounded border p-4 space-y-3"><h3 className="font-semibold">Work location sharing: {sharing ? 'On' : 'Off'}</h3><p className="text-sm">Share only during this job while this page is visible. Your company can see your last shared work position.</p>{sharing ? <button className="btn-secondary" onClick={stop}>Stop sharing</button> : <><label className="flex gap-2"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I choose to share my work location.</label><button className="btn-secondary" disabled={!consent || job.status !== 'in-progress'} onClick={start}>Start sharing for this job</button></>}{error && <p role="alert">{error}</p>}</section>;
}
