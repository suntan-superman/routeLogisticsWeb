import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, Linking } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader, SectionHeader, JobCard, EmptyState, InlineNotice, LoadingState, PrimaryButton, SecondaryButton } from '../components/MobileUI';
import { nextJob, sortJobs, dayLabel, formatAppointment, jobDestination, navigationUrl } from '../services/workPresentation';
import { tokensForDensity } from '../theme/designTokens';
export default function TechnicianHomeScreen({ user, query, onOpenJob, onSchedule, headerAction, children }) {
  const { palette, tokens: suppliedTokens } = useTheme(), [navigationError, setNavigationError] = useState('');
  const tokens = suppliedTokens || tokensForDensity();
  const jobs = sortJobs(query.jobs), next = nextJob(jobs), completed = jobs.filter(job => job.status === 'completed').length;
  const readable = query.canReadWork !== false && !query.resourceDenied;
  const remaining = jobs.filter(job => !['completed','cancelled','canceled'].includes(job.status));
  const appointmentZone = user.companyTimeZone || user.timeZone || 'America/Los_Angeles';
  const appointment = job => formatAppointment(job, appointmentZone);
  const openNavigation = async job => { try { setNavigationError(''); await Linking.openURL(navigationUrl(job)); } catch { setNavigationError('Could not open navigation. Check that a maps application or browser is available.'); } };
  return <View style={{ flex: 1 }}>
    <ScreenHeader title={`Hello, ${user.name?.trim().split(/\s+/)[0] || 'there'}`} subtitle={user.companyName || user.businessName || 'Your workspace'}>{headerAction}</ScreenHeader>
    <ScrollView testID="technician-home-scroll" refreshControl={<RefreshControl refreshing={query.isFetching && !query.isLoading} onRefresh={query.refreshWork} tintColor={palette.accent} />}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: tokens.spacing.section, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      <Text style={{ color: palette.secondary, ...tokens.type.body }}>{dayLabel(query.startDate)} · My Work</Text>
      {!!query.error && <InlineNotice tone="error" message={query.error.message || 'Your work could not be refreshed. Pull down to try again.'} />}
      {(!readable && query.accessStatus === 'checking') || query.isLoading ? <LoadingState message="Checking your assigned work…" /> : null}
      {!readable && query.accessStatus !== 'checking' && !query.error && <InlineNotice tone="error" message={query.accessError?.message || query.accessError || 'Your work could not be checked. Reconnect or pull down to retry.'} />}
      {readable && <>
      {next ? <View style={{ gap: 10 }}><JobCard job={next} featured appointmentLabel={appointment(next)} onPress={() => onOpenJob(next)} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><PrimaryButton title="Open work order" onPress={() => onOpenJob(next)} style={{ flexGrow: 1 }} />
          {!!jobDestination(next) && <SecondaryButton title="Navigate" icon="navigate-outline" onPress={() => openNavigation(next)} style={{ flexGrow: 1 }} />}</View>
      </View> : !query.isLoading && !query.error && <EmptyState title={completed ? 'Today’s work is complete' : 'Ready for your next assignment'} message={completed ? 'Your completed visits remain in Schedule.' : 'Assigned work appears here automatically. Your manager assigns and schedules jobs.'} />}
      {!!navigationError && <InlineNotice tone="error" message={navigationError} />}
      <View testID="home-daily-summary" accessible accessibilityLabel={`${jobs.length} assigned today, ${remaining.length} remaining, ${completed} completed`} style={{ flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: palette.border, borderRadius: 16, backgroundColor: palette.surface }}>
        {[[jobs.length, 'Assigned'], [remaining.length, 'Remaining'], [completed, 'Completed']].map(([value, label], index) => <React.Fragment key={label}>
          {index > 0 && <View accessible={false} style={{ width: 1, alignSelf: 'stretch', marginVertical: 4, backgroundColor: palette.border }} />}
          <View style={{ flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ color: palette.text, ...tokens.type.section }}>{value}</Text><Text style={{ color: palette.secondary, ...tokens.type.support, textAlign: 'center' }}>{label}</Text></View>
        </React.Fragment>)}
      </View>
      <SectionHeader title="Today’s schedule" action={<Pressable testID="home-view-all" accessibilityRole="button" accessibilityLabel="View all scheduled work" onPress={onSchedule} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}><Text style={{ color: palette.accent, ...tokens.type.button }}>View all ›</Text></Pressable>} />
      {jobs.filter(job => job.id !== next?.id).slice(0, 4).map(job => <JobCard key={job.id} job={job} compact appointmentLabel={appointment(job)} onPress={() => onOpenJob(job)} />)}
      {!jobs.length && !query.isLoading && !query.error && <Text style={{ color: palette.secondary, lineHeight: 22 }}>No visits assigned for today.</Text>}
      </>}
      {children}
    </ScrollView>
  </View>;
}
