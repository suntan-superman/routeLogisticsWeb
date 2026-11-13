import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Button, Alert, AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { queuedWork, subscribeOffline, flushOffline, resolveOffline } from '../services/offline';
export default function OfflineStatus({ onSynced }) {
  const [rows, setRows] = useState([]), [offline, setOffline] = useState(false);
  const onChanged = useRef(onSynced);
  onChanged.current = onSynced;
  useEffect(() => {
    let mounted = true, signature = '';
    const refresh = async () => { try { const data = await queuedWork(); if (!mounted) return; setRows(data); const current = data.filter((row) => ['synced', 'discarded'].includes(row.state)).map((row) => `${row.id}:${row.state}`).join(); if (signature !== current) { signature = current; onChanged.current?.(); } } catch { /* Signed out. */ } };
    const tick = () => { if (AppState.currentState === 'active') void flushOffline().catch(() => {}); };
    const unsubscribe = subscribeOffline(refresh), network = NetInfo.addEventListener((state) => { if (mounted) setOffline(state.isConnected === false || state.isInternetReachable === false); tick(); });
    const app = AppState.addEventListener('change', (state) => { if (state === 'active') tick(); });
    const timer = setInterval(tick, 15000); refresh(); tick();
    return () => { mounted = false; unsubscribe(); network(); app.remove(); clearInterval(timer); };
  }, []);
  const pending = rows.filter((row) => !['synced', 'discarded'].includes(row.state));
  return <View style={{ padding: 12, backgroundColor: offline || pending.length ? '#fff7ed' : '#f0fdf4', marginBottom: 12 }}>
    <Text accessibilityRole="status">{offline ? 'Offline — saved work stays on this device' : 'Online'} · {pending.length} awaiting sync · {rows.filter((row) => row.state === 'synced').length} synced</Text>
    {pending.map((row) => <View key={row.id} style={{ marginTop: 8 }}><Text>{row.kind === 'photo' ? 'Photo' : 'Job update'} · {row.state}</Text>{!!row.error && <Text>{row.error}</Text>}{row.state === 'conflict' && <Text>Online: {JSON.stringify(row.server)}{ '\n' }Your changes: {JSON.stringify(row.patch)}</Text>}{['failed', 'conflict'].includes(row.state) && <><Button title={row.state === 'conflict' ? 'Apply my changes after review' : 'Retry'} onPress={() => Alert.alert('Retry saved changes?', 'Changes will be checked against the latest job again before saving.', [{ text: 'Cancel' }, { text: 'Retry', onPress: () => resolveOffline(row.id, 'retry') }])} /><Button title="Discard this local change" color="#b91c1c" onPress={() => Alert.alert('Discard local change?', 'This removes the pending change from the sync queue. Other saved work is kept.', [{ text: 'Cancel' }, { text: 'Discard', style: 'destructive', onPress: () => resolveOffline(row.id, 'discard') }])} /></>}</View>)}
  </View>;
}
