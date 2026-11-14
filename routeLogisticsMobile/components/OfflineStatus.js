import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../contexts/AuthContext';
import { GlassCard, GlassButton } from './Glass';
import { queuedWork, subscribeOffline, flushOffline, resolveOffline } from '../services/offline';

const workName = row => row.kind === 'photo' ? 'Photo' : row.kind === 'application' ? 'Application record' : row.kind === 'service-form' ? 'Service report' : 'Job update';
const reviewLabels = { status: 'Status', actualWorkDone: 'Work completed', actualHours: 'Actual hours', completionNotes: 'Completion notes', notes: 'Work notes', completedAt: 'Completed at' };
function ReviewValues({ title, values, palette }) {
  return <View style={{ gap: 4 }}><Text style={{ color: palette.text, fontWeight: '600' }}>{title}</Text>{Object.entries(reviewLabels).filter(([key]) => values?.[key] != null).map(([key, label]) => <Text key={key} style={{ color: palette.secondary, fontSize: 14, lineHeight: 21 }}>{label}: {String(values[key])}</Text>)}</View>;
}

export default function OfflineStatus({ onSynced }) {
  const { palette } = useTheme(), { user, accessStatus = 'ready' } = useAuth();
  const scope = [user?.id, user?.companyId, user?.role, user?.membershipId].join(':');
  const [rows, setRows] = useState([]), [offline, setOffline] = useState(false), [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(''), [confirmation, setConfirmation] = useState(null), [busy, setBusy] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const onChanged = useRef(onSynced), live = useRef(false), generation = useRef(0), actionLocked = useRef(false);
  const canSynchronize = accessStatus === 'ready';
  const synchronizationReady = useRef(canSynchronize); synchronizationReady.current = canSynchronize;
  onChanged.current = onSynced;
  useEffect(() => {
    let mounted = true, request = 0, signature = null;
    const ticket = ++generation.current; live.current = true;
    setRows([]); setConfirmation(null); setBusy(false); setError(''); actionLocked.current = false;
    const current = () => mounted && ticket === generation.current;
    const refresh = async () => {
      const reading = ++request;
      try {
        const data = await queuedWork(); if (!current() || reading !== request) return;
        setRows(data); setError('');
        const next = data.filter(row => ['synced', 'discarded'].includes(row.state)).map(row => `${row.id}:${row.state}`).join();
        if (signature !== null && signature !== next) {
          Promise.resolve().then(() => onChanged.current?.()).catch(failure => {
            if (current()) setError(`Saved work updated. Your schedule could not refresh: ${failure.message || 'Try again when connected.'}`);
          });
        }
        signature = next;
      } catch (failure) { if (current() && reading === request) setError(failure.message || 'Could not read saved work. Reconnect and try again.'); }
    };
    const tick = () => {
      if (AppState.currentState !== 'active' || !synchronizationReady.current) return;
      Promise.resolve().then(() => { if (current() && synchronizationReady.current) return flushOffline(); }).catch(failure => { if (current()) setError(failure.message || 'Saved work could not synchronize. Review the details below.'); });
    };
    const unsubscribe = subscribeOffline(refresh);
    const network = NetInfo.addEventListener(state => { if (current()) setOffline(state.isConnected === false || state.isInternetReachable === false); tick(); });
    const app = AppState.addEventListener('change', state => { if (current()) setForeground(state === 'active'); if (state === 'active') { refresh(); tick(); } });
    const timer = setInterval(tick, 15000); refresh(); tick();
    return () => { mounted = false; live.current = false; generation.current++; unsubscribe(); network(); app.remove(); clearInterval(timer); };
  }, [scope]);
  const change = async () => {
    if (!confirmation || actionLocked.current || (confirmation.action === 'retry' && !canSynchronize)) return;
    const ticket = generation.current, action = confirmation; actionLocked.current = true; setBusy(true); setError('');
    try { await resolveOffline(action.id, action.action); if (live.current && ticket === generation.current) setConfirmation(null); }
    catch (failure) { if (live.current && ticket === generation.current) setError(failure.message || 'The saved change could not be updated. Its details remain on this device.'); }
    finally { if (ticket === generation.current) { actionLocked.current = false; if (live.current) setBusy(false); } }
  };
  const outstanding = rows.filter(row => !['synced', 'discarded'].includes(row.state));
  const failed = outstanding.filter(row => ['failed', 'conflict'].includes(row.state)).length;
  const syncing = outstanding.filter(row => row.state === 'syncing').length;
  const status = failed ? 'Needs attention' : syncing ? 'Syncing' : outstanding.length ? 'Pending' : 'Synced';
  const count = failed || syncing || outstanding.length;
  return <GlassCard contentStyle={{ padding: 16, gap: 9 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Sync status: ${status}${count ? `, ${count} changes` : ''}. ${expanded ? 'Hide' : 'Show'} saved work`} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1, gap: 3 }}><Text style={{ color: palette.text, fontWeight: '700', fontSize: 15 }}>Saved work</Text><Text accessibilityLiveRegion="polite" style={{ color: failed ? palette.danger : palette.secondary, fontSize: 13, lineHeight: 20 }}>{status}{count ? ` · ${count}` : ''}{offline ? ' · Offline' : ''}</Text></View>
      <Text style={{ color: palette.accent, fontSize: 14 }}>{expanded ? 'Hide details' : 'Details'}</Text>
    </Pressable>
    {!!error && <Text accessibilityRole="alert" style={{ color: palette.danger, lineHeight: 21 }}>{error}</Text>}
    {expanded && <View style={{ gap: 14 }}>
      <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 21 }}>{offline ? 'Saved changes stay on this device and resume when you reconnect.' : 'Changes synchronize while the app is open and connected.'}</Text>
      {!outstanding.length && <Text style={{ color: palette.secondary, lineHeight: 21 }}>All saved changes are synchronized.</Text>}
      {outstanding.map(row => <View key={row.id} style={{ borderTopWidth: 1, borderColor: palette.border, paddingTop: 12, gap: 8 }}>
        <Text style={{ color: palette.text, fontWeight: '600' }}>{workName(row)} · {row.state === 'conflict' ? 'Needs review' : row.state}</Text>
        {!!row.error && <Text accessibilityRole="alert" style={{ color: palette.danger, lineHeight: 21 }}>{row.error}</Text>}
        {row.kind === 'service-form' && <View style={{ gap: 5 }}><Text style={{ color: palette.text }}>{row.template?.name || 'Service template'} · version {row.record.templateVersion}</Text>
          {row.template?.fields?.filter(field => row.record.answers?.[field.id] != null).map(field => <Text key={field.id} style={{ color: palette.secondary, fontSize: 14, lineHeight: 21 }}>{field.label}: {Array.isArray(row.record.answers[field.id]) ? row.record.answers[field.id].join(', ') : String(row.record.answers[field.id])}{field.unit ? ` ${field.unit}` : ''}</Text>)}
          {row.state === 'conflict' && <Text style={{ color: palette.danger }}>Online report revision {row.serverVersion}; saved revision {row.record.expectedVersion}. Reopen the service form to review current answers.</Text>}
        </View>}
        {row.state === 'conflict' && row.kind !== 'service-form' && <><ReviewValues title="Latest online work" values={row.server} palette={palette} /><ReviewValues title="Your saved change" values={row.patch} palette={palette} /></>}
        {['failed', 'conflict'].includes(row.state) && <><GlassButton secondary title={row.state === 'conflict' ? 'Retry after review' : 'Retry saved change'} disabled={busy || !canSynchronize} onPress={() => setConfirmation({ id: row.id, action: 'retry' })} /><GlassButton secondary title="Discard this local change" disabled={busy} onPress={() => setConfirmation({ id: row.id, action: 'discard' })} /></>}
      </View>)}
      {confirmation && <View accessibilityLabel="Confirm saved-work action" style={{ padding: 12, gap: 10, borderWidth: 1, borderColor: palette.border, borderRadius: 12 }}><Text style={{ color: palette.text, lineHeight: 22 }}>{confirmation.action === 'discard' ? 'Discard only this saved change? Your other queued work and photos are kept.' : 'Retry this saved change? Your current assignment and the latest job will be checked again.'}</Text><GlassButton title={confirmation.action === 'discard' ? 'Confirm discard' : 'Confirm retry'} busy={busy} disabled={busy || (confirmation.action === 'retry' && !canSynchronize)} onPress={change} /><GlassButton secondary title="Keep saved change" disabled={busy} onPress={() => setConfirmation(null)} /></View>}
      {!canSynchronize && <Text style={{ color: palette.secondary, lineHeight: 21 }}>Saved work stays on this device while workspace access is checked. Synchronization resumes when access is ready.</Text>}
      <GlassButton secondary title="Synchronize saved work" disabled={offline || !foreground || busy || !canSynchronize} onPress={() => Promise.resolve().then(() => { if (synchronizationReady.current) return flushOffline(); }).catch(failure => { if (live.current) setError(failure.message || 'Synchronization could not start. Try again when connected.'); })} />
    </View>}
  </GlassCard>;
}
