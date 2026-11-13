import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { AuthContext } from '../contexts/AuthContext';
import { FONT_SIZES, SPACING, BORDER_RADIUS, hp, wp } from '../constants/responsiveSizes';

const EmailVerificationScreen = ({ navigation, email }) => {
  const { sendEmailVerification, isEmailVerified, signOut, forceEmailVerified, clearSavedCredentials, clearAllData, user } = useContext(AuthContext);
  const [isLoading, setIsLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(false);
  const [verificationCompleted, setVerificationCompleted] = useState(false);

  // Check if user is already verified and redirect if so
  React.useEffect(() => {
    const checkIfAlreadyVerified = async () => {
      try {
        if (user && user.emailVerified === true) {
          console.log('🔍 User is already verified, redirecting to home');
          // Redirect to home screen
          navigation.navigate('home');
          return;
        }
      } catch (error) {
        console.error('Error checking verification status:', error);
        // If there's an error, redirect to home to prevent crashes
        navigation.navigate('home');
      }
    };

    checkIfAlreadyVerified();
  }, [user, navigation]);

  // Show loading while checking verification status
  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary[500]} />
          <Text style={styles.loadingText}>Checking verification status...</Text>
        </View>
      </View>
    );
  }

  // Check if email is verified periodically
  useEffect(() => {
    let interval = null;
    let isChecking = false;

    const checkVerification = async () => {
      if (isChecking || verificationCompleted) return; // Prevent multiple simultaneous checks
      isChecking = true;
      setCheckingVerification(true);
      
      try {
        const verified = await isEmailVerified();
        if (verified && !verificationCompleted) {
          setVerificationCompleted(true);
          
          // Clear the interval immediately to prevent multiple alerts
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
          
          // Email is verified, redirect to login
          Alert.alert(
            'Email Verified!',
            'Your email has been verified. Please sign in to continue.',
            [{ 
              text: 'Sign In', 
              onPress: async () => {
                // Sign out and redirect to login
                await signOut();
              }
            }]
          );
        }
      } catch (error) {
        console.error('Error checking email verification:', error);
      } finally {
        setCheckingVerification(false);
        isChecking = false;
      }
    };

    // Check immediately
    checkVerification();

    // Check every 10 seconds (increased from 5 to reduce frequency)
    interval = setInterval(checkVerification, 10000);

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isEmailVerified, signOut, verificationCompleted]);

  const handleSendVerification = async () => {
    setIsLoading(true);
    try {
      const result = await sendEmailVerification();
      if (result.success) {
        setVerificationSent(true);
        Alert.alert(
          'Verification Email Sent',
          'Please check your email and click the verification link to continue.'
        );
      } else {
        Alert.alert('Error', result.error?.message || 'Failed to send verification email');
      }
    } catch (error) {
      console.error('Send verification error:', error);
      Alert.alert('Error', 'Failed to send verification email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    await handleSendVerification();
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? You can sign back in after verifying your email.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background.primary} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleSignOut}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Verify Your Email</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconContainer}>
          <MaterialIcons name="email" size={80} color={COLORS.primary[500]} />
        </View>

        {/* Title */}
        <Text style={styles.title}>Check Your Email</Text>
        
        {/* Subtitle */}
        <Text style={styles.subtitle}>
          We've sent a verification link to:
        </Text>
        
        {/* Email */}
        <Text style={styles.emailText}>{email}</Text>
        
        {/* Instructions */}
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsTitle}>What to do next:</Text>
          <View style={styles.instructionItem}>
            <MaterialIcons name="check-circle" size={20} color={COLORS.primary[500]} />
            <Text style={styles.instructionText}>Check your email inbox</Text>
          </View>
          <View style={styles.instructionItem}>
            <MaterialIcons name="check-circle" size={20} color={COLORS.primary[500]} />
            <Text style={styles.instructionText}>Click the verification link</Text>
          </View>
          <View style={styles.instructionItem}>
            <MaterialIcons name="check-circle" size={20} color={COLORS.primary[500]} />
            <Text style={styles.instructionText}>Return to the app</Text>
          </View>
        </View>

        {/* Status */}
        {checkingVerification && (
          <View style={styles.statusContainer}>
            <ActivityIndicator size="small" color={COLORS.primary[500]} />
            <Text style={styles.statusText}>Checking verification status...</Text>
          </View>
        )}

        {verificationSent && (
          <View style={styles.statusContainer}>
            <MaterialIcons name="info" size={20} color={COLORS.primary[500]} />
            <Text style={styles.statusText}>Verification email sent!</Text>
          </View>
        )}

        {/* Manual Check Button */}
        <TouchableOpacity
          style={styles.checkButton}
          onPress={async () => {
            setCheckingVerification(true);
            try {
              const verified = await isEmailVerified();
              if (verified) {
                setVerificationCompleted(true);
                Alert.alert(
                  'Email Verified!',
                  'Your email has been verified. Please sign in to continue.',
                  [{ 
                    text: 'Sign In', 
                    onPress: async () => {
                      await signOut();
                    }
                  }]
                );
              } else {
                Alert.alert('Not Verified', 'Your email is not yet verified. Please check your email and click the verification link.');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to check verification status. Please try again.');
            } finally {
              setCheckingVerification(false);
            }
          }}
          disabled={checkingVerification}
        >
          <MaterialIcons name="refresh" size={20} color={COLORS.primary[500]} />
          <Text style={styles.checkButtonText}>
            {checkingVerification ? 'Checking...' : 'Check Verification Status'}
          </Text>
        </TouchableOpacity>

        {/* Debug: Force Email Verified Button */}
        <TouchableOpacity
          style={[styles.checkButton, { backgroundColor: COLORS.orange[50], borderColor: COLORS.orange[300] }]}
          onPress={async () => {
            try {
              const result = await forceEmailVerified();
              if (result.success) {
                Alert.alert(
                  'Debug: Email Marked as Verified',
                  'Email verification status has been manually set to verified. You can now sign in.',
                  [{ 
                    text: 'Sign In', 
                    onPress: async () => {
                      await signOut();
                    }
                  }]
                );
              } else {
                Alert.alert('Debug Error', result.error || 'Failed to force email verification');
              }
            } catch (error) {
              Alert.alert('Debug Error', 'Failed to force email verification');
            }
          }}
        >
          <MaterialIcons name="bug-report" size={20} color={COLORS.orange[600]} />
          <Text style={[styles.checkButtonText, { color: COLORS.orange[600] }]}>
            Debug: Force Email Verified
          </Text>
        </TouchableOpacity>

        {/* Debug: Clear All Data Button */}
        <TouchableOpacity
          style={[styles.checkButton, { backgroundColor: COLORS.red[50], borderColor: COLORS.red[300] }]}
          onPress={async () => {
            Alert.alert(
              'Clear All Data',
              'This will clear all saved data and sign you out. Are you sure?',
              [
                { text: 'Cancel', style: 'cancel' },
                { 
                  text: 'Clear All', 
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await clearAllData();
                      Alert.alert('Data Cleared', 'All data has been cleared. Please restart the app.');
                    } catch (error) {
                      Alert.alert('Error', 'Failed to clear data');
                    }
                  }
                }
              ]
            );
          }}
        >
          <MaterialIcons name="delete-forever" size={20} color={COLORS.red[600]} />
          <Text style={[styles.checkButtonText, { color: COLORS.red[600] }]}>
            Debug: Clear All Data
          </Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        {!verificationSent ? (
          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleSendVerification}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <MaterialIcons name="send" size={20} color={COLORS.white} />
                <Text style={styles.primaryButtonText}>Send Verification Email</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.secondaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleResendVerification}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={COLORS.primary[500]} />
            ) : (
              <>
                <MaterialIcons name="refresh" size={20} color={COLORS.primary[500]} />
                <Text style={styles.secondaryButtonText}>Resend Verification</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.continueToLoginButton}
          onPress={handleSignOut}
        >
          <Text style={styles.continueToLoginButtonText}>Continue to Login</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
        >
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.background.primary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray[200],
  },
  backButton: {
    padding: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: COLORS.text.primary,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  emailText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.primary[600],
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  instructionsContainer: {
    width: '100%',
    backgroundColor: COLORS.primary[50],
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  instructionsTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.primary[700],
    marginBottom: SPACING.md,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  instructionText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text.primary,
    marginLeft: SPACING.sm,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  statusText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text.secondary,
    marginLeft: SPACING.sm,
  },
  checkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary[50],
    borderWidth: 1,
    borderColor: COLORS.primary[300],
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.md,
  },
  checkButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '500',
    color: COLORS.primary[600],
    marginLeft: SPACING.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text.secondary,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  footer: {
    padding: SPACING.lg,
    backgroundColor: COLORS.background.primary,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray[200],
  },
  primaryButton: {
    backgroundColor: COLORS.primary[500],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
  },
  secondaryButton: {
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.primary[500],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.white,
    marginLeft: SPACING.sm,
  },
  secondaryButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.primary[500],
    marginLeft: SPACING.sm,
  },
  continueToLoginButton: {
    backgroundColor: COLORS.primary[500],
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  continueToLoginButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.white,
  },
  signOutButton: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  signOutButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text.secondary,
    textDecorationLine: 'underline',
  },
});

export default EmailVerificationScreen;
