import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { GlassCard, GlassButton, IconButton } from './Glass';
import { refreshWorkShift, startWorkShift, stopShiftTracking, subscribeWorkTracking, workTrackingSnapshot } from '../services/workTracking';

export default function WorkLocation({ active = true, disabled = false, onInteractionChange, children }) {
  const { palette } = useTheme(), { user, accessStatus = 'ready' } = useAuth();
  const scope = [user?.id, user?.companyId, user?.role, user?.membershipId].join(':');
  const [snapshot, setSnapshot] = useState(() => workTrackingSnapshot(user));
  const [dialogScope, setDialogScope] = useState(null), [background, setBackground] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [now, setNow] = useState(Date.now);
  const [check, setCheck] = useState({ scope: '', status: 'checking' });
  const alive = useRef(false), generation = useRef(0), reading = useRef(null), locked = useRef(false);
  const notify = useRef(onInteractionChange), current = useRef({ scope, active, dialogScope });
  notify.current = onInteractionChange; current.current = { scope, active, dialogScope };
  const state = snapshot.scopeKey && snapshot.scopeKey !== scope ? workTrackingSnapshot(user) : snapshot;
  const visible = !!user?.companyId && active && dialogScope === scope;
  const readStatus = useCallback(async () => {
    if (accessStatus !== 'ready' || !user?.companyId || locked.current || reading.current) return;
    const request = { scope, generation: generation.current }; reading.current = request;
    setCheck({ scope, status: 'checking' });
    try {
      await refreshWorkShift(user);
      if (alive.current && current.current.scope === scope && request.generation === generation.current) {
        setCheck({ scope, status: 'ready' });
      }
    } catch (failure) {
      if (alive.current && current.current.scope === scope && request.generation === generation.current) {
        setCheck({ scope, status: 'unavailable' }); setError(failure.message || 'Could not check your shift. Reconnect and retry.');
      }
    } finally { if (reading.current === request) reading.current = null; }
  }, [scope, accessStatus, user]);
  useEffect(() => {
    alive.current = true;
    const unsubscribe = subscribeWorkTracking(setSnapshot, user);
    return () => { alive.current = false; unsubscribe(); };
  }, [scope]);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [active]);
  useEffect(() => {
    generation.current++; reading.current = null; locked.current = false;
    setDialogScope(null); setBackground(false); setBusy(false); setError(''); setCheck({ scope, status: accessStatus === 'ready' ? 'checking' : 'unavailable' });
    return () => { generation.current++; };
  }, [scope]);
  useEffect(() => {
    if (active && accessStatus === 'ready') void readStatus();
    else if (active && accessStatus !== 'ready') setCheck({ scope, status: 'unavailable' });
  }, [scope, accessStatus, active]);
  useEffect(() => {
    const subscription = AppState?.addEventListener?.('change', value => { if (value === 'active' && current.current.active) void readStatus(); });
    return () => subscription?.remove();
  }, [readStatus]);
  // A denied/stopped tracking session needs a fresh server duty status. This is
  // event driven; it adds no polling loop or repeated native tracking setup.
  useEffect(() => { if (active && !state.tracking && state.error) void readStatus(); }, [scope, active, state.tracking, state.error]);
  useEffect(() => { notify.current?.({ busy: active && (visible || busy), hasDraft: false }); }, [active, visible, busy]);
  useEffect(() => { if (!active) setDialogScope(null); }, [active]);
  const close = useCallback(() => {
    if (locked.current) return;
    setDialogScope(null); setBackground(false);
    notify.current?.({ busy: false, hasDraft: false });
  }, []);
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler?.addEventListener?.('hardwareBackPress', () => { close(); return true; });
    return () => subscription?.remove();
  }, [visible, close]);
  useEffect(() => () => notify.current?.({ busy: false, hasDraft: false }), []);
  const open = () => {
    if (!active || disabled || locked.current || !user?.companyId) return;
    notify.current?.({ busy: true, hasDraft: false });
    setBackground(false); setDialogScope(scope); void readStatus();
  };
  const operate = async action => {
    if (locked.current || (action !== 'end' && accessStatus !== 'ready')) return;
    const request = generation.current, identity = scope;
    locked.current = true; setBusy(true); setError('');
    try {
      if (action === 'end') await stopShiftTracking({ endShift: true });
      else await startWorkShift(user, { trackingConsent: true, backgroundConsent: background });
      if (alive.current && request === generation.current && current.current.scope === identity) setCheck({ scope, status: 'ready' });
    } catch (failure) {
      if (alive.current && request === generation.current && current.current.scope === identity) setError(action === 'end'
        ? `Sharing stopped on this device. The server shift end is not confirmed. Reconnect and choose End shift again. ${failure.message || ''}`.trim()
        : failure.message || 'The shift operation failed. Check your connection and try again.');
    } finally {
      if (alive.current && request === generation.current && current.current.scope === identity) { locked.current = false; setBusy(false); }
    }
  };
  const onDuty = state.shift?.status === 'on-duty' && Date.parse(state.shift.expiresAt) > now;
  const known = check.scope === scope && check.status === 'ready';
  const label = onDuty ? 'On Duty' : known ? 'Off Duty' : check.status === 'checking' ? 'Checking…' : 'Check Status';
  const lastFix = state.lastAcceptedAt, fresh = !!lastFix && now - Date.parse(lastFix) <= (state.policy.freshAfterSeconds || 300) * 1000;
  const attention = !!(error || state.error) || (onDuty && (!state.tracking || !fresh));
  const button = user?.companyId ? <Pressable testID="duty-status-button" accessibilityRole="button"
    accessibilityLabel={`${label}. Open work shift controls.`} accessibilityHint={attention ? 'Location sharing or shift status needs attention. Open for details.' : 'View location sharing and start or end your shift.'}
    accessibilityState={{ expanded: visible, disabled: disabled || busy || !active, busy }} disabled={disabled || busy || !active} onPress={open}
    style={({ pressed }) => ({ minHeight: 44, minWidth: 100, maxWidth: 138, flexShrink: 0, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
      backgroundColor: onDuty ? '#047857' : known ? '#B91C1C' : '#475569', opacity: disabled || busy ? 0.55 : pressed ? 0.8 : 1 })}>
    {busy && <ActivityIndicator color="#FFFFFF" size="small" />}
    <Text style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' }}>{label}</Text>
    {attention && <Text accessible={false} style={{ color: '#FFFFFF', fontWeight: '800' }}>!</Text>}
  </Pressable> : null;
  const dialog = visible ? <View testID="work-shift-dialog" accessibilityViewIsModal style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 1000, elevation: 24, padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' }}>
    <Pressable testID="work-shift-backdrop" accessible={false} disabled={busy} onPress={close} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />
    <View style={{ width: '100%', maxWidth: 480, maxHeight: '90%' }}>
      <GlassCard style={{ maxHeight: '100%' }} contentStyle={{ padding: 20, gap: 16, flexShrink: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}><Text accessibilityRole="header" style={{ color: palette.text, fontSize: 23, lineHeight: 30, fontWeight: '700' }}>Work shift</Text>
            <Text accessibilityLiveRegion="polite" style={{ color: palette.secondary, fontSize: 15, lineHeight: 23 }}>{label}</Text></View>
          <IconButton icon="close" label="Close shift controls" disabled={busy} onPress={close} />
        </View>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 14, paddingBottom: 4 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: palette.text, lineHeight: 22 }}>Going on duty shares your work location with authorized managers and the owner of your company. End your shift to stop sharing. Your saved job work and photos are kept.</Text>
          {onDuty && <Text style={{ color: palette.secondary, lineHeight: 22 }}>{state.tracking
            ? state.background ? 'Location sharing is enabled during this shift, including in the background.' : 'Location sharing is enabled while this app is open. Background sharing is off.'
            : 'Your shift is recorded as on duty, but location sharing is paused on this device. Resume sharing after confirming permission.'}</Text>}
          {!!lastFix && <Text style={{ color: palette.secondary, lineHeight: 22 }}>{fresh ? 'Last shared GPS fix' : 'Older shared GPS fix'}: {new Date(lastFix).toLocaleString()}{Number.isFinite(state.lastAccuracy) ? ` · about ${Math.round(state.lastAccuracy)} m accuracy` : ''}</Text>}
          {onDuty && state.tracking && !lastFix && <Text style={{ color: palette.secondary, lineHeight: 22 }}>Waiting for the first GPS fix. Your manager can see duty status before a map position becomes available.</Text>}
          {state.pendingCount > 0 && <Text style={{ color: palette.secondary, lineHeight: 22 }}>{state.pendingCount} GPS samples awaiting connection.</Text>}
          <Text style={{ color: palette.secondary, fontSize: 13, lineHeight: 21 }}>Updates target every {state.policy.intervalMinutes} minutes. Permissions, connectivity and device scheduling can delay locations. Shifts expire after {state.policy.maxShiftHours || 12} hours.</Text>
          {!!(error || state.error) && <Text accessibilityRole="alert" style={{ color: palette.danger, lineHeight: 22 }}>{error || state.error}</Text>}
          {!onDuty && !known && <Text style={{ color: palette.secondary, lineHeight: 22 }}>Your current shift has not been verified. Reconnect and refresh its status before starting.</Text>}
          {(onDuty || state.tracking) && <GlassButton title="End shift" busy={busy} disabled={busy} onPress={() => operate('end')} />}
          {!state.tracking && (known || onDuty) && <>
            <Text style={{ color: palette.secondary, lineHeight: 22 }}>By selecting {onDuty ? 'Resume location sharing' : 'Start shift'}, you confirm work location sharing for this shift.</Text>
            <Pressable accessibilityRole="checkbox" accessibilityLabel="Allow location sharing in the background during this shift" accessibilityState={{ checked: background, disabled: busy }} disabled={busy} onPress={() => setBackground(value => !value)}
              style={{ minHeight: 48, padding: 12, borderWidth: 1, borderColor: palette.border, borderRadius: 12 }}>
              <Text style={{ color: palette.text, lineHeight: 22 }}>{background ? '☑' : '☐'} Also share while the app is in the background or the phone is locked. This requests background/Always permission.</Text>
            </Pressable>
            <GlassButton title={onDuty ? 'Resume location sharing' : 'Start shift'} busy={busy} disabled={busy || accessStatus !== 'ready' || check.status === 'checking'} onPress={() => operate('start')} />
          </>}
          {!!state.message && <Text style={{ color: palette.secondary, fontSize: 13, lineHeight: 21 }}>{state.message}</Text>}
          <GlassButton secondary title="Refresh shift status" disabled={busy || accessStatus !== 'ready' || check.status === 'checking'} onPress={() => { setError(''); void readStatus(); }} />
        </ScrollView>
      </GlassCard>
    </View>
  </View> : null;
  return typeof children === 'function' ? children({ button, dialog }) : <>{button}{dialog}</>;
}
