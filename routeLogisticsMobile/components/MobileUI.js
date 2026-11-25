import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView, BackHandler, Keyboard, Platform, AccessibilityInfo, findNodeHandle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { GlassCard, GlassButton, GlassInput, IconButton } from './Glass';
import { isEstimateVisit, estimateOutcomeLabel } from '../services/estimateVisitPolicy';
import { KeyboardScrollContext } from './KeyboardScrollContext';

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 28 };
export const PrimaryButton = props => <GlassButton {...props} />;
export const SecondaryButton = props => <GlassButton secondary {...props} />;
export const FormField = props => <GlassInput {...props} />;
export const Card = props => <GlassCard {...props} />;

export function KeyboardAwareScrollView({ children, contentContainerStyle, style, scrollRef, keyboardBottomPadding, ...props }) {
  const { onLayout, onScroll, onContentSizeChange, ...scrollProps } = props;
  const insets = useSafeAreaInsets(), ownRef = useRef(null), activeRef = scrollRef || ownRef;
  const focused = useRef(null), keyboardFrame = useRef(null), scrollY = useRef(0), frames = useRef([]), [keyboardInset, setKeyboardInset] = useState(0);
  const clearFrames = useCallback(() => {
    const cancel = globalThis.cancelAnimationFrame || clearTimeout;
    frames.current.forEach(cancel); frames.current = [];
  }, []);
  const schedule = useCallback(callback => {
    const frame = globalThis.requestAnimationFrame || (next => setTimeout(next, 0));
    clearFrames();
    const first = frame(() => {
      const second = frame(callback);
      frames.current = [second];
    });
    frames.current = [first];
  }, [clearFrames]);
  const measureViewport = useCallback(frame => {
    const viewport = activeRef.current;
    if (!viewport?.measureInWindow) return;
    viewport.measureInWindow((_x, y, _width, height) => {
      const keyboardTop = Number(frame?.screenY);
      const overlap = Number.isFinite(keyboardTop) && keyboardTop > 0 ? Math.max(0, y + height - keyboardTop) : 0;
      setKeyboardInset(previous => previous === overlap ? previous : overlap);
    });
  }, [activeRef]);
  const revealFocused = useCallback(() => {
    const input = focused.current, viewport = activeRef.current;
    if (!input?.measureInWindow || !viewport?.measureInWindow) return;
    input.measureInWindow((_inputX, inputY, _inputWidth, inputHeight) => {
      viewport.measureInWindow((_viewX, viewY, _viewWidth, viewHeight) => {
        const frameTop = Number(keyboardFrame.current?.screenY);
        const viewBottom = viewY + viewHeight;
        const visibleBottom = Math.min(viewBottom, Number.isFinite(frameTop) && frameTop > 0 ? frameTop : viewBottom) - Math.max(0, insets.bottom) - SPACING.lg;
        const visibleTop = Math.max(viewY, insets.top) + SPACING.lg;
        const inputBottom = inputY + inputHeight;
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        let delta = 0;
        if (inputHeight > visibleHeight || inputY < visibleTop) delta = inputY - visibleTop;
        else if (inputBottom > visibleBottom) delta = inputBottom - visibleBottom;
        if (Math.abs(delta) < 1) return;
        const target = Math.max(0, scrollY.current + delta);
        scrollY.current = target;
        viewport.scrollTo?.({ y: target, animated: true });
      });
    });
  }, [activeRef, insets.bottom, insets.top]);
  const scheduleReveal = useCallback(() => schedule(() => {
    measureViewport(keyboardFrame.current);
    revealFocused();
  }), [measureViewport, revealFocused, schedule]);
  useEffect(() => {
    const update = event => {
      keyboardFrame.current = event?.endCoordinates || null;
      scheduleReveal();
    };
    const show = Keyboard?.addListener?.(Platform?.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', update);
    const change = Keyboard?.addListener?.(Platform?.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidChangeFrame', update);
    const hide = Keyboard?.addListener?.(Platform?.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      clearFrames(); keyboardFrame.current = null; setKeyboardInset(0);
    });
    return () => { clearFrames(); show?.remove?.(); change?.remove?.(); hide?.remove?.(); };
  }, [clearFrames, scheduleReveal]);
  const reveal = useCallback(node => {
    focused.current = node;
    if (node) scheduleReveal();
  }, [scheduleReveal]);
  // Android adjustResize and iOS ScrollView keyboard insets each resize the
  // viewport once. The measured reveal then handles the focused field; wrapping
  // this ScrollView in KeyboardAvoidingView would apply a second iOS offset.
  const bottomPadding = (keyboardBottomPadding ?? SPACING.xxl) + keyboardInset + Math.max(0, insets.bottom);
  const contentStyle = Array.isArray(contentContainerStyle)
    ? [...contentContainerStyle, { paddingBottom: bottomPadding }]
    : [contentContainerStyle, { paddingBottom: bottomPadding }];
  const handleLayout = event => { onLayout?.(event); if (keyboardFrame.current) scheduleReveal(); };
  const handleScroll = event => { scrollY.current = event?.nativeEvent?.contentOffset?.y || 0; onScroll?.(event); };
  const handleContentSizeChange = (width, height) => { onContentSizeChange?.(width, height); if (focused.current && keyboardFrame.current) scheduleReveal(); };
  const scroll = <KeyboardScrollContext.Provider value={reveal}><ScrollView ref={activeRef} style={[{ flex: 1 }, style]} contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled"
    keyboardDismissMode={Platform?.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={Platform?.OS === 'ios'} scrollEventThrottle={16}
    onLayout={handleLayout} onScroll={handleScroll} onContentSizeChange={handleContentSizeChange} {...scrollProps}>{children}</ScrollView></KeyboardScrollContext.Provider>;
  return scroll;
}

export function ScreenHeader({ title, subtitle, onBack, children }) {
  const { palette } = useTheme();
  return <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, gap: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {onBack && <IconButton icon="arrow-back-outline" label={`Back from ${title}`} onPress={onBack} />}
      <View style={{ flex: 1, gap: 4 }}>
        <Text accessibilityRole="header" style={{ color: palette.text, fontSize: 26, lineHeight: 33, fontWeight: '700', letterSpacing: -0.5 }}>{title}</Text>
        {!!subtitle && <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 21 }}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  </View>;
}

export function SectionHeader({ title, subtitle, action }) {
  const { palette } = useTheme();
  return <View style={{ gap: 5 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    <Text accessibilityRole="header" style={{ flex: 1, color: palette.text, fontSize: 18, lineHeight: 25, fontWeight: '700' }}>{title}</Text>{action}
  </View>{!!subtitle && <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 21 }}>{subtitle}</Text>}</View>;
}

const statusLabels = { scheduled: 'Scheduled', 'en-route': 'En route', 'in-progress': 'In progress', completed: 'Completed', cancelled: 'Cancelled', canceled: 'Cancelled' };
const syncLabels = { pending: 'Pending sync', syncing: 'Syncing', failed: 'Sync failed', conflict: 'Needs review', synced: 'Synced' };
export function StatusBadge({ status, syncState }) {
  const { palette, isDark } = useTheme();
  const label = syncState ? syncLabels[syncState] || syncState : statusLabels[status] || status || 'Status not set';
  const warning = syncState === 'failed' || syncState === 'conflict';
  const dot = warning ? palette.danger : ({ scheduled: isDark ? '#9FC5FF' : '#245A9F', 'en-route': isDark ? '#D3B9FF' : '#7351A8', 'in-progress': isDark ? '#F5CE89' : '#946315', completed: palette.accent, cancelled: palette.secondary, canceled: palette.secondary }[status] || palette.accent);
  return <View accessibilityRole="text" accessibilityLabel={label} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: palette.input }}>
    <View accessible={false} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
    <Text style={{ color: warning ? palette.danger : palette.text, fontWeight: '600', fontSize: 12, lineHeight: 18 }}>{label}</Text>
  </View>;
}

