import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { AuthService } from '../services/firebase';
import { getDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../constants/firebase';

// Storage keys constants
const STORAGE_KEYS = {
  USER_DATA: 'userData',
  USER_TOKEN: 'userToken',
  SAVED_CREDENTIALS: 'savedCredentials',
  TEMP_CREDENTIALS: 'tempCredentials', // For storing credentials during email verification
};

const AuthContext = createContext({});

// Export the context so it can be imported directly
export { AuthContext };

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Initialize auth state
  useEffect(() => {
    let unsubscribe = () => {};
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        // Wait a short moment to ensure Firebase is fully initialized
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Check auth state first (this only accesses SecureStore, not Firestore)
        if (isMounted) {
          await checkAuthState();
        }
        
        // Listen to auth state changes
        unsubscribe = AuthService.onAuthStateChanged(async (firebaseUser) => {
          if (!isMounted) return; // Prevent state updates if component is unmounted
          if (firebaseUser) {
            // Ensure user is fully authenticated before making Firestore calls
            // Wait for auth token to be available
            try {
              await firebaseUser.getIdToken();
            } catch (tokenError) {
              console.error('❌ Failed to get auth token:', tokenError);
              // Fallback to basic auth data without Firestore
              const userData = {
                id: firebaseUser.uid,
                email: firebaseUser.email,
                name: firebaseUser.displayName || 'User',
                emailVerified: firebaseUser.emailVerified,
              };
              
              setUser(userData);
              setIsAuthenticated(true);
              await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
              setIsLoading(false);
              return;
            }
            
            // Fetch complete user data from Firestore
            try {
              
              if (db && firebaseUser.uid) {
                const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
                const firestoreData = userDoc.exists() ? userDoc.data() : {};
                
                const userData = {
                  id: firebaseUser.uid,
                  email: firebaseUser.email,
                  name: firebaseUser.displayName || firestoreData.name,
                  emailVerified: firebaseUser.emailVerified,
                  ...firestoreData,
                };
                
                setUser(userData);
                setIsAuthenticated(true);
                
                // Store user data securely
                await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
              } else {
                // Fallback if Firestore is not available
                const userData = {
                  id: firebaseUser.uid,
                  email: firebaseUser.email,
                  name: firebaseUser.displayName || 'User',
                  emailVerified: firebaseUser.emailVerified,
                };
                
                setUser(userData);
                setIsAuthenticated(true);
                
                await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
              }
            } catch (error) {
              console.error('Error fetching user data from Firestore:', error);
              
              // Fallback to basic Firebase Auth data
              const userData = {
                id: firebaseUser.uid,
                email: firebaseUser.email,
                name: firebaseUser.displayName || 'User',
                emailVerified: firebaseUser.emailVerified,
              };
              
              setUser(userData);
              setIsAuthenticated(true);
              
              // Store user data securely
              try {
                await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
              } catch (storageError) {
                console.error('Error storing user data:', storageError);
              }
            }
          } else {
            setUser(null);
            setIsAuthenticated(false);
            
            // Clear stored data
            try {
              await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_DATA);
              await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_TOKEN);
            } catch (error) {
              console.error('Error clearing stored data:', error);
            }
          }
          setIsLoading(false);
        });
      } catch (error) {
        console.error('Error initializing auth:', error);
        setIsLoading(false);
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Listen for app state changes to refresh user data when app becomes active
  useEffect(() => {
    const handleAppStateChange = async (nextAppState) => {
      if (nextAppState === 'active' && isAuthenticated && user) {
        // Small delay to ensure Firebase has time to update
        setTimeout(async () => {
          await refreshUser();
        }, 1000);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, [isAuthenticated, user]);

  // Check if user is already authenticated
  const checkAuthState = async () => {
    try {
      const storedUserData = await SecureStore.getItemAsync(STORAGE_KEYS.USER_DATA);
      const currentUser = AuthService.getCurrentUser();
      
      if (currentUser && storedUserData) {
        const userData = JSON.parse(storedUserData);
        setUser(userData);
        setIsAuthenticated(true);
        return;
      }
      
      // If no existing session, check for saved credentials and auto-sign in
      const credentialsResult = await loadSavedCredentials();
      
      if (credentialsResult.success && credentialsResult.credentials) {
        const { email, password } = credentialsResult.credentials;
        
        // Attempt automatic sign in
        const signInResult = await signInInternal(email, password);
        
        if (signInResult.success) {
          // User state will be updated by the signIn function
        } else {
          // Clear invalid credentials to prevent repeated failed attempts
          await clearSavedCredentials();
        }
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Sign up
  const signUp = async (email, password, userData = {}) => {
    setIsLoading(true);
    try {
      const result = await AuthService.signUp(email, password, userData);
      
      // Debug alert for physical device
      if (!result.success) {
        Alert.alert('Sign Up Debug', `Error: ${result.error?.message || 'Unknown error'}`);
      }
      
      if (result.success) {
        setUser(result.user);
        setIsAuthenticated(true);
        
        // Store user data
        await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(result.user));
        
        // Temporarily store credentials if email verification is needed
        if (result.needsEmailVerification) {
          const tempCredentials = { email, password };
          await SecureStore.setItemAsync(STORAGE_KEYS.TEMP_CREDENTIALS, JSON.stringify(tempCredentials));
        }
        
        return { 
          success: true, 
          needsEmailVerification: result.needsEmailVerification 
        };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Signup error:', error);
      // Provide more specific error message based on error type
      let errorMessage = 'An unexpected error occurred during sign up.';
      if (error.code) {
        // Use Firebase error message if available
        errorMessage = AuthService.getErrorMessage(error.code);
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      return {
        success: false,
        error: { message: errorMessage, code: error.code }
      };
    } finally {
      setIsLoading(false);
    }
  };

  // Internal sign in function (doesn't manage loading state)
  const signInInternal = async (email, password) => {
    try {
      const result = await AuthService.signIn(email, password);
      
      if (result.success) {
        setUser(result.user);
        setIsAuthenticated(true);
        
        // Store user data
        await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(result.user));
        
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('❌ Sign in error:', error);
      // Provide more specific error message based on error type
      let errorMessage = 'An unexpected error occurred during sign in.';
      if (error.code) {
        // Use Firebase error message if available
        errorMessage = AuthService.getErrorMessage(error.code);
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      return {
        success: false,
        error: { message: errorMessage, code: error.code }
      };
    }
  };

  // Sign in (public function that manages loading state)
  const signIn = async (email, password) => {
    setIsLoading(true);
    try {
      const result = await signInInternal(email, password);
      
      // Debug alert for physical device
      if (!result.success) {
        Alert.alert('Sign In Debug', `Error: ${result.error?.message || 'Unknown error'}`);
      }
      
      return result;
    } catch (error) {
      Alert.alert('Sign In Error', `Catch block: ${error.message}`);
      return { success: false, error: { message: 'An unexpected error occurred. Please try again.' } };
    } finally {
      setIsLoading(false);
    }
  };


  // Test function to verify SecureStore is working
  const testSecureStore = async () => {
    try {
      const testKey = 'testKey';
      const testValue = 'testValue';
      
      // Save test value
      await SecureStore.setItemAsync(testKey, testValue);
      
      // Immediately load test value
      const loadedValue = await SecureStore.getItemAsync(testKey);
      
      // Clean up
      await SecureStore.deleteItemAsync(testKey);
      
      return loadedValue === testValue;
    } catch (error) {
      console.error('🧪 SecureStore test failed:', error);
      return false;
    }
  };

  // Sign out
  const signOut = async () => {
    setIsLoading(true);
    try {
      const result = await AuthService.signOut();
      
      if (result.success) {
        setUser(null);
        setIsAuthenticated(false);
        
        // Clear ALL stored data including temporary credentials
        await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_DATA);
        await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_TOKEN);
        await SecureStore.deleteItemAsync(STORAGE_KEYS.TEMP_CREDENTIALS);
        // Note: We intentionally DO NOT clear STORAGE_KEYS.SAVED_CREDENTIALS for auto-login
        
        // Force a longer delay to ensure state is completely cleared
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      return {
        success: false,
        error: { message: 'An unexpected error occurred during sign out.' }
      };
    } finally {
      setIsLoading(false);
    }
  };

  // Reset password
  const resetPassword = async (email) => {
    try {
      const result = await AuthService.resetPassword(email);
      return result;
    } catch (error) {
      return {
        success: false,
        error: { message: 'An unexpected error occurred while resetting password.' }
      };
    }
  };

  // Save credentials for persistence (Demo purposes - not recommended for production)
  const saveCredentials = async (email, password) => {
    try {
      const credentials = { email, password };
      await SecureStore.setItemAsync(STORAGE_KEYS.SAVED_CREDENTIALS, JSON.stringify(credentials));
      
      // Immediately verify they were saved
      const verification = await SecureStore.getItemAsync(STORAGE_KEYS.SAVED_CREDENTIALS);
      
      // Wait a moment and try again to test timing
      await new Promise(resolve => setTimeout(resolve, 100));
      const delayedVerification = await SecureStore.getItemAsync(STORAGE_KEYS.SAVED_CREDENTIALS);
      
      return { success: true };
    } catch (error) {
      console.error('❌ Error saving credentials:', error);
      return { success: false };
    }
  };

  // Load saved credentials
  const loadSavedCredentials = async () => {
    try {
      const storedCredentials = await SecureStore.getItemAsync(STORAGE_KEYS.SAVED_CREDENTIALS);
      if (storedCredentials) {
        const credentials = JSON.parse(storedCredentials);
        return { success: true, credentials };
      }
      return { success: false, credentials: null };
    } catch (error) {
      console.error('❌ Error loading credentials:', error);
      return { success: false, credentials: null };
    }
  };

  // Clear saved credentials
  const clearSavedCredentials = async () => {
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.SAVED_CREDENTIALS);
      return { success: true };
    } catch (error) {
      console.error('Error clearing credentials:', error);
      return { success: false };
    }
  };

  // Clear ALL data including saved credentials (for testing)
  const clearAllData = async () => {
    try {
      setUser(null);
      setIsAuthenticated(false);
      
      // Clear ALL stored data
      await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_DATA);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_TOKEN);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.SAVED_CREDENTIALS);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.TEMP_CREDENTIALS);
      
      return { success: true };
    } catch (error) {
      console.error('Error clearing all data:', error);
      return { success: false, error: error.message };
    }
  };

  // Save temporary credentials permanently after email verification
  const saveCredentialsAfterVerification = async () => {
    try {
      const tempCredentials = await SecureStore.getItemAsync(STORAGE_KEYS.TEMP_CREDENTIALS);
      
      if (tempCredentials) {
        const credentials = JSON.parse(tempCredentials);
        
        // Save credentials permanently
        await SecureStore.setItemAsync(STORAGE_KEYS.SAVED_CREDENTIALS, JSON.stringify(credentials));
        
        // Clear temporary credentials
        await SecureStore.deleteItemAsync(STORAGE_KEYS.TEMP_CREDENTIALS);
        
        return { success: true };
      } else {
        return { success: false, error: 'No temporary credentials found' };
      }
    } catch (error) {
      console.error('❌ Error saving credentials after verification:', error);
      return { success: false, error: error.message };
    }
  };

  // Send email verification
  const sendEmailVerification = async () => {
    setIsLoading(true);
    try {
      const result = await AuthService.sendEmailVerification();
      return result;
    } catch (error) {
      return {
        success: false,
        error: { message: 'Failed to send verification email. Please try again.' }
      };
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh current user data (to detect email verification changes)
  const refreshUser = async () => {
    try {
      const currentUser = AuthService.getCurrentUser();
      if (currentUser) {
        // Wait a moment to ensure auth token is ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Reload the user to get fresh data from Firebase
        await currentUser.reload();
        
        // Fetch updated user data from Firestore
        try {
          
          // Double-check that user is still authenticated before Firestore call
          const authUser = AuthService.getCurrentUser();
          if (db && authUser && authUser.uid === currentUser.uid) {
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            const firestoreData = userDoc.exists() ? userDoc.data() : {};
            
            // Handle Firebase email verification inconsistency
            const isVerifiedCheck = await AuthService.isEmailVerified();
            const reloadVerified = currentUser.emailVerified;
            
            // If there's a discrepancy, trust the isEmailVerified() function
            const finalEmailVerified = isVerifiedCheck || reloadVerified;
            
            // Exclude emailVerified from Firestore data to prevent override
            const { emailVerified: firestoreEmailVerified, ...safeFirestoreData } = firestoreData;
            
            const userData = {
              id: currentUser.uid,
              email: currentUser.email,
              name: currentUser.displayName || firestoreData.name,
              ...safeFirestoreData, // Spread Firestore data first
              emailVerified: finalEmailVerified, // Then override with Firebase Auth status
            };
            
            setUser(userData);
            setIsAuthenticated(true);
            
            // Store user data securely
            await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
            
            return { success: true, user: userData };
          } else {
            // If no Firestore access, continue with basic Firebase Auth data
            const firestoreData = {};
            
            // Continue with the same logic as if Firestore succeeded
            const isVerifiedCheck = await AuthService.isEmailVerified();
            const reloadVerified = currentUser.emailVerified;
            const finalEmailVerified = isVerifiedCheck || reloadVerified;
            
            const userData = {
              id: currentUser.uid,
              email: currentUser.email,
              name: currentUser.displayName || 'User',
              emailVerified: finalEmailVerified,
            };
            
            setUser(userData);
            setIsAuthenticated(true);
            
            await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
            
            return { success: true, user: userData };
          }
        } catch (error) {
          console.error('Error fetching updated user data from Firestore:', error);
          
          // Fallback to basic Firebase Auth data
          const isVerifiedCheck = await AuthService.isEmailVerified();
          const reloadVerified = currentUser.emailVerified;
          const finalEmailVerified = isVerifiedCheck || reloadVerified;
          
          const userData = {
            id: currentUser.uid,
            email: currentUser.email,
            name: currentUser.displayName || 'User',
            emailVerified: finalEmailVerified,
          };
          
          setUser(userData);
          setIsAuthenticated(true);
          
          await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
          
          return { success: true, user: userData };
        }
      }
      
      return { success: false, error: 'No current user' };
    } catch (error) {
      console.error('Error refreshing user:', error);
      return { success: false, error: error.message };
    }
  };

  // Check if current user's email is verified
  const isEmailVerified = async () => {
    try {
      return await AuthService.isEmailVerified();
    } catch (error) {
      console.error('Error checking email verification:', error);
      return false;
    }
  };

  // Manual override for email verification (debug/temporary)
  const forceEmailVerified = async () => {
    try {
      if (user) {
        const updatedUser = { ...user, emailVerified: true };
        setUser(updatedUser);
        
        // Store updated user data
        await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(updatedUser));
        
        return { success: true };
      }
      return { success: false, error: 'No user to update' };
    } catch (error) {
      console.error('Error in manual override:', error);
      return { success: false, error: error.message };
    }
  };

  // Update user profile in Firestore and local state
  const updateUserProfile = async (profileData) => {
    try {
      if (!user || !user.id) {
        return { success: false, error: 'No user to update' };
      }

      // Update user data in Firestore
      
      if (db && user.id) {
        await updateDoc(doc(db, 'users', user.id), {
          ...profileData,
          updatedAt: new Date().toISOString(),
        });
      }

      // Update local user state
      const updatedUser = { ...user, ...profileData };
      setUser(updatedUser);
      
      // Store updated user data
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_DATA, JSON.stringify(updatedUser));
      
      return { success: true, user: updatedUser };
    } catch (error) {
      console.error('Error updating user profile:', error);
      return { success: false, error: error.message };
    }
  };

  const value = {
    user,
    isAuthenticated,
    isLoading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    saveCredentials,
    loadSavedCredentials,
    clearSavedCredentials,
    clearAllData, // Add function to clear all data
    saveCredentialsAfterVerification, // Add function to save credentials after verification
    sendEmailVerification,
    isEmailVerified,
    refreshUser, // Add refresh function
    forceEmailVerified, // Add manual override function
    updateUserProfile, // Add profile update function
    testSecureStore, // Add test function
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
