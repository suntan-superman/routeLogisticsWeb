import React, { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Linking } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useMyDailyRoute, useWorkJobs } from '../services/useWorkQueries';
import { ScreenHeader, SectionHeader, Card, EmptyState, InlineNotice, LoadingState, PrimaryButton, SecondaryButton } from '../components/MobileUI';
import { dayLabel, jobDestination, navigationUrl, sortJobs } from '../services/workPresentation';
export default function RouteScreen({ user, active, onOpenJob }) {
  const { palette } = useTheme(), savedRoute = useMyDailyRoute({ enabled: active && !!user?.companyId });
  const personal = useWorkJobs('day', { enabled: active && !user?.companyId });
  const route = user?.companyId ? savedRoute : { ...personal, stops: sortJobs(personal.jobs).filter(job => !['completed','cancelled','canceled'].includes(job.status)) };
  const [error, setError] = useState('');
  const navigate = async stop => { try { setError(''); await Linking.openURL(navigationUrl(stop)); } catch { setError('Could not open navigation. Check that a maps application or browser is available.'); } };
  return <View style={{ flex: 1 }}><ScreenHeader title="My route" subtitle={[user?.companyName || user?.businessName, dayLabel(new Date().toLocaleDateString('en-CA'))].filter(Boolean).join(' · ')} />
    <ScrollView testID="route-scroll" refreshControl={<RefreshControl refreshing={route.isFetching && !route.isLoading} onRefresh={() => route.refetch()} tintColor={palette.accent} />}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      <InlineNotice message="Follow your assigned stop order and open directions in your maps app. An in-app route map is not available." />
      {!!(route.error || error) && <InlineNotice tone="error" message={route.error?.message || error} />}
      {(route.isLoading || route.accessStatus === 'checking') && <LoadingState message="Loading assigned stops…" />}
      {route.canReadWork === false && route.accessStatus !== 'checking' && !route.error && <InlineNotice tone="error" message={route.accessError?.message || route.accessError || 'Your route could not be checked. Reconnect or pull down to retry.'} />}
      {route.data?.truncated && <InlineNotice message="Showing the first 100 eligible assigned stops." />}
      {route.stops.map((stop,index) => <Card key={stop.id}><SectionHeader title={`${index + 1}. ${stop.customerName || 'Assigned stop'}`} subtitle={[stop.time, stop.serviceType].filter(Boolean).join(' · ')} />
        <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 22 }}>{stop.address || 'Address not provided'}</Text>
        <View style={{ gap: 10 }}>{!!jobDestination(stop) && <PrimaryButton title={`Navigate to stop ${index + 1}`} icon="navigate-outline" onPress={() => navigate(stop)} />}
          <SecondaryButton title="Open work order" accessibilityLabel={`Open work order for stop ${index + 1}`} onPress={() => onOpenJob({ id: stop.id })} /></View>
      </Card>)}
      {!route.isLoading && route.canReadWork !== false && !route.error && !route.stops.length && <EmptyState title="No remaining stops" message="Today’s eligible assigned visits appear here. Completed and cancelled jobs remain in Schedule." />}
    </ScrollView>
  </View>;
}
