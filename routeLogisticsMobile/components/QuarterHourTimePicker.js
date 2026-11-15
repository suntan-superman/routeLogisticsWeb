import React, { useEffect, useState } from 'react';
import { BackHandler, Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { GlassButton, GlassCard } from './Glass';
import { QUARTER_MINUTES, isQuarterHourTime, pickerTime, quarterHourValue, timeLabel } from '../services/quarterHourTime';

// Explicit choices work identically on iOS and Android. Native Android clock
// pickers may expose arbitrary minutes and snap them only after selection.
export function QuarterHourPicker({ value = '', onChange, onCancel, disabled = false }) {
  const { palette } = useTheme();
  const [draft, setDraft] = useState(() => pickerTime(value));
  useEffect(() => { setDraft(pickerTime(value)); }, [value]);
  const canUse = QUARTER_MINUTES.includes(draft.minute);
  const selected = canUse ? quarterHourValue(draft.hour, draft.minute, draft.period) : null;
  const choice = (label, text, checked, onPress, style) => <Pressable key={label} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onPress}
    style={[{ minHeight: 48, minWidth: 44, alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: checked ? palette.accent : palette.border, backgroundColor: checked ? palette.glow : palette.input, opacity: disabled ? 0.5 : 1 }, style]}>
    <Text style={{ color: checked ? palette.accent : palette.text, fontWeight: checked ? '700' : '500', fontSize: 16 }}>{text}</Text>
  </Pressable>;
  return <View style={{ gap: 16 }}>
    <Text accessibilityRole="header" style={{ color: palette.text, fontSize: 20, fontWeight: '700' }}>Choose a time</Text>
    {!!value && !isQuarterHourTime(value) && <Text style={{ color: palette.secondary, lineHeight: 21 }}>Recorded time: {value}. It stays unchanged unless you choose a new time.</Text>}
    <View style={{ gap: 8 }}><Text style={{ color: palette.secondary }}>Hour</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{Array.from({ length: 12 }, (_, index) => index + 1).map(hour => choice(`Hour ${hour}`, String(hour), draft.hour === hour, () => setDraft(previous => ({ ...previous, hour })), { flexBasis: '14%', flexGrow: 1, maxWidth: 64 }))}</View></View>
    <View style={{ gap: 8 }}><Text style={{ color: palette.secondary }}>Minutes</Text><View style={{ flexDirection: 'row', gap: 8 }}>{QUARTER_MINUTES.map(minute => choice(`Minute ${String(minute).padStart(2, '0')}`, String(minute).padStart(2, '0'), draft.minute === minute, () => setDraft(previous => ({ ...previous, minute })), { flex: 1 }))}</View></View>
    <View style={{ flexDirection: 'row', gap: 8 }}>{['AM', 'PM'].map(period => choice(period, period, draft.period === period, () => setDraft(previous => ({ ...previous, period })), { flex: 1 }))}</View>
    <Text accessibilityLiveRegion="polite" style={{ color: palette.text, fontSize: 18, fontWeight: '600' }}>{selected ? `Selected time: ${timeLabel(selected)}` : 'Choose 00, 15, 30, or 45 minutes.'}</Text>
    <GlassButton title="Use selected time" disabled={disabled || !canUse} onPress={() => { if (!disabled && canUse) onChange(selected); }} />
    <GlassButton secondary title="Cancel time selection" onPress={onCancel} />
  </View>;
}

export default function QuarterHourTimeField({ label = 'Time', value = '', onChange, disabled = false }) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler?.addEventListener('hardwareBackPress', () => { setOpen(false); return true; });
    return () => subscription?.remove();
  }, [open]);
  return <View style={{ gap: 8 }}>
    <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    <GlassButton secondary title={value ? timeLabel(value) : 'Select time'} accessibilityLabel={label} icon="time-outline" disabled={disabled} onPress={() => setOpen(true)} />
    {open && !disabled && <GlassCard><QuarterHourPicker value={value} onCancel={() => setOpen(false)} onChange={time => { onChange(time); setOpen(false); }} /></GlassCard>}
  </View>;
}
