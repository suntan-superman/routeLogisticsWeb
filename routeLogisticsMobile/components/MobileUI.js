import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { GlassCard, GlassButton, GlassInput, IconButton } from './Glass';

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 28 };
export const PrimaryButton = props => <GlassButton {...props} />;
export const SecondaryButton = props => <GlassButton secondary {...props} />;
export const FormField = props => <GlassInput {...props} />;
export const Card = props => <GlassCard {...props} />;

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

export function JobCard({ job, onPress, featured = false, compact = false }) {
  const { palette } = useTheme();
  const title = job.customerName || 'Assigned customer';
  const address = [job.address, job.city, job.state, job.zipCode].filter(value => typeof value === 'string' && value.trim()).join(', ');
  const appointment = [job.date, job.time || 'Time not set'].filter(Boolean).join(' · ');
  return <Pressable testID={`job-card-${job.id}`} accessibilityRole="button" accessibilityLabel={`Open job for ${title}, ${job.serviceType || 'Service'}, ${appointment}, ${statusLabels[job.status] || job.status || 'Status not set'}`}
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
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><StatusBadge status={job.status} />{!!job.syncState && <StatusBadge syncState={job.syncState} />}</View>
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
