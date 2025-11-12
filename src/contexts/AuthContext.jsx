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
import { doc, getDoc, setDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import CompanyService from '../services/companyService';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Super Admin Configuration
const SUPER_ADMIN_EMAIL = 'sroy@worksidesoftware.com';

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check if current user is super admin
  const isSuperAdmin = () => {
    return currentUser?.email === SUPER_ADMIN_EMAIL || userProfile?.email === SUPER_ADMIN_EMAIL;
  };

  // Check if user needs company setup (admin without company)
  const needsCompanySetup = () => {
    if (isSuperAdmin()) return false; // Super admin doesn't need company setup
    return userProfile?.role === 'admin' && !userProfile?.companyId;
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

      // Send email verification
      // Firebase will send an email with a link that goes through Firebase's action handler
      // The link will include action code parameters that we handle in EmailVerificationPage
      // Make sure your domain is added to Authorized domains in Firebase Console:
      // Authentication → Settings → Authorized domains
      try {
        await sendEmailVerification(user);
        console.log('Verification email sent successfully to:', user.email);
      } catch (emailError) {
        console.error('Error sending verification email:', emailError);
        // Don't fail the signup if email fails, but log it
        // User can resend from verification page
      }

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
        companyId: userData.companyId || null, // Accept companyId from userData if provided (for invitations)
        role: userData.role || 'admin', // Use provided role or default to admin
        emailVerified: false, // Track verification status
        joinedViaInvitation: userData.joinedViaInvitation || false
      };

      await setDoc(doc(db, 'users', user.uid), userProfileData);
      console.log('[AuthContext.signup] User profile created with companyId:', userProfileData.companyId);
      
      // Store signup data temporarily for pre-filling Company Setup
      if (userData.businessName || userData.address || userData.phoneNumber) {
        const signupCompanyData = {
          name: userData.businessName || '',
          phone: userData.phoneNumber || '',
          address: userData.address || '',
          city: userData.city || '',
          state: userData.state || '',
          zipCode: userData.zipCode || '',
          email: email
        };
        localStorage.setItem('pendingCompanyData', JSON.stringify(signupCompanyData));
      }
      
      // Sign out user so they must verify email first
      await signOut(auth);
      
      toast.success('Account created! Please check your email to verify your account.');
      
      return { 
        success: true, 
        user,
        needsEmailVerification: true,
        email: user.email
      };
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
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      let profileData;

      if (userDoc.exists()) {
        profileData = userDoc.data();
        setUserProfile(profileData);

        if (profileData.role === 'admin' && !profileData.companyId && email !== SUPER_ADMIN_EMAIL) {
          const claimResult = await CompanyService.claimPendingCompanyOwnership();
          if (claimResult.success && claimResult.claimedCompanies?.length) {
            const refreshedDoc = await getDoc(userDocRef);
            if (refreshedDoc.exists()) {
              profileData = refreshedDoc.data();
              setUserProfile(profileData);
            }
          }
        }
      } else {
        // User profile doesn't exist, create minimal one
        const minimalProfile = {
          id: user.uid,
          email: user.email,
          name: user.displayName || '',
          role: 'field_tech',
          companyId: null,
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'users', user.uid), minimalProfile);
        let finalProfile = minimalProfile;

        const claimResult = await CompanyService.claimPendingCompanyOwnership();
        if (claimResult.success && claimResult.claimedCompanies?.length) {
          const refreshedDoc = await getDoc(userDocRef);
          if (refreshedDoc.exists()) {
            finalProfile = refreshedDoc.data();
          }
        }

        setUserProfile(finalProfile);
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
      setCurrentUser(user);
      
      if (user) {
        // Fetch user profile when user signs in
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const profileData = userDoc.data();

            if (profileData.role === 'admin' && !profileData.companyId && user.email !== SUPER_ADMIN_EMAIL) {
              const claimResult = await CompanyService.claimPendingCompanyOwnership();
              if (claimResult.success && claimResult.claimedCompanies?.length) {
                const refreshedDoc = await getDoc(userDocRef);
                if (refreshedDoc.exists()) {
                  setUserProfile(refreshedDoc.data());
                  setLoading(false);
                  return;
                }
              }
            }

            setUserProfile(profileData);
          } else {
            setUserProfile(null);
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }
      } else {
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
    updateUserProfile,
    isSuperAdmin: isSuperAdmin(),
    needsCompanySetup: needsCompanySetup()
  };

  // Always provide a value, even during initialization
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Export a safe version that doesn't throw during initialization
export const useAuthSafe = () => {
  const context = useContext(AuthContext);
  return context; // Return undefined/null if not available instead of throwing
};
