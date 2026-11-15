import React, { useState } from 'react';
import { Alert, Linking, Platform, Text, View } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useTheme } from '../theme/ThemeProvider';
import { GlassButton, GlassCard } from './Glass';
import DeleteAccountSettings from './DeleteAccountSettings';
import { aboutAppMessage } from '../services/appInfo';

// Account controls remain reachable even when company membership is pending or
// removed. This section does not request company data or grant workspace access.
export default function LegalAccountSettings() {
  const { palette } = useTheme();
  const [error, setError] = useState('');
  const open = async (url, label) => {
    setError('');
    try { await Linking.openURL(url); }
    catch { setError(`Could not open ${label}. Try again, or open ${url} in your browser.`); }
  };
  return <View style={{ gap: 16 }}>
    <Text style={{ fontSize: 13, fontWeight: '700', color: palette.secondary, letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 }}>Legal &amp; account</Text>
    <GlassCard>
      <GlassButton secondary title="About Route Logistics" icon="information-circle-outline" onPress={() => Alert.alert('About Route Logistics', aboutAppMessage({ application: Application, config: Constants.expoConfig, executionEnvironment: Constants.executionEnvironment, platform: Platform }), [{ text: 'Close', style: 'cancel' }], { cancelable: true })} />
      <GlassButton secondary title="Privacy policy" icon="shield-checkmark-outline" onPress={() => open('https://route-logistics.com/privacy', 'the privacy policy')} />
      <GlassButton secondary title="Terms of service" icon="document-text-outline" onPress={() => open('https://route-logistics.com/terms', 'the terms of service')} />
      {!!error && <Text accessibilityRole="alert" style={{ color: palette.danger, lineHeight: 21 }}>{error}</Text>}
    </GlassCard>
    <DeleteAccountSettings />
  </View>;
}
