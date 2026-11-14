import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';

export function GlassScreen({ children, style, edges = ['top', 'left', 'right', 'bottom'] }) {
  const { palette } = useTheme();
  return <View style={[{ flex: 1, backgroundColor: palette.background }, style]}>
    <SafeAreaView style={{ flex: 1 }} edges={edges}>{children}</SafeAreaView>
  </View>;
}
export function GlassCard({ children, style, contentStyle }) {
  const { palette } = useTheme();
  return <View style={[styles.card, { borderColor: palette.border, backgroundColor: palette.surface }, style]}>
    <View style={[{ padding: 20, gap: 12 }, contentStyle]}>{children}</View>
  </View>;
}
export function GlassButton({ title, onPress, icon, secondary = false, disabled = false, busy = false, style, accessibilityLabel }) {
  const { palette } = useTheme();
  const color = secondary ? palette.text : '#FFFFFF';
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || title} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor: secondary ? palette.input : palette.button, borderColor: secondary ? palette.border : 'rgba(255,255,255,0.18)', opacity: disabled || busy ? 0.5 : pressed ? 0.8 : 1 }, style]}>
    {busy ? <ActivityIndicator color={color} /> : icon ? <Ionicons name={icon} size={19} color={color} /> : null}
    <Text style={{ fontSize: 15, fontWeight: '700', color, textAlign: 'center', flexShrink: 1 }}>{title}</Text>
  </Pressable>;
}
export function IconButton({ icon, label, onPress, disabled = false }) {
  const { palette } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.icon, { backgroundColor: palette.surface, borderColor: palette.border, opacity: disabled ? 0.5 : 1 }]}><Ionicons name={icon} size={21} color={palette.text} /></Pressable>;
}
export function GlassInput({ label, right, style, ...props }) {
  const { palette, isDark } = useTheme();
  return <View style={{ gap: 7 }}>
    {!!label && <Text style={{ color: palette.text, fontSize: 14, lineHeight: 21, fontWeight: '600' }}>{label}</Text>}
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.input, borderWidth: 1, borderColor: palette.border, borderRadius: 14 }}>
      <TextInput accessibilityLabel={label} keyboardAppearance={isDark ? 'dark' : 'light'} placeholderTextColor={palette.secondary} selectionColor={palette.accent} style={[{ flex: 1, minHeight: props.multiline ? 112 : 50, padding: 14, color: palette.text, fontSize: 16, lineHeight: 23, textAlignVertical: props.multiline ? 'top' : 'center' }, style]} {...props} />
      {right}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  button: { minHeight: 48, borderRadius: 15, paddingHorizontal: 18, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 1 },
  icon: { width: 48, height: 48, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
