import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../constants/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { GlassCard, GlassButton } from './Glass';
import { beginNativeInteraction } from '../services/nativeInteraction';
import { readWorkspace } from '../services/workspaceApi';
const call = data => httpsCallable(functions, 'rlUpdateWorkLocation')(data).then(result => result.data);

export default function WorkLocation({ jobs = [], jobsReady = true }) {
  const { palette } = useTheme(), { user, accessStatus = 'ready' } = useAuth();
  const scope = [user?.id, user?.companyId, user?.role, user?.membershipId].join(':');
  const [sharing, setSharing] = useState(false), [busy, setBusy] = useState(false), [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState(''), [consent, setConsent] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [lastFix, setLastFix] = useState(null);
  const watcher = useRef(null), session = useRef(null), workId = useRef(null), mounted = useRef(false), generation = useRef(0), locked = useRef(false), permissionPending = useRef(false), waitingForActive = useRef(null), lastUpdate = useRef(0), sending = useRef(false);
  const checkedSnapshot = useRef(null);
  const eligible = jobs.filter(job => job.status === 'in-progress' && !!user?.companyId && job.companyId === user.companyId && (user.role !== 'technician' || job.assignedTo === user.membershipId));
  const stop = async reason => {
    generation.current++; waitingForActive.current?.(false); waitingForActive.current = null;
    watcher.current?.remove(); watcher.current = null;
    const previous = session.current; session.current = null; workId.current = null; locked.current = false;
    if (mounted.current) { setSharing(false); setBusy(false); setConsent(false); if (reason) setMessage(reason); }
    if (previous) await call({ action: 'stop', sessionId: previous }).catch(() => { if (mounted.current) setMessage('Stopped on this device. The last shared position may remain visible until the company retention limit expires.'); });
  };
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') { waitingForActive.current?.(true); waitingForActive.current = null; }
      else if (state === 'background' || !permissionPending.current || session.current) void stop('Location sharing stopped when the app left the foreground.');
    });
    return () => { mounted.current = false; subscription.remove(); void stop(); };
  }, []);
  useEffect(() => { setLastFix(null); setError(''); setMessage(''); return () => { void stop(); }; }, [scope]);
  useEffect(() => {
    if (!eligible.some(job => job.id === selected)) setSelected(eligible[0]?.id || '');
  }, [jobs, jobsReady, user?.id, user?.companyId, user?.role, user?.membershipId, selected]);
  useEffect(() => {
    if (!jobsReady || !session.current || accessStatus !== 'ready') { checkedSnapshot.current = null; return; }
    const sharingSession = session.current, jobId = workId.current, ticket = generation.current;
    const invalid = job => !job || job.companyId !== user?.companyId || ['completed', 'cancelled'].includes(job.status) || (user?.role === 'technician' && job.assignedTo !== user?.membershipId);
    const reason = 'Location sharing stopped because the job finished or its assignment changed.';
    const listed = jobs.find(job => job.id === jobId);
    if (listed) { checkedSnapshot.current = null; if (invalid(listed)) void stop(reason); return; }
    // Today/route filters can omit valid work after midnight or rescheduling.
    // Check the selected job itself once per list snapshot before ending consent.
    const previous = checkedSnapshot.current;
    if (previous?.jobs === jobs && previous.session === sharingSession && previous.scope === scope) return;
    const check = { jobs, session: sharingSession, scope }; checkedSnapshot.current = check;
    const currentCheck = () => mounted.current && checkedSnapshot.current === check && generation.current === ticket && session.current === sharingSession && workId.current === jobId;
    readWorkspace('jobs', { id: jobId }).then(result => {
      if (currentCheck() && invalid(result.job)) void stop(reason);
    }).catch(failure => {
      if (!currentCheck()) return;
      if (['permission-denied', 'unauthenticated', 'not-found'].includes(String(failure.code || '').split('/').pop())) {
        void stop('Location sharing stopped because this job is no longer accessible.');
        setError(failure.message || 'Your assignment could not be authorized. Refresh your workspace before sharing again.');
      } else setMessage('Could not refresh this job. Sharing continues while this app is open; every location update checks your current assignment.');
    });
  }, [jobs, jobsReady, sharing, scope, accessStatus]);
  const current = ticket => mounted.current && ticket === generation.current;
  const active = async ticket => {
    if (!current(ticket) || AppState.currentState === 'background') return false;
    if (AppState.currentState === 'active') return true;
    return new Promise(resolve => { waitingForActive.current = resolve; });
  };
  const start = async () => {
    if (locked.current || !consent) return;
    const job = eligible.find(row => row.id === selected);
    if (!job) { setError('Start an assigned job and wait for it to synchronize before sharing.'); return; }
    const ticket = ++generation.current; locked.current = true; setBusy(true); setError(''); setMessage('');
    const release = beginNativeInteraction();
    try {
      permissionPending.current = ticket;
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!current(ticket)) return;
      if (!permission.granted) { setError('Location permission is off. Enable it in your device Settings to share during work.'); return; }
      if (!(await active(ticket)) || !current(ticket)) return;
      if (permissionPending.current === ticket) permissionPending.current = false;
      const response = await call({ action: 'start', jobId: job.id });
      if (!current(ticket) || AppState.currentState !== 'active') { await call({ action: 'stop', sessionId: response.sessionId }).catch(() => {}); return; }
      session.current = response.sessionId; workId.current = job.id; lastUpdate.current = 0; sending.current = false;
      setSharing(true); setConsent(false); setLastFix(null); setMessage('Sharing only while this app is open and this job is in progress. Waiting for a GPS fix.');
      const watch = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 60000, distanceInterval: 50 }, async position => {
        if (!current(ticket) || !session.current || sending.current || (lastUpdate.current && Date.now() - lastUpdate.current < 60000)) return;
        sending.current = true;
        try {
          await call({ action: 'position', sessionId: session.current, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy ?? 0 });
          if (current(ticket) && session.current) { lastUpdate.current = Date.now(); setLastFix({ at: new Date().toISOString(), accuracy: position.coords.accuracy }); setMessage('Your manager can see the last shared position. Background sharing is off.'); }
        } catch (failure) { if (current(ticket)) { await stop('Location sharing stopped.'); if (mounted.current) setError(failure.message || 'The connection or work session is unavailable. Reconnect and start sharing again.'); } }
        finally { sending.current = false; }
      });
      if (!current(ticket) || !session.current) watch.remove(); else watcher.current = watch;
    } catch (failure) { if (current(ticket)) { await stop('Location sharing is off.'); if (mounted.current) setError(failure.message || 'Location sharing could not start. Try again while connected.'); } }
    finally { if (permissionPending.current === ticket) permissionPending.current = false; release(); if (current(ticket)) { locked.current = false; setBusy(false); } }
  };
  const selectedJob = eligible.find(job => job.id === selected);
  return <GlassCard contentStyle={{ padding: 16, gap: 10 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Work location sharing ${sharing ? 'on' : 'off'}. ${expanded ? 'Hide' : 'Show'} location controls`} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ flex: 1, gap: 3 }}><Text style={{ color: palette.text, fontSize: 15, fontWeight: '700' }}>Work location</Text><Text accessibilityLiveRegion="polite" style={{ color: palette.secondary, fontSize: 13, lineHeight: 20 }}>{busy && !sharing ? 'Starting location sharing…' : sharing ? 'Sharing · App open only' : 'Sharing off'}</Text></View><Text style={{ color: palette.accent, fontSize: 14 }}>{expanded ? 'Hide' : 'Manage'}</Text></Pressable>
    {!!lastFix && <Text accessibilityLiveRegion="polite" style={{ color: palette.secondary, fontSize: 13, lineHeight: 20 }}>Last shared update: {new Date(lastFix.at).toLocaleString()}{Number.isFinite(lastFix.accuracy) ? ` · about ${Math.round(lastFix.accuracy)} m accuracy` : ''}</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: palette.danger, lineHeight: 21 }}>{error}</Text>}
    {sharing && <GlassButton secondary title="Stop sharing location" disabled={busy} onPress={() => stop('Location sharing stopped.')} />}
    {expanded && <View style={{ gap: 12 }}>
      <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 21 }}>Location sharing is optional. Your manager sees the last position you choose to share. This app does not track your location in the background.</Text>
      {!sharing && (!eligible.length ? <Text style={{ color: palette.secondary, lineHeight: 21 }}>{user?.companyId ? 'Start an assigned job and synchronize it to enable work location sharing.' : 'Team location sharing is available during company work.'}</Text> : <>
        <Text style={{ color: palette.text, fontWeight: '600' }}>Active job</Text>
        {eligible.map(job => <Pressable key={job.id} accessibilityRole="radio" accessibilityLabel={`Share location for ${job.customerName || job.serviceType || 'assigned job'}`} accessibilityState={{ checked: selected === job.id, disabled: busy }} disabled={busy} onPress={() => { setSelected(job.id); setConsent(false); }} style={{ minHeight: 44, borderWidth: 1, borderRadius: 10, padding: 12, borderColor: selected === job.id ? palette.accent : palette.border }}><Text style={{ color: palette.text }}>{selected === job.id ? '● ' : '○ '}{job.customerName || job.serviceType || 'Assigned job'}</Text></Pressable>)}
        {!consent ? <GlassButton title="Share during this job" disabled={busy || !selectedJob} onPress={() => setConsent(true)} /> : <View style={{ padding: 12, gap: 10, borderWidth: 1, borderColor: palette.border, borderRadius: 12 }}><Text style={{ color: palette.text, lineHeight: 22 }}>Share your work location for {selectedJob?.customerName || selectedJob?.serviceType || 'this job'} while the app is open? You can stop at any time. A previous position may remain visible under your company retention policy.</Text><GlassButton title="Confirm location sharing" busy={busy} disabled={busy} onPress={start} /><GlassButton secondary title="Keep location sharing off" disabled={busy} onPress={() => setConsent(false)} /></View>}
      </>)}
      {!!message && <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 21 }}>{message}</Text>}
    </View>}
  </GlassCard>;
}
