import React, { useEffect, useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { GlassCard, GlassButton } from './Glass';
import { enableNativePush, saveNativePushPreferences, subscribeNativePush, nativePushSnapshot, refreshNativePush, retryNativePushOpen } from '../services/nativePush';
export default function NativePushSettings() {
  const { palette } = useTheme(), [state, setState] = useState(nativePushSnapshot), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => subscribeNativePush(setState), []);
  const action = async work => { if (busy) return; setBusy(true); setError(''); try { await work(); } catch (failure) { setError(failure.message || 'Notification settings could not be updated.'); } finally { setBusy(false); } };
  return <GlassCard><Text style={{ color: palette.text, fontSize: 17, fontWeight: '700' }}>Native work notifications</Text><Text style={{ color: palette.secondary, lineHeight: 21 }}>Assignments, schedule changes and important job updates. A notification opens work only after your current company access and assignment are checked.</Text>
    {!!state.message && <Text style={{ color: palette.secondary, lineHeight: 21 }}>{state.message}</Text>}
    {!!(error || state.error) && <Text accessibilityRole="alert" style={{ color: palette.danger, lineHeight: 21 }}>{error || state.error}</Text>}
    <GlassButton title={state.registered ? 'Turn off native notifications' : 'Enable native notifications'} disabled={busy || state.busy || (!state.available && !state.registered)} onPress={() => action(() => state.registered ? saveNativePushPreferences({ enabled: false }) : enableNativePush())} />
    {state.registered && [['assignments', 'Job assignments'], ['schedule', 'Schedule changes'], ['status', 'Important job status']].map(([name, label]) => <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ color: palette.text, flex: 1 }}>{label}</Text><Switch accessibilityLabel={label} value={!!state.preferences[name]} disabled={busy} onValueChange={value => action(() => saveNativePushPreferences({ [name]: value }))} trackColor={{ false: palette.border, true: palette.button }} thumbColor="#FFFFFF" /></View>)}
    {state.permission === 'denied' && <GlassButton secondary title="Open notification settings" onPress={() => Linking.openSettings()} />}
    <GlassButton secondary title="Refresh notification status" disabled={busy} onPress={() => action(() => refreshNativePush())} />
    {!!state.error && <GlassButton secondary title="Retry notification work order" disabled={busy} onPress={() => action(retryNativePushOpen)} />}
  </GlassCard>;
}
