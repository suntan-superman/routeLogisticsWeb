import React, { useState } from 'react';
import { View, Text, Button, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import SplashScreen from './screens/SplashScreen';
import LoginScreen from './screens/LoginScreen';
import SignUpScreen from './screens/SignUpScreen';
import EmailVerificationScreen from './screens/EmailVerificationScreen';
import HomeScreen from './screens/HomeScreen';
import SettingsScreen from './screens/SettingsScreen';
function AppContent() {
  const { isAuthenticated, isLoading, user, sessionError, refreshUser, signOut } = useAuth();
  const [screen, setScreen] = useState('login');
  const [splash, setSplash] = useState(true);
  const navigation = { navigate: setScreen, goBack: () => setScreen('home') };
  if (splash) return <SplashScreen navigation={{ navigate: () => setSplash(false) }} />;
  if (isLoading) return <View style={styles.center}><ActivityIndicator /><Text>Loading Route Logistics…</Text></View>;
  if (sessionError) return <View style={styles.center}><Text>{sessionError}</Text><Button title="Retry" onPress={refreshUser} /><Button title="Sign out" onPress={signOut} /></View>;
  if (isAuthenticated && !user.emailVerified) return <EmailVerificationScreen />;
  if (isAuthenticated) return screen === 'settings' ? <SettingsScreen navigation={navigation} /> : <HomeScreen key={`${user.id}:${user.companyId || 'solo'}:${user.role || 'solo'}:${user.membershipId || ''}`} navigation={navigation} />;
  return screen === 'signup' ? <SignUpScreen navigation={navigation} /> : <LoginScreen navigation={navigation} />;
}
export default function App() {
  return <LanguageProvider><AuthProvider><StatusBar style="dark" /><AppContent /></AuthProvider></LanguageProvider>;
}
const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: '#fff' } });