export function AppointmentBadge({ job }) {
  const { palette } = useTheme();
  if (!isEstimateVisit(job)) return null;
  return <View accessibilityRole="text" accessibilityLabel="Estimate Visit" style={{ alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: palette.glow, borderWidth: 1, borderColor: palette.accent }}><Text style={{ color: palette.text, fontWeight: '700', fontSize: 12, lineHeight: 18 }}>Estimate Visit</Text></View>;
}

export function JobCard({ job, onPress, featured = false, compact = false }) {
  const { palette } = useTheme();
  const title = job.customerName || 'Assigned customer';
  const address = typeof job.serviceProperty?.address === 'string' && job.serviceProperty.address.trim() ? job.serviceProperty.address : [job.address, job.city, job.state, job.zipCode].filter(value => typeof value === 'string' && value.trim()).join(', ');
  const appointment = [job.date, job.time || 'Time not set'].filter(Boolean).join(' · ');
  const importantAlerts = (job.operationalAlerts || []).filter(alert => alert.active && ['important', 'critical'].includes(alert.severity));
  const criticalCount = importantAlerts.filter(alert => alert.severity === 'critical').length;
  return <Pressable testID={`job-card-${job.id}`} accessibilityRole="button" accessibilityLabel={`Open job for ${title}, ${job.serviceType || 'Service'}, ${appointment}, ${statusLabels[job.status] || job.status || 'Status not set'}${isEstimateVisit(job) ? ', Estimate Visit, ' + estimateOutcomeLabel(job) : ''}`}
    accessibilityHint="Opens the work order and job actions" onPress={onPress}
    style={({ pressed }) => ({ minHeight: 100, padding: featured ? 20 : 16, gap: 12, borderRadius: 20, borderWidth: 1, borderColor: featured ? palette.accent : palette.border, backgroundColor: palette.surface, opacity: pressed ? 0.86 : 1 })}>
    {featured && <Text style={{ color: palette.accent, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>{job.status === 'in-progress' ? 'Active work order' : job.status === 'en-route' ? 'On your way' : 'Next work order'}</Text>}
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}><Text style={{ color: palette.text, fontSize: featured ? 23 : 18, lineHeight: featured ? 30 : 25, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 21 }}>{job.serviceType || 'Service visit'}</Text></View>
      <Ionicons accessible={false} name="chevron-forward" size={20} color={palette.secondary} />
    </View>
    <Text style={{ color: palette.text, fontSize: 14, lineHeight: 21, fontWeight: '600' }}>{appointment}</Text>
    {!compact && !!address && <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 21 }}>{address}</Text>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><AppointmentBadge job={job} /><StatusBadge status={job.localCompletionPending ? job.serverStatus || job.status : job.status} />{!!job.syncState && <StatusBadge syncState={job.syncState} />}</View>
    {!!importantAlerts.length && <Text accessibilityRole="text" style={{ color: criticalCount ? palette.danger : palette.secondary, fontSize: 13, fontWeight: '700' }}>{criticalCount ? `⚠ ${criticalCount} critical alert${criticalCount === 1 ? '' : 's'}` : `${importantAlerts.length} important alert${importantAlerts.length === 1 ? '' : 's'}`} · Open job to review</Text>}
    {job.localCompletionPending && <Text accessibilityLiveRegion="polite" style={{ color: palette.secondary, fontSize: 13, lineHeight: 20 }}>Completion saved on this device — the server has not confirmed the completed status yet.</Text>}
    {isEstimateVisit(job) && <Text style={{ color: palette.secondary, fontSize: 13, lineHeight: 20 }}>{estimateOutcomeLabel(job)}</Text>}
    {!!job.syncError && <Text accessibilityRole="alert" style={{ color: palette.danger, fontSize: 13, lineHeight: 20 }}>{job.syncError}</Text>}
  </Pressable>;
}

