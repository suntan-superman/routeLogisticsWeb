import React, { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Linking } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader, SectionHeader, JobCard, Card, EmptyState, InlineNotice, LoadingState, PrimaryButton, SecondaryButton } from '../components/MobileUI';
import { nextJob, sortJobs, dayLabel, jobDestination, navigationUrl } from '../services/workPresentation';
export default function TechnicianHomeScreen({ user, query, onOpenJob, onSchedule, children }) {
  const { palette } = useTheme(), [navigationError, setNavigationError] = useState('');
  const jobs = sortJobs(query.jobs), next = nextJob(jobs), completed = jobs.filter(job => job.status === 'completed').length;
  const readable = query.canReadWork !== false && !query.resourceDenied;
  const remaining = jobs.filter(job => !['completed','cancelled','canceled'].includes(job.status));
  const openNavigation = async job => { try { setNavigationError(''); await Linking.openURL(navigationUrl(job)); } catch { setNavigationError('Could not open navigation. Check that a maps application or browser is available.'); } };
  return <View style={{ flex: 1 }}>
    <ScreenHeader title={`Hello, ${user.name?.trim().split(/\s+/)[0] || 'there'}`} subtitle={user.companyName || user.businessName || 'Your workspace'} />
    <ScrollView testID="technician-home-scroll" refreshControl={<RefreshControl refreshing={query.isFetching && !query.isLoading} onRefresh={query.refreshWork} tintColor={palette.accent} />}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 20, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 21 }}>{dayLabel(new Date().toLocaleDateString('en-CA'))} · My Work</Text>
      {!!query.error && <InlineNotice tone="error" message={query.error.message || 'Your work could not be refreshed. Pull down to try again.'} />}
      {(!readable && query.accessStatus === 'checking') || query.isLoading ? <LoadingState message="Checking your assigned work…" /> : null}
      {!readable && query.accessStatus !== 'checking' && !query.error && <InlineNotice tone="error" message={query.accessError?.message || query.accessError || 'Your work could not be checked. Reconnect or pull down to retry.'} />}
      {readable && <>
      {next ? <View style={{ gap: 12 }}><JobCard job={next} featured onPress={() => onOpenJob(next)} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}><PrimaryButton title="Open work order" onPress={() => onOpenJob(next)} style={{ flexGrow: 1 }} />
          {!!jobDestination(next) && <SecondaryButton title="Navigate" icon="navigate-outline" onPress={() => openNavigation(next)} style={{ flexGrow: 1 }} />}</View>
      </View> : !query.isLoading && !query.error && <EmptyState title={completed ? 'Today’s work is complete' : 'Ready for your next assignment'} message={completed ? 'Your completed visits remain in Schedule.' : 'Assigned work appears here automatically. Your manager assigns and schedules jobs.'} />}
      {!!navigationError && <InlineNotice tone="error" message={navigationError} />}
      <Card><View style={{ flexDirection: 'row', gap: 16 }}>{[[jobs.length, 'Assigned today'], [remaining.length, 'Remaining'], [completed, 'Completed']].map(([value,label]) => <View key={label} style={{ flex: 1, gap: 5 }}><Text style={{ color: palette.text, fontSize: 25, fontWeight: '700' }}>{value}</Text><Text style={{ color: palette.secondary, fontSize: 12, lineHeight: 19 }}>{label}</Text></View>)}</View></Card>
      <SectionHeader title="Today’s schedule" subtitle="Your assigned visits, in appointment order." action={<SecondaryButton title="View all" onPress={onSchedule} />} />
      {jobs.filter(job => job.id !== next?.id).slice(0, 4).map(job => <JobCard key={job.id} job={job} compact onPress={() => onOpenJob(job)} />)}
      {!jobs.length && !query.isLoading && !query.error && <Text style={{ color: palette.secondary, lineHeight: 22 }}>No visits assigned for today.</Text>}
      {jobs.length > 5 && <SecondaryButton title={`View all ${jobs.length} jobs`} onPress={onSchedule} />}
      </>}
      {children}
    </ScrollView>
  </View>;
}
