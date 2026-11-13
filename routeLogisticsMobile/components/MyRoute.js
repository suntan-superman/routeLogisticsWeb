import React, { useEffect, useState } from 'react';
import { View, Text, Button, Linking } from 'react-native';
import { getClaims, localDate } from '../services/tenancy';
import { callWorkspace } from '../services/workspaceApi';
import { cachedRead } from '../services/offline';
import { GlassCard } from './Glass';
import { useTheme } from '../theme/ThemeProvider';

export default function MyRoute() {
  const { palette } = useTheme();
  const [stops, setStops] = useState([]), [error, setError] = useState('');
  const load = async () => {
    try {
      const memberId = getClaims()?.membershipId, date = localDate();
      const data = await cachedRead(`route:${date}:${memberId}`, () => callWorkspace('rlGetDailyRoute', { memberId, date }));
      const order = data.saved?.jobIds || [];
      setStops([...data.stops].sort((a, b) => (order.includes(a.id) ? order.indexOf(a.id) : 1000) - (order.includes(b.id) ? order.indexOf(b.id) : 1000))); setError(data.truncated ? 'Showing the first 100 eligible stops.' : '');
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);
  return <GlassCard contentStyle={{ padding: 16, gap: 10 }}><Text style={{ color: palette.text, fontSize: 18, fontWeight: '700' }}>My daily route</Text><Button title="Refresh route" onPress={load} />
    {!!error && <Text style={{ color: palette.secondary }}>{error}</Text>}{!stops.length && <Text style={{ color: palette.secondary }}>No remaining assigned stops today.</Text>}
    {stops.map((stop, index) => <View key={stop.id}><Text style={{ color: palette.text }}>{index + 1}. {stop.customerName} · {stop.time} · {stop.serviceType}</Text><Text style={{ color: palette.secondary }}>{stop.address}</Text>{!!(stop.address || stop.location) && <Button title={`Navigate to stop ${index + 1}`} onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.location ? `${stop.location.lat},${stop.location.lng}` : stop.address)}&travelmode=driving`).catch(e => setError(e.message))} />}</View>)}
  </GlassCard>;
}
