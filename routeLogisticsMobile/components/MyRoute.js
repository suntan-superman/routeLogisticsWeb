import React, { useState } from 'react';
import { View, Text, Button, Linking } from 'react-native';
import { useMyDailyRoute } from '../services/useWorkQueries';
import { GlassCard } from './Glass';
import { useTheme } from '../theme/ThemeProvider';

export default function MyRoute() {
  const { palette } = useTheme();
  const route = useMyDailyRoute(), stops = route.stops;
  const [navigationError, setNavigationError] = useState('');
  const error = route.error?.message || navigationError || (route.data?.truncated ? 'Showing the first 100 eligible stops.' : '');
  return <GlassCard contentStyle={{ padding: 16, gap: 10 }}><Text style={{ color: palette.text, fontSize: 18, fontWeight: '700' }}>My daily route</Text><Button title="Refresh route" disabled={route.isFetching} onPress={() => { setNavigationError(''); route.refetch(); }} />
    {!!error && <Text style={{ color: palette.secondary }}>{error}</Text>}{route.isLoading && <Text style={{ color: palette.secondary }}>Loading your route…</Text>}{!route.isLoading && !error && !stops.length && <Text style={{ color: palette.secondary }}>No remaining assigned stops today.</Text>}
    {stops.map((stop, index) => <View key={stop.id}><Text style={{ color: palette.text }}>{index + 1}. {stop.customerName} · {stop.time} · {stop.serviceType}</Text><Text style={{ color: palette.secondary }}>{stop.address}</Text>{!!(stop.address || stop.location) && <Button title={`Navigate to stop ${index + 1}`} onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.location ? `${stop.location.lat},${stop.location.lng}` : stop.address)}&travelmode=driving`).catch(e => setNavigationError(e.message))} />}</View>)}
  </GlassCard>;
}
