import React, { useEffect, useState } from 'react';
import { Text, ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import WorkQueryProvider from './contexts/WorkQueryProvider';
import { LanguageProvider } from './contexts/LanguageContext';
import { ThemeProvider, useTheme } from './theme/ThemeProvider';
import { GlassScreen, GlassCard, GlassButton } from './components/Glass';
import LoginScreen from './screens/LoginScreen';
import SignUpScreen from './screens/SignUpScreen';
import EmailVerificationScreen from './screens/EmailVerificationScreen';
import WorkspaceAccessScreen from './screens/WorkspaceAccessScreen';
import HomeScreen from './screens/HomeScreen';
import SettingsScreen from './screens/SettingsScreen';
function AppContent() {
  const { isAuthenticated, isLoading, user, permissions, sessionError, refreshUser, signOut } = useAuth();
  const { ready, palette, isDark } = useTheme();
  const [screen, setScreen] = useState('login');
  useEffect(() => { if (isAuthenticated) setScreen('home'); }, [isAuthenticated, user?.id]);
  const navigation = { navigate: setScreen, goBack: () => setScreen('home') };
  let content;
  if (!ready || isLoading) content = <GlassScreen><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}><ActivityIndicator color={palette.accent} /><Text style={{ color: palette.text }}>Loading your workspace…</Text></View></GlassScreen>;
  else if (sessionError) content = <GlassScreen><View style={{ flex: 1, justifyContent: 'center', padding: 24 }}><GlassCard><Text style={{ color: palette.text, lineHeight: 23 }}>{sessionError}</Text><GlassButton title="Retry" onPress={refreshUser} /><GlassButton secondary title="Sign out" onPress={signOut} /></GlassCard></View></GlassScreen>;
  else if (isAuthenticated && !user.emailVerified) content = <EmailVerificationScreen />;
  else if (isAuthenticated && !permissions.canAccess) content = <WorkspaceAccessScreen />;
  else if (isAuthenticated) content = screen === 'settings' ? <SettingsScreen navigation={navigation} /> : <HomeScreen key={`${user.id}:${user.companyId || 'solo'}:${user.role || 'solo'}:${user.membershipId || ''}`} navigation={navigation} />;
  else content = screen === 'signup' ? <SignUpScreen navigation={navigation} /> : <LoginScreen navigation={navigation} />;
  return <><StatusBar style={isDark ? 'light' : 'dark'} />{content}</>;
}
export default function App() {
  return <SafeAreaProvider><ThemeProvider><LanguageProvider><AuthProvider><WorkQueryProvider><AppContent /></WorkQueryProvider></AuthProvider></LanguageProvider></ThemeProvider></SafeAreaProvider>;
}
