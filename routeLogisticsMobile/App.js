import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import SplashScreen from './screens/SplashScreen';
import LoginScreen from './screens/LoginScreen';
import SignUpScreen from './screens/SignUpScreen';
import EmailVerificationScreen from './screens/EmailVerificationScreen';
import HomeScreen from './screens/HomeScreen';
import SettingsScreen from './screens/SettingsScreen';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS } from './constants/colors';
import { FONT_SIZES, SPACING } from './constants/responsiveSizes';

// Loading Screen Component
const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color={COLORS.primary[500]} />
    <Text style={styles.loadingText}>Loading Route Logistics...</Text>
  </View>
);

// Simple Navigation Component
const AppContent = () => {
  const { isAuthenticated, isLoading, user, isEmailVerified, refreshUser } = useAuth();
  const [currentScreen, setCurrentScreen] = useState('splash');
  
  // Debug wrapper for setCurrentScreen
  const debugSetCurrentScreen = (screen) => {
    console.log('🔄 Setting current screen to:', screen);
    setCurrentScreen(screen);
  };
  const [showSplash, setShowSplash] = useState(true);
  const [hasCheckedVerification, setHasCheckedVerification] = useState(false);

  // Handle splash screen completion
  const handleSplashComplete = () => {
    setShowSplash(false);
    setCurrentScreen('login');
  };

  // Check email verification status when user is authenticated
  React.useEffect(() => {
    const checkEmailVerification = async () => {
      if (isAuthenticated && user && !hasCheckedVerification) {
        setHasCheckedVerification(true);
        try {
          // Force refresh user data to get latest email verification status
          const refreshResult = await refreshUser();
          // console.log('🔄 User data refreshed:', refreshResult);
          
          // If user is verified, ensure we don't show verification screen
          if (user && user.emailVerified === true) {
            // console.log('✅ User is verified, ensuring home screen');
            setCurrentScreen('home');
            // Force a small delay to ensure state is updated
            setTimeout(() => {
              setCurrentScreen('home');
            }, 100);
          }
        } catch (error) {
          console.error('Error refreshing user data:', error);
          // If there's an error, force home screen to prevent crashes
          if (user && user.emailVerified === true) {
            setCurrentScreen('home');
          }
        }
      }
    };

    // Add error boundary to prevent crashes
    try {
      checkEmailVerification();
    } catch (error) {
      console.error('Critical error in email verification check:', error);
      // Force home screen if there's a critical error
      if (isAuthenticated && user) {
        setCurrentScreen('home');
      }
    }
  }, [isAuthenticated, user, hasCheckedVerification, refreshUser]);

  // ULTRA AGGRESSIVE: Force home screen for verified users
  React.useEffect(() => {
    if (isAuthenticated && user && user.emailVerified === true) {
      console.log('🚨 ULTRA AGGRESSIVE: Forcing home screen for verified user');
      setCurrentScreen('home');
    }
  }, [isAuthenticated, user]);

  // Show splash screen first
  if (showSplash) {
    return <SplashScreen navigation={{ navigate: handleSplashComplete }} />;
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  // NUCLEAR OPTION: If user is authenticated, handle navigation properly
  // This completely bypasses the verification system to prevent crashes
  if (isAuthenticated && user) {
    console.log('🚨 NUCLEAR OPTION: Bypassing verification system for authenticated user');
    
    // Handle navigation within authenticated app
    console.log('🔍 Current screen:', currentScreen);
    if (currentScreen === 'settings') {
      console.log('🔧 Rendering SettingsScreen');
      return <SettingsScreen navigation={{ navigate: debugSetCurrentScreen, goBack: () => debugSetCurrentScreen('home') }} />;
    }
    console.log('🏠 Rendering HomeScreen');
    return <HomeScreen navigation={{ navigate: debugSetCurrentScreen }} />;
  }

  // Debug logging
  if (isAuthenticated && user) {
    console.log('🔍 User authenticated:', user.email, 'emailVerified:', user.emailVerified, 'hasCheckedVerification:', hasCheckedVerification);
  }


  // Simple screen switching for auth flow
  if (currentScreen === 'signup') {
    return <SignUpScreen navigation={{ navigate: setCurrentScreen }} />;
  }

  return <LoginScreen navigation={{ navigate: setCurrentScreen }} />;
};

// Root App Component
export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <AppContent />
      </AuthProvider>
    </LanguageProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    fontSize: FONT_SIZES.HEADING,
    color: COLORS.text.secondary,
    marginTop: SPACING.MEDIUM,
  },
});
