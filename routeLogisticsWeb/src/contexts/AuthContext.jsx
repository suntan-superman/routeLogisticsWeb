import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../services/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification
} from 'firebase/auth';
import { syncTenancy, loadClaims } from '../services/tenancy';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);
  const [sessionVersion, setSessionVersion] = useState(0);
  const refreshSession = async () => {
    const user = auth.currentUser;
    if (!user) return;
    await user.reload();
    await user.getIdToken(true);
    await syncTenancy();
    const profile = await getDoc(doc(db, 'users', user.uid));
    setUserProfile(profile.exists() ? profile.data() : null);
    setEmailVerified(user.emailVerified);
    setSessionVersion((version) => version + 1);
  };

  // Sign up function
  const signup = async (email, password, userData) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update the user's display name
      await updateProfile(user, {
        displayName: userData.name
      });

      // Create user profile in Firestore
      const userProfileData = {
        id: user.uid,
        email: user.email,
        name: userData.name,
        phoneNumber: userData.phoneNumber || '',
        businessName: userData.businessName || '',
        address: userData.address || '',
        services: userData.services || [],
        serviceCategories: userData.serviceCategories || [],
        notificationsEnabled: true,
        emailNotifications: true,
        smsNotifications: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        companyId: null // Set when a company is created; roles/claims are server-managed
      };

      await setDoc(doc(db, 'users', user.uid), userProfileData);
      // Invites are matched by verified email, so verification is required before joining a company.
      sendEmailVerification(user).catch((e) => console.error('Verification email failed', e));
      
      setUserProfile(userProfileData);
      toast.success('Account created successfully!');
      
      return { success: true, user };
    } catch (error) {
      console.error('Signup error:', error);
      
      // Provide cleaner, more professional error messages
      let errorMessage = 'Unable to create account. Please try again.';
      
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'An account with this email already exists. Please sign in instead.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Please enter a valid email address.';
          break;
        case 'auth/weak-password':
          errorMessage = 'Password should be at least 6 characters long.';
          break;
        case 'auth/operation-not-allowed':
          errorMessage = 'Account creation is currently disabled. Please contact support.';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Network error. Please check your connection and try again.';
          break;
        default:
          errorMessage = 'Unable to create account. Please check your information and try again.';
      }
      
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // Sign in function
  const signin = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Fetch user profile
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        setUserProfile(userDoc.data());
      }
      
      toast.success('Welcome back!');
      return { success: true, user };
    } catch (error) {
      console.error('Signin error:', error);
      
      // Provide cleaner, more professional error messages
      let errorMessage = 'An unexpected error occurred. Please try again.';
      
      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errorMessage = 'Incorrect email or password. Please check your credentials and try again.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Please enter a valid email address.';
          break;
        case 'auth/user-disabled':
          errorMessage = 'This account has been disabled. Please contact support.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many failed attempts. Please try again later.';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Network error. Please check your connection and try again.';
          break;
        default:
          errorMessage = 'Unable to sign in. Please check your credentials and try again.';
      }
      
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  // Sign out function
  const logout = async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
      toast.success('Signed out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Error signing out');
    }
  };

  // Update user profile
  const updateUserProfile = async (updates) => {
    try {
      if (!currentUser) return { success: false, error: 'No user logged in' };

      const updatedProfile = {
        ...userProfile,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', currentUser.uid), updatedProfile, { merge: true });
      setUserProfile(updatedProfile);
      
      toast.success('Profile updated successfully');
      return { success: true };
    } catch (error) {
      console.error('Update profile error:', error);
      toast.error('Error updating profile');
      return { success: false, error: error.message };
    }
  };

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setCurrentUser(user);
      setEmailVerified(user?.emailVerified === true);
      
      if (user) {
        // Resolve tenancy claims before any data query runs so scope is correct from first render.
        try {
          await loadClaims(user);
          await syncTenancy();
        } catch (error) {
          console.error('Error resolving tenancy:', error);
        }
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setUserProfile(userDoc.data());
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }
      } else {
        await loadClaims(null);
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userProfile,
    loading,
    signup,
    signin,
    logout,
    updateUserProfile, refreshSession, emailVerified, sessionVersion
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
