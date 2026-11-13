import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme, AccessibilityInfo } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { COLORS } from '../constants/colors';
import { loadAppearance, saveAppearance, resolveMode } from './preferences';

const ThemeContext = createContext(null);
export function ThemeProvider({ children }) {
  const system = useColorScheme();
  const [mode, setMode] = useState('system'), [ready, setReady] = useState(false), [reduceTransparency, setReduceTransparency] = useState(false);
  useEffect(() => { let mounted = true; loadAppearance(AsyncStorage).then(saved => { if (mounted) setMode(saved); }).catch(() => {}).finally(() => { if (mounted) setReady(true); }); return () => { mounted = false; }; }, []);
  useEffect(() => {
    AccessibilityInfo.isReduceTransparencyEnabled?.().then(setReduceTransparency).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => subscription.remove();
  }, []);
  const isDark = resolveMode(mode, system) === 'dark';
  const palette = useMemo(() => ({
    background: isDark ? '#07120F' : '#F2F7F5', surface: isDark ? '#14241F' : '#FFFFFF',
    glass: isDark ? 'rgba(20,36,31,0.78)' : 'rgba(255,255,255,0.78)',
    text: isDark ? '#EFFAF5' : '#142B23', secondary: isDark ? '#B0C8BE' : '#526C60',
    border: isDark ? 'rgba(211,255,231,0.17)' : 'rgba(38,83,61,0.12)',
    input: isDark ? 'rgba(5,17,12,0.55)' : 'rgba(237,245,241,0.85)',
    accent: isDark ? '#62E3B3' : '#087B55', button: '#087B55', danger: isDark ? '#FFAAA3' : '#AD3030',
    highlight: isDark ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.95)',
    glow: isDark ? 'rgba(16,185,129,0.20)' : 'rgba(52,211,153,0.16)',
  }), [isDark]);
  const colors = useMemo(() => ({ ...COLORS,
    text: { ...COLORS.text, primary: palette.text, secondary: palette.secondary, tertiary: palette.secondary },
    background: { ...COLORS.background, primary: palette.background, secondary: palette.surface, tertiary: palette.input },
    gray: isDark ? { 25: '#0D1B16', 50: '#14241F', 100: '#1C3027', 200: '#2D4439', 300: '#405D4E', 400: '#839D90', 500: '#ADC2B6', 600: '#C3D6CB', 700: '#D5E6DC', 800: '#E4F0E9', 900: '#F4FBF7' } : COLORS.gray,
    primary: { ...COLORS.primary, 50: isDark ? '#12382B' : COLORS.primary[50], 100: isDark ? '#164D38' : COLORS.primary[100], 200: isDark ? '#286C51' : COLORS.primary[200], 700: palette.accent },
  }), [palette, isDark]);
  useEffect(() => { SystemUI.setBackgroundColorAsync(palette.background).catch(() => {}); }, [palette.background]);
  const changeMode = async next => { await saveAppearance(AsyncStorage, next); setMode(next); };
  return <ThemeContext.Provider value={{ mode, changeMode, ready, isDark, palette, colors, reduceTransparency }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
