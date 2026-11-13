import { useTheme } from '../theme/ThemeProvider';
import { GlassCard } from './Glass';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../constants/firebase';
import { useAuth } from '../contexts/AuthContext';
const call = (data) => httpsCallable(functions, 'rlUpdateWorkLocation')(data).then((r) => r.data);

export default function WorkLocation({ jobs = [] }) {
  const { palette } = useTheme();
  const { user } = useAuth();
  const [sharing, setSharing] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const watcher = useRef(null), session = useRef(null), mounted = useRef(true), lastUpdate = useRef(0);
  const stop = async () => {
    watcher.current?.remove(); watcher.current = null;
    const previous = session.current; session.current = null;
    if (mounted.current) setSharing(false);
    if (previous) await call({ action: 'stop', sessionId: previous }).catch(() => { if (mounted.current) setMessage('Stopped on this device. Server status expires shortly if offline.'); });
  };
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') stop(); });
    return () => { mounted.current = false; subscription.remove(); stop(); };
  }, []);
  const start = async (job) => {
    setBusy(true); setMessage('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { setMessage('Location permission was denied. Sharing remains off.'); return; }
      const response = await call({ action: 'start', jobId: job.id });
      if (!mounted.current || AppState.currentState !== 'active') { await call({ action: 'stop', sessionId: response.sessionId }); return; }
      session.current = response.sessionId; lastUpdate.current = 0; setSharing(true);
      setMessage(`Shared only while this app is open and the job is in progress. Last position visible for up to ${response.retentionHours} hours; expired records are removed hourly.`);
      watcher.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 60000, distanceInterval: 50 }, async (position) => {
        if (!session.current || Date.now() - lastUpdate.current < 60000) return;
        lastUpdate.current = Date.now();
        try { await call({ action: 'position', sessionId: session.current, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy ?? 0 }); }
        catch { await stop(); if (mounted.current) setMessage('Sharing stopped because the connection or work session is unavailable.'); }
      });
      if (!session.current) { watcher.current?.remove(); watcher.current = null; }
    } catch (error) { await stop(); if (mounted.current) setMessage(error.message || 'Location sharing could not start.'); }
    finally { if (mounted.current) setBusy(false); }
  };
  const eligible = jobs.filter((job) => job.status === 'in-progress' && (user?.role !== 'technician' || job.assignedTo === user?.membershipId));
  return <GlassCard contentStyle={{ padding: 16, gap: 7 }}><Text style={{ fontWeight: '700', fontSize: 14, color: palette.text }}>{sharing ? 'Work location sharing is ON' : 'Work location sharing is OFF'}</Text>{sharing ? <TouchableOpacity onPress={stop}><Text style={{ color: palette.danger, paddingVertical: 10 }}>Stop sharing location</Text></TouchableOpacity> : eligible.slice(0, 5).map((job) => <TouchableOpacity disabled={busy} key={job.id} onPress={() => Alert.alert('Share work location?', 'Managers will see your last location while this app is open and this job is in progress. You can stop at any time.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Start sharing', onPress: () => start(job) }])}><Text style={{ color: palette.accent, paddingVertical: 8 }}>Share while working: {job.customerName || job.serviceType}</Text></TouchableOpacity>)}{!sharing && !eligible.length && <Text style={{ color: palette.secondary, fontSize: 13, lineHeight: 20 }}>Start an assigned job to share your work location.</Text>}{!!message && <Text style={{ marginTop: 4, color: palette.secondary, fontSize: 13, lineHeight: 20 }}>{message}</Text>}</GlassCard>;
}
