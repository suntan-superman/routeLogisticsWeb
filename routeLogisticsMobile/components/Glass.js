import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ActivityIndicator, TextInput } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';

export function GlassScreen({ children, style }) {
  const { palette } = useTheme();
  return <View style={[{ flex: 1, backgroundColor: palette.background }, style]}>
    <LinearGradient pointerEvents="none" colors={[palette.glow, palette.background, palette.background]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 0.85 }} style={StyleSheet.absoluteFill} />
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right', 'bottom']}>{children}</SafeAreaView>
  </View>;
}
export function GlassCard({ children, style, contentStyle }) {
  const { palette, isDark, reduceTransparency } = useTheme();
  return <View style={[styles.card, { borderColor: palette.border, backgroundColor: reduceTransparency ? palette.surface : palette.glass }, style]}>
    {Platform.OS === 'ios' && !reduceTransparency && <BlurView pointerEvents="none" intensity={22} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
    <LinearGradient pointerEvents="none" colors={[palette.highlight, 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { opacity: isDark ? 0.4 : 0.35 }]} />
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
export function IconButton({ icon, label, onPress }) {
  const { palette } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.icon, { backgroundColor: palette.glass, borderColor: palette.border }]}><Ionicons name={icon} size={21} color={palette.text} /></Pressable>;
}
export function GlassInput({ label, right, style, ...props }) {
  const { palette, isDark } = useTheme();
  return <View style={{ gap: 7 }}>
    {!!label && <Text style={{ color: palette.secondary, fontSize: 13, fontWeight: '600' }}>{label}</Text>}
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: palette.input, borderWidth: 1, borderColor: palette.border, borderRadius: 14 }}>
      <TextInput accessibilityLabel={label} keyboardAppearance={isDark ? 'dark' : 'light'} placeholderTextColor={palette.secondary} selectionColor={palette.accent} style={[{ flex: 1, minHeight: 50, padding: 14, color: palette.text, fontSize: 16 }, style]} {...props} />
      {right}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  card: { borderRadius: 24, borderWidth: 1, overflow: 'hidden', shadowColor: '#052018', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.07, shadowRadius: 18 },
  button: { minHeight: 48, borderRadius: 15, paddingHorizontal: 18, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 1 },
  icon: { width: 44, height: 44, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
