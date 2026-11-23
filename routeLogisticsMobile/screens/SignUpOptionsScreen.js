import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassButton, GlassCard, GlassScreen } from '../components/Glass';
import { useTheme } from '../theme/ThemeProvider';

const COMPANY_REGISTRATION_URL = 'https://route-logistics.com/onboarding';

export default function SignUpOptionsScreen({ navigation }) {
  const { palette } = useTheme();
  const [error, setError] = useState('');
  const openCompanyRegistration = async () => {
    setError('');
    try { await Linking.openURL(COMPANY_REGISTRATION_URL); }
    catch { setError(`Could not open company registration. Open ${COMPANY_REGISTRATION_URL} in your browser.`); }
  };
  const option = (title, description, icon, onPress, hint) => <Pressable
    accessibilityRole="button" accessibilityLabel={title} accessibilityHint={hint} onPress={onPress}
    style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
    <GlassCard style={{ marginBottom: 14 }} contentStyle={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
      <Ionicons name={icon} size={28} color={palette.accent} />
      <View style={{ flex: 1, gap: 8 }}><Text style={{ color: palette.text, fontSize: 19, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: palette.secondary, fontSize: 15, lineHeight: 22 }}>{description}</Text></View>
      <Ionicons name="chevron-forward" size={20} color={palette.secondary} />
    </GlassCard>
  </Pressable>;
  return <GlassScreen><ScrollView contentContainerStyle={{ flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center', padding: 24, justifyContent: 'center' }}>
    <Text style={{ color: palette.accent, fontSize: 13, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>ROUTE LOGISTICS</Text>
    <Text style={{ color: palette.text, fontSize: 32, fontWeight: '700', marginBottom: 8 }}>Get started</Text>
    <Text style={{ color: palette.secondary, fontSize: 17, lineHeight: 25, marginBottom: 28 }}>How would you like to use Route Logistics?</Text>
    {option('Create a Personal Account', 'Register with your email address. Your company administrator can invite you to join their team.', 'person-add-outline', () => navigation.navigate('signup'), 'Opens personal account registration in this app')}
    {option('Register a Company', 'Set up a new company and manage your field service operations. Authorization is required during our early access period.', 'business-outline', openCompanyRegistration, 'Opens company registration in your web browser')}
    {!!error && <Text accessibilityRole="alert" style={{ color: palette.danger, lineHeight: 22, marginBottom: 16 }}>{error}</Text>}
    <GlassButton secondary title="Back to Sign In" onPress={() => navigation.navigate('login')} icon="arrow-back" style={{ marginTop: 10 }} />
  </ScrollView></GlassScreen>;
}
