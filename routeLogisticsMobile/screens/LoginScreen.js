import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { MaterialIcons, AntDesign } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { AuthContext } from '../contexts/AuthContext';
import { FONT_SIZES, SPACING, BUTTON_SIZES, BORDER_RADIUS, ICON_SIZES, CARD_SIZES, WIDTHS, HEIGHTS, hp, wp, rf } from '../constants/responsiveSizes';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);
  const [secureStoreStatus, setSecureStoreStatus] = useState('Testing...');

  const { signIn, loadSavedCredentials, saveCredentials, testSecureStore, clearSavedCredentials } = useContext(AuthContext);

  // Load saved credentials when component mounts
  useEffect(() => {
    const loadCredentials = async () => {
      const storeWorking = await testSecureStore();
      
      const result = await loadSavedCredentials();
      if (result.success && result.credentials) {
        setEmail(result.credentials.email);
        setPassword(result.credentials.password);
      }
      setCredentialsLoaded(true);
    };
    
    loadCredentials();
  }, [loadSavedCredentials, testSecureStore]);

  const handleLogin = async () => {
    if (!email || !password) {
      alert('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      const result = await signIn(email, password);
      if (result.success) {
        // Save credentials for next time
        await saveCredentials(email, password);
        
        const testLoad = await loadSavedCredentials();
        if (testLoad.success) {
          // console.log('✅ Immediate load test: Success!');
        } else {
          console.log('❌ Immediate load test: Failed!');
        }
        
        // Navigation will be handled by AuthContext state change
      } else {
        alert(result.error?.message || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUpNavigation = () => {
    navigation.navigate('signup');
  };

  // Add manual credential clearing function for debugging
  const handleClearCredentials = async () => {
    try {
      const result = await clearSavedCredentials();
      if (result.success) {
        // console.log('🧹 Manually cleared all saved credentials');
        setEmail('');
        setPassword('');
        setCredentialsLoaded(false);
        // alert('✅ Saved credentials cleared successfully!');
      } else {
        alert('❌ Failed to clear credentials');
      }
    } catch (error) {
      console.error('Error clearing credentials:', error);
      alert('❌ Error clearing credentials');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logoText}>
          <Text style={styles.factotumText}>Route</Text>
          <Text style={styles.factotumText}> Logistics</Text>
        </Text>
        {/* <Text style={styles.clientText}>My Handyman</Text> */}
        <Text style={styles.clientText}>Your Field Service Solution</Text>
      </View>

      {/* Auto-fill Notice */}
      {credentialsLoaded && email && password && (
        <View style={styles.demoNotice}>
          <Text style={styles.demoText}>✨ Auto-filled</Text>
          <Text style={styles.demoSubtext}>Using your saved credentials</Text>
        </View>
      )}

      {/* Form */}
      <View style={styles.formContainer}>
        {/* Email Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />
          <MaterialIcons
            name="email"
            size={24}
            color="#666"
            style={styles.inputIcon}
          />
        </View>

        {/* Password Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />
          <AntDesign
            name="lock"
            size={24}
            color="#666"
            style={styles.inputIcon}
          />
        </View>
      </View>

      {/* Login Button */}
      <View style={styles.actionContainer}>
        <TouchableOpacity
          style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          <Text style={styles.loginButtonText}>
            {isLoading ? 'Signing In...' : 'Login'}
          </Text>
        </TouchableOpacity>

        {/* Sign Up Link */}
        <TouchableOpacity 
          style={styles.signUpLink}
          onPress={handleSignUpNavigation}
          disabled={isLoading}
        >
          <Text style={styles.signUpText}>
            Don't have an account? <Text style={styles.signUpTextBold}>Sign Up</Text>
          </Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footerContainer}>
        {/* Debug: Clear Credentials Button */}
        <TouchableOpacity 
          style={styles.debugButton}
          onPress={handleClearCredentials}
          disabled={isLoading}
        >
          <Text style={styles.debugButtonText}>🧹 Clear Saved Credentials</Text>
        </TouchableOpacity>
        
        
        <Text style={styles.termsText}>
          By signing in, you agree to our Terms of Service and Privacy Policy
        </Text>
        <Text style={styles.copyrightText}>
          Route Logistics Copyright 2025
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: hp('10%'),
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.LARGE,
  },
  logoText: {
    fontSize: FONT_SIZES.DISPLAY * 0.75,
    fontWeight: 'bold',
  },
  factotumText: {
    color: COLORS.primary[500],
  },
  clientText: {
    fontSize: FONT_SIZES.HEADING * 0.75,
    fontWeight: 'bold',
    color: 'black',
    marginTop: SPACING.TINY,
  },
  demoNotice: {
    backgroundColor: COLORS.primary[50],
    borderColor: COLORS.primary[200],
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.SMALL,
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
    marginBottom: SPACING.XLARGE,
    alignItems: 'center',
    width: '85%',
  },
  demoText: {
    fontSize: FONT_SIZES.MEDIUM,
    fontWeight: 'bold',
    color: COLORS.primary[700],
    marginBottom: SPACING.TINY,
  },
  demoSubtext: {
    fontSize: FONT_SIZES.SMALL,
    color: COLORS.primary[600],
    textAlign: 'center',
  },
  autoFillText: {
    fontSize: FONT_SIZES.CAPTION,
    color: COLORS.primary[500],
    textAlign: 'center',
    marginTop: SPACING.TINY,
    fontStyle: 'italic',
  },
  formContainer: {
    width: '100%',
    paddingHorizontal: SPACING.LARGE,
    marginBottom: SPACING.LARGE,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f8ff',
    borderRadius: BORDER_RADIUS.SMALL,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRightWidth: 4,
    borderBottomWidth: 4,
    marginBottom: SPACING.MEDIUM,
    paddingHorizontal: SPACING.SMALL,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: hp('0.25%') },
    shadowOpacity: 0.1,
    shadowRadius: wp('0.5%'),
    elevation: 2,
  },
  textInput: {
    flex: 1,
    height: hp('6%'),
    fontSize: FONT_SIZES.MEDIUM,
    color: '#333',
    paddingVertical: SPACING.SMALL,
  },
  inputIcon: {
    marginLeft: SPACING.SMALL,
  },
  actionContainer: {
    width: '100%',
    paddingHorizontal: SPACING.LARGE,
    alignItems: 'center',
    marginBottom: SPACING.XLARGE,
  },
  loginButton: {
    backgroundColor: COLORS.primary[500],
    paddingVertical: SPACING.SMALL,
    paddingHorizontal: SPACING.XLARGE,
    borderRadius: BORDER_RADIUS.SMALL,
    borderWidth: 2,
    borderColor: '#000',
    borderRightWidth: 4,
    borderBottomWidth: 4,
    minWidth: wp('36%'),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: hp('0.25%') },
    shadowOpacity: 0.2,
    shadowRadius: wp('0.5%'),
    elevation: 3,
    marginBottom: SPACING.MEDIUM,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    fontSize: FONT_SIZES.LARGE,
    fontWeight: 'bold',
    color: '#000',
  },
  signUpLink: {
    padding: SPACING.SMALL,
  },
  signUpText: {
    fontSize: FONT_SIZES.MEDIUM,
    color: '#666',
    textAlign: 'center',
  },
  signUpTextBold: {
    fontWeight: 'bold',
    color: COLORS.primary[500],
  },
  footerContainer: {
    marginTop: 'auto',
    paddingBottom: SPACING.XLARGE,
    alignItems: 'center',
    width: '85%',
  },
  debugButton: {
    backgroundColor: '#f8f9fa',
    borderColor: '#dee2e6',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.SMALL,
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
    marginBottom: SPACING.MEDIUM,
  },
  debugButtonText: {
    fontSize: FONT_SIZES.CAPTION,
    color: '#6c757d',
    textAlign: 'center',
  },
  termsText: {
    fontSize: FONT_SIZES.CAPTION,
    color: '#666',
    textAlign: 'center',
    marginBottom: SPACING.SMALL,
  },
  copyrightText: {
    fontSize: FONT_SIZES.TINY,
    color: '#999',
    textAlign: 'center',
  },
});

export default LoginScreen;