export function InlineNotice({ tone = 'info', message, children }) {
  const { palette } = useTheme();
  const color = tone === 'error' ? palette.danger : tone === 'success' ? palette.accent : palette.secondary;
  return <View style={{ borderLeftWidth: 3, borderColor: color, backgroundColor: palette.input, padding: 14, borderRadius: 12, gap: 8 }}>
    {!!message && <Text accessibilityRole={tone === 'error' ? 'alert' : 'text'} accessibilityLiveRegion="polite" style={{ color, fontSize: 14, lineHeight: 22 }}>{message}</Text>}{children}
  </View>;
}

export function EmptyState({ title, message, action }) {
  const { palette } = useTheme();
  return <Card><View style={{ gap: 8, paddingVertical: 12 }}><Text style={{ color: palette.text, fontSize: 18, lineHeight: 25, fontWeight: '700' }}>{title}</Text>
    {!!message && <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 22 }}>{message}</Text>}{action}</View></Card>;
}
export function LoadingState({ message = 'Loading your work…' }) {
  const { palette } = useTheme();
  return <View accessibilityLiveRegion="polite" style={{ padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 }}><ActivityIndicator color={palette.accent} /><Text style={{ flex: 1, color: palette.secondary, fontSize: 14, lineHeight: 22 }}>{message}</Text></View>;
}
export function ConfirmationPanel({ title, message, children }) {
  return <Card><SectionHeader title={title} />{!!message && <InlineNotice message={message} />}{children}</Card>;
}

