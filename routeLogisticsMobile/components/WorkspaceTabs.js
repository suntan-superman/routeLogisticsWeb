import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
export const WORK_TABS = [
  { id: 'home', label: 'Home', icon: 'home-outline' },
  { id: 'schedule', label: 'Schedule', icon: 'calendar-outline' },
  { id: 'route', label: 'Route', icon: 'navigate-outline' },
  { id: 'settings', label: 'Settings', icon: 'settings-outline' },
];
export default function WorkspaceTabs({ active, onSelect, busy = false }) {
  const { palette } = useTheme();
  return <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, paddingTop: 6 }}>
    {WORK_TABS.map(tab => <Pressable key={tab.id} accessibilityRole="tab" accessibilityLabel={`${tab.label} tab`}
      accessibilityState={{ selected: active === tab.id, disabled: busy }} disabled={busy} onPress={() => onSelect(tab.id)}
      style={({ pressed }) => ({ flex: 1, minHeight: 60, paddingHorizontal: 3, paddingVertical: 8, gap: 5, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Ionicons accessible={false} name={tab.icon} size={23} color={active === tab.id ? palette.accent : palette.secondary} />
      <Text style={{ color: active === tab.id ? palette.accent : palette.secondary, fontSize: 12, lineHeight: 18, fontWeight: active === tab.id ? '700' : '500', textAlign: 'center' }}>{tab.label}</Text>
    </Pressable>)}
  </View>;
}
