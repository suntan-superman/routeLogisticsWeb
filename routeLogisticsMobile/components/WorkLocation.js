import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { GlassCard, GlassButton } from './Glass';
import { refreshWorkShift, startWorkShift, stopShiftTracking, subscribeWorkTracking, workTrackingSnapshot } from '../services/workTracking';

export default function WorkLocation() {
  const { palette } = useTheme(), { user, accessStatus = 'ready' } = useAuth();
  const scope = [user?.id, user?.companyId, user?.role, user?.membershipId].join(':');
  const [snapshot, setState] = useState(() => workTrackingSnapshot(user)), [expanded, setExpanded] = useState(false);
  const state = snapshot.scopeKey && snapshot.scopeKey !== scope ? workTrackingSnapshot(user) : snapshot;
  const [confirmation, setConfirmation] = useState(null), [background, setBackground] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [now, setNow] = useState(Date.now());
  const alive = useRef(false), ticket = useRef(0), locked = useRef(false);
  useEffect(() => { alive.current = true; const unsubscribe = subscribeWorkTracking(setState, user); const timer = setInterval(() => setNow(Date.now()), 15000); return () => { alive.current = false; unsubscribe(); clearInterval(timer); }; }, [scope]);
  useEffect(() => {
    ticket.current++; setConfirmation(null); setError(''); setBusy(false); locked.current = false;
    return () => { ticket.current++; };
  }, [scope]);
  useEffect(() => {
    const request = ticket.current;
    if (accessStatus !== 'ready' || !user?.companyId) return;
    refreshWorkShift(user).catch(failure => { if (alive.current && request === ticket.current) setError(failure.message || 'Could not check your shift. Reconnect and retry.'); });
  }, [scope, accessStatus]);
  const operate = async action => {
    if (locked.current || (action !== 'end' && accessStatus !== 'ready')) return;
    const request = ticket.current; locked.current = true; setBusy(true); setError('');
    try {
      if (action === 'refresh') await refreshWorkShift(user);
      else if (action === 'end') await stopShiftTracking({ endShift: true });
      else await startWorkShift(user, { trackingConsent: true, backgroundConsent: background });
      if (alive.current && request === ticket.current) setConfirmation(null);
    } catch (failure) { if (alive.current && request === ticket.current) setError(action === 'end' ? `Sharing stopped on this device. The server shift end is not confirmed. Reconnect and choose End shift again. ${failure.message || ''}`.trim() : failure.message || 'The shift operation failed. Check your connection and try again.'); }
    finally { if (alive.current && request === ticket.current) { locked.current = false; setBusy(false); } }
  };
  const onDuty = state.shift?.status === 'on-duty' && Date.parse(state.shift.expiresAt) > now;
  const lastFix = state.lastAcceptedAt, fresh = !!lastFix && now - Date.parse(lastFix) <= (state.policy.freshAfterSeconds || state.policy.intervalMinutes * 60 + 120) * 1000;
  const status = onDuty ? state.tracking ? 'On duty · Sharing work location' : 'On duty · Location sharing off' : 'Off duty · Location sharing off';
  return <GlassCard contentStyle={{ padding: 16, gap: 10 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Work shift: ${status}. ${expanded ? 'Hide' : 'Show'} shift controls`} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, gap: 3 }}><Text style={{ color: palette.text, fontSize: 15, fontWeight: '700' }}>Work shift</Text><Text accessibilityLiveRegion="polite" style={{ color: palette.secondary, fontSize: 13, lineHeight: 20 }}>{status}</Text></View>
      <Text style={{ color: palette.accent, fontSize: 14 }}>{expanded ? 'Hide' : 'Manage'}</Text>
    </Pressable>
    {!!lastFix && <Text accessibilityLiveRegion="polite" style={{ color: palette.secondary, fontSize: 13, lineHeight: 20 }}>{fresh ? 'Last shared GPS fix' : 'Older shared GPS fix'}: {new Date(lastFix).toLocaleString()}{Number.isFinite(state.lastAccuracy) ? ` · about ${Math.round(state.lastAccuracy)} m accuracy` : ''}</Text>}
    {state.pendingCount > 0 && <Text style={{ color: palette.secondary }}>{state.pendingCount} GPS sample{state.pendingCount === 1 ? '' : 's'} awaiting connection</Text>}
    {!!(error || state.error) && <Text accessibilityRole="alert" style={{ color: palette.danger, lineHeight: 21 }}>{error || state.error}</Text>}
    {(onDuty || state.tracking) && (!expanded || confirmation !== 'end') && <GlassButton secondary title="End shift" disabled={busy} onPress={() => { setExpanded(true); setConfirmation('end'); }} />}
    {expanded && <View style={{ gap: 12 }}>
      <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 21 }}>Start shift makes you on duty. Location sharing is optional and independent of your current job. End shift stops collection and removes unsent GPS samples; saved job work and photos are kept.</Text>
      <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 21 }}>Company target: one update every {state.policy.intervalMinutes} minute{state.policy.intervalMinutes === 1 ? '' : 's'}. Device settings and iOS or Android scheduling can delay updates, especially in the background. Tracking is not guaranteed after force quitting the app. Shifts expire after {state.policy.maxShiftHours || 12} hours.</Text>
      {state.tracking && <Text style={{ color: palette.secondary, lineHeight: 21 }}>{state.background ? 'Background sharing is on. Your device shows a location indicator or persistent notification.' : 'App-open sharing is on. Background location is off.'}</Text>}
      {!user?.companyId ? <Text style={{ color: palette.secondary }}>Work shifts are available in a company workspace.</Text> : confirmation === 'end' ? <View style={{ gap: 10 }}>
        <Text style={{ color: palette.text, lineHeight: 22 }}>End your shift and stop sharing location? Unsent GPS samples will be removed from this device.</Text>
        <GlassButton title="Confirm end shift" busy={busy} disabled={busy} onPress={() => operate('end')} />
        <GlassButton secondary title="Keep shift open" disabled={busy} onPress={() => setConfirmation(null)} />
      </View> : confirmation === 'start' ? <View style={{ gap: 10 }}>
        <Text style={{ color: palette.text, lineHeight: 22 }}>Share work location with your company during this shift? You can end the shift at any time. Positions already shared follow the company retention policy.</Text>
        <Pressable accessibilityRole="checkbox" accessibilityLabel="Allow location sharing in the background during this shift" accessibilityState={{ checked: background, disabled: busy }} disabled={busy} onPress={() => setBackground(value => !value)} style={{ minHeight: 48, padding: 12, borderWidth: 1, borderColor: palette.border, borderRadius: 12 }}><Text style={{ color: palette.text, lineHeight: 21 }}>{background ? '☑' : '☐'} Also share when this app is in the background. This requests Always/background location permission.</Text></Pressable>
        <GlassButton title="Confirm start shift" busy={busy} disabled={busy || accessStatus !== 'ready'} onPress={() => operate('start')} />
        <GlassButton secondary title="Cancel shift start" disabled={busy} onPress={() => setConfirmation(null)} />
      </View> : <>
        {!state.tracking && <GlassButton title={onDuty ? 'Resume location sharing' : 'Start shift'} disabled={busy || accessStatus !== 'ready'} onPress={() => { setBackground(false); setConfirmation('start'); }} />}
      </>}
      {!!state.message && <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 21 }}>{state.message}</Text>}
      {!!(error || state.error) && <GlassButton secondary title="Retry shift check" disabled={busy || accessStatus !== 'ready'} onPress={() => operate('refresh')} />}
    </View>}
  </GlassCard>;
}