// Mount after a screen's ScrollView so feedback stays in the viewport. This is
// a JS overlay, avoiding native Modal/picker presentation conflicts on iOS.
export function ActionDialog({ title, message, tone = 'info', busy = false, onClose, children, testID = 'action-dialog' }) {
  const { palette } = useTheme(), heading = useRef(null), current = useRef({ busy, onClose });
  current.current = { busy, onClose };
  const close = () => { if (!current.current.busy) current.current.onClose?.(); };
  useEffect(() => {
    const listener = BackHandler?.addEventListener?.('hardwareBackPress', () => { if (!current.current.busy) current.current.onClose?.(); return true; });
    return () => listener?.remove?.();
  }, []);
  useEffect(() => {
    Keyboard?.dismiss?.();
    const handle = heading.current && findNodeHandle?.(heading.current);
    if (handle != null) AccessibilityInfo?.setAccessibilityFocus?.(handle);
    AccessibilityInfo?.announceForAccessibility?.([title, message].filter(Boolean).join('. '));
  }, [title, message]);
  return <View testID={testID} accessibilityViewIsModal importantForAccessibility="yes" onAccessibilityEscape={close}
    style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 100, elevation: 30, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
    <Pressable testID={`${testID}-backdrop`} accessible={false} disabled={busy} onPress={close} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} />
    <View style={{ width: '100%', maxWidth: 520, maxHeight: '90%', borderRadius: 20, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, overflow: 'hidden' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text ref={heading} accessibilityRole="header" style={{ flex: 1, color: palette.text, fontSize: 20, fontWeight: '700', lineHeight: 27 }}>{title}</Text>
        {!!onClose && <GlassButton secondary title="Close" accessibilityLabel="Close dialog" disabled={busy} onPress={close} />}
      </View>
      <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
        {!!message && <Text accessibilityRole={tone === 'error' ? 'alert' : 'text'} accessibilityLiveRegion="polite" style={{ color: tone === 'error' ? palette.danger : tone === 'success' ? palette.accent : palette.secondary, fontSize: 15, lineHeight: 23 }}>{message}</Text>}
        {busy && <ActivityIndicator accessibilityLabel="Saving changes" color={palette.accent} />}
        {children}
      </KeyboardAwareScrollView>
    </View>
  </View>;
}
