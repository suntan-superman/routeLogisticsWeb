import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { MaterialIcons, AntDesign } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { AuthContext } from '../contexts/AuthContext';
import { FONT_SIZES, SPACING, BUTTON_SIZES, BORDER_RADIUS, ICON_SIZES, CARD_SIZES, WIDTHS, HEIGHTS, hp, wp, rf } from '../constants/responsiveSizes';
import ServiceSelectionScreen from './ServiceSelectionScreen';

const SignUpScreen = ({ navigation }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showServiceSelection, setShowServiceSelection] = useState(false);
  const [selectedServices, setSelectedServices] = useState([]);

  const { signUp } = useContext(AuthContext);

  const handleSignUp = async () => {
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert('Required Fields', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters');
      return;
    }

    // Create a personal login first. Company services come from the accepted
    // invitation; independent users configure services later in Settings.
    await performSignUp([]);
  };

  const handleServiceSelection = (services) => {
    setSelectedServices(services);
    setShowServiceSelection(false);
    // Now proceed with actual sign up
    performSignUp(services);
  };

  const performSignUp = async (services) => {
    setIsLoading(true);
    try {
      const result = await signUp(email, password, { 
        name, 
        services: services,
        serviceCategories: getServiceCategories(services)
      });
      if (result.success) {
        if (result.needsEmailVerification) {
          // Email verification is required - the app will automatically show the verification screen
          // No need to show alert, the EmailVerificationScreen will handle this
        }
        // Navigation will be handled by AuthContext state change
      } else {
        Alert.alert('Sign Up Failed', result.error?.message || 'Sign up failed');
      }
    } catch (error) {
      console.error('Sign up error:', error);
      Alert.alert('Sign Up Failed', 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const getServiceCategories = (services) => {
    // This would map services back to categories for easier filtering
    // For now, return the services as-is
    return services;
  };

  const handleLoginNavigation = () => {
    navigation.navigate('login');
  };

  // Show service selection screen if needed
  if (showServiceSelection) {
    return (
      <ServiceSelectionScreen
        navigation={navigation}
        onServicesSelected={handleServiceSelection}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logoText}>
            <Text style={styles.factotumText}>mi</Text>
            <Text style={styles.factotumText}>Factotum</Text>
          </Text>
          <Text style={styles.clientText}>Join the field service revolution</Text>
        </View>

        {/* Form */}
        <View style={styles.formContainer}>
          {/* Name Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="Full Name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!isLoading}
            />
            <MaterialIcons
              name="person"
              size={24}
              color="#666"
              style={styles.inputIcon}
            />
          </View>

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

          {/* Confirm Password Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
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

        {/* Sign Up Button */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={[styles.signUpButton, isLoading && styles.signUpButtonDisabled]}
            onPress={handleSignUp}
            disabled={isLoading}
          >
            <Text style={styles.signUpButtonText}>
              {isLoading ? 'Creating Account...' : 'Sign Up'}
            </Text>
          </TouchableOpacity>

          {/* Login Link */}
          <TouchableOpacity 
            style={styles.loginLink}
            onPress={handleLoginNavigation}
            disabled={isLoading}
          >
            <Text style={styles.loginText}>
              Already have an account? <Text style={styles.loginTextBold}>Login</Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footerContainer}>
          <Text style={styles.termsText}>
            By signing up, you agree to our Terms of Service and Privacy Policy
          </Text>
          <Text style={styles.copyrightText}>
            Route Logisitcs Copyright 2025
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContainer: {
    flexGrow: 1,
    paddingTop: hp('8%'),
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingBottom: SPACING.XLARGE,
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
  signUpButton: {
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
  signUpButtonDisabled: {
    opacity: 0.6,
  },
  signUpButtonText: {
    fontSize: FONT_SIZES.LARGE,
    fontWeight: 'bold',
    color: '#000',
  },
  loginLink: {
    padding: SPACING.SMALL,
  },
  loginText: {
    fontSize: FONT_SIZES.MEDIUM,
    color: '#666',
    textAlign: 'center',
  },
  loginTextBold: {
    fontWeight: 'bold',
    color: COLORS.primary[500],
  },
  footerContainer: {
    alignItems: 'center',
    width: '85%',
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

export default SignUpScreen;
