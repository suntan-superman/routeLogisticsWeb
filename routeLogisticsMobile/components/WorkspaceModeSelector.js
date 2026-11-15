import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export default function WorkspaceModeSelector({ mode, onSelect, disabled = false }) {
  const { palette } = useTheme();
  return <View accessibilityRole="tablist" accessibilityLabel="Workspace mode" style={{ flexDirection: 'row', gap: 6, padding: 5, marginHorizontal: 20, marginTop: 8, marginBottom: 6, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }}>
    {[['field', 'Field'], ['management', 'Management']].map(([value, label]) => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={`${label} mode`}
      accessibilityState={{ selected: mode === value, disabled }} disabled={disabled} onPress={() => onSelect(value)}
      style={({ pressed }) => ({ flex: 1, minHeight: 46, paddingHorizontal: 8, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: mode === value ? palette.glow : 'transparent', opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}>
      <Text style={{ color: mode === value ? palette.accent : palette.secondary, fontWeight: mode === value ? '700' : '500', textAlign: 'center', fontSize: 14, lineHeight: 21 }}>{label}</Text>
    </Pressable>)}
  </View>;
}
