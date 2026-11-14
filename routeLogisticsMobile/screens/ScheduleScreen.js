import React from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader, SectionHeader, JobCard, EmptyState, InlineNotice, LoadingState } from '../components/MobileUI';
import { groupJobs, dayLabel } from '../services/workPresentation';
export default function ScheduleScreen({ user, query, period, onPeriodChange, onOpenJob }) {
  const { palette } = useTheme();
  return <View style={{ flex: 1 }}><ScreenHeader title="Schedule" subtitle={user.companyName || 'Your scheduled work'} />
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 16 }}>
      {[['day','Day'],['week','Week'],['month','Month']].map(([value,label]) => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={`${label} schedule`} accessibilityState={{ selected: period === value }} onPress={() => onPeriodChange(value)}
        style={{ flex: 1, minHeight: 48, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: period === value ? palette.accent : palette.border, backgroundColor: period === value ? palette.glow : palette.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: period === value ? palette.accent : palette.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
      </Pressable>)}
    </View>
    <ScrollView testID="schedule-scroll" refreshControl={<RefreshControl refreshing={query.isFetching && !query.isLoading} onRefresh={query.refreshWork} tintColor={palette.accent} />}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      {!!query.error && <InlineNotice tone="error" message={query.error.message || 'Could not load the schedule. Pull down to retry.'} />}
      {(query.isLoading || query.accessStatus === 'checking') && <LoadingState message="Loading your schedule…" />}
      {query.canReadWork === false && query.accessStatus !== 'checking' && !query.error && <InlineNotice tone="error" message={query.accessError?.message || query.accessError || 'Your schedule could not be checked. Reconnect or pull down to retry.'} />}
      {groupJobs(query.jobs).map(group => <View key={group.date} style={{ gap: 12 }}><SectionHeader title={dayLabel(group.date)} subtitle={`${group.jobs.length} ${group.jobs.length === 1 ? 'visit' : 'visits'}`} />
        {group.jobs.map(job => <JobCard key={job.id} job={job} onPress={() => onOpenJob(job)} />)}
      </View>)}
      {!query.isLoading && query.canReadWork !== false && !query.error && !query.jobs.length && <EmptyState title="No work scheduled" message={user.role === 'technician' ? 'Your assigned visits for this period will appear here.' : 'Jobs for this period will appear here. Schedule new visits from Home.'} />}
    </ScrollView>
  </View>;
}
