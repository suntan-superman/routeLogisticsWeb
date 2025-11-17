import { 
  signInWithCustomToken, 
  signOut as firebaseSignOut,
  onAuthStateChanged 
} from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// Get project ID from Firebase config
const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'mi-factotum-field-service';
const FUNCTIONS_BASE_URL = `https://us-central1-${PROJECT_ID}.cloudfunctions.net`;

/**
 * Customer Authentication Service
 * Handles email-based OTP authentication for the customer portal
 */
class CustomerAuthService {
  /**
   * Request OTP for customer email
   * Sends 6-digit code via email
   */
  static async requestOTP(email) {
    try {
      if (!email || !email.includes('@')) {
        throw new Error('Invalid email address');
      }

      const response = await fetch(
        `${FUNCTIONS_BASE_URL}/requestCustomerOTP`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send OTP');
      }

      const data = await response.json();
      
      return {
        success: true,
        message: 'OTP sent to your email',
        otpId: data.otpId,
        expiresAt: data.expiresAt
      };
    } catch (error) {
      console.error('Error requesting OTP:', error);
      return {
        success: false,
        error: error.message || 'Failed to request OTP'
      };
    }
  }

  /**
   * Verify OTP and authenticate customer
   */
  static async verifyOTP(email, otp) {
    try {
      if (!email || !otp) {
        throw new Error('Email and OTP are required');
      }

      if (otp.length !== 6 || !/^\d+$/.test(otp)) {
        throw new Error('OTP must be 6 digits');
      }

      const response = await fetch(
        `${FUNCTIONS_BASE_URL}/verifyCustomerOTP`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, otp }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to verify OTP');
      }

      const data = await response.json();

      if (!data.customToken) {
        throw new Error('No authentication token received');
      }

      // Sign in with custom token
      const userCredential = await signInWithCustomToken(auth, data.customToken);

      // Fetch customer profile
      const customerProfile = await this.getCustomerProfile(userCredential.user.uid);

      // Store session info
      localStorage.setItem('customerEmail', email);
      localStorage.setItem('customerLoginTime', new Date().toISOString());
      localStorage.setItem('customerSessionId', data.sessionId || userCredential.user.uid);

      return {
        success: true,
        user: userCredential.user,
        profile: customerProfile,
        message: 'Successfully logged in'
      };
    } catch (error) {
      console.error('Error verifying OTP:', error);
      return {
        success: false,
        error: error.message || 'Failed to verify OTP'
      };
    }
  }

  /**
   * Get customer profile from Firestore
   */
  static async getCustomerProfile(customerId) {
    try {
      if (!customerId) {
        return null;
      }

      // Try new unified customers collection first
      let customerDoc = await getDoc(doc(db, 'customers', customerId));
      
      // Fallback to legacy collections
      if (!customerDoc.exists()) {
        customerDoc = await getDoc(doc(db, 'portalCustomers', customerId));
      }
      if (!customerDoc.exists()) {
        customerDoc = await getDoc(doc(db, 'customerProfiles', customerId));
      }

      if (!customerDoc.exists()) {
        console.log('Customer profile not found:', customerId);
        return null;
      }

      return {
        id: customerDoc.id,
        ...customerDoc.data()
      };
    } catch (error) {
      console.error('Error fetching customer profile:', error);
      return null;
    }
  }

  /**
   * Get current authenticated customer
   */
  static async getCurrentCustomer() {
    try {
      if (!auth.currentUser) {
        return null;
      }

      const profile = await this.getCustomerProfile(auth.currentUser.uid);
      
      if (profile) {
        return {
          id: auth.currentUser.uid,
          email: auth.currentUser.email,
          ...profile
        };
      }

      return null;
    } catch (error) {
      console.error('Error getting current customer:', error);
      return null;
    }
  }

  /**
   * Update customer profile
   * Updates in new customers collection
   */
  static async updateCustomerProfile(customerId, updates) {
    try {
      if (!customerId) {
        throw new Error('Customer ID is required');
      }

      const allowedFields = ['name', 'firstName', 'lastName', 'phone', 'phoneNumber', 'address', 'city', 'state', 'zipCode', 'preferences', 'photoURL'];
      const sanitizedUpdates = {};

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          sanitizedUpdates[key] = value;
        }
      }

      sanitizedUpdates.updatedAt = serverTimestamp();

      // Update in new customers collection
      const customerRef = doc(db, 'customers', customerId);
      await setDoc(customerRef, sanitizedUpdates, { merge: true });

      return {
        success: true,
        message: 'Profile updated successfully'
      };
    } catch (error) {
      console.error('Error updating customer profile:', error);
      return {
        success: false,
        error: error.message || 'Failed to update profile'
      };
    }
  }

  /**
   * Sign out customer
   */
  static async signOut() {
    try {
      // Clear session storage
      localStorage.removeItem('customerEmail');
      localStorage.removeItem('customerLoginTime');
      localStorage.removeItem('customerSessionId');

      // Sign out from Firebase
      await firebaseSignOut(auth);

      return {
        success: true,
        message: 'Successfully signed out'
      };
    } catch (error) {
      console.error('Error signing out:', error);
      return {
        success: false,
        error: error.message || 'Failed to sign out'
      };
    }
  }

  /**
   * Check if customer is authenticated
   */
  static isAuthenticated() {
    return auth.currentUser !== null;
  }

  /**
   * Get current user ID
   */
  static getCurrentUserId() {
    return auth.currentUser?.uid || null;
  }

  /**
   * Subscribe to auth state changes
   */
  static onAuthStateChanged(callback) {
    return onAuthStateChanged(auth, callback);
  }

  /**
   * Request password reset (for future use)
   */
  static async requestPasswordReset(email) {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_FUNCTIONS_URL}/sendPasswordReset`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send reset email');
      }

      return {
        success: true,
        message: 'Reset email sent'
      };
    } catch (error) {
      console.error('Error requesting password reset:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate session (check if still authenticated and session not expired)
   */
  static async validateSession() {
    try {
      if (!auth.currentUser) {
        return {
          valid: false,
          reason: 'Not authenticated'
        };
      }

      const sessionId = localStorage.getItem('customerSessionId');
      const loginTime = localStorage.getItem('customerLoginTime');

      if (!loginTime) {
        return {
          valid: false,
          reason: 'No session info'
        };
      }

      // Check if session expired (30 minutes)
      const loginDate = new Date(loginTime);
      const now = new Date();
      const minutesElapsed = (now - loginDate) / (1000 * 60);

      if (minutesElapsed > 30) {
        // Session expired
        await this.signOut();
        return {
          valid: false,
          reason: 'Session expired'
        };
      }

      // Fetch fresh profile to verify customer still exists
      const profile = await this.getCustomerProfile(auth.currentUser.uid);
      
      if (!profile) {
        return {
          valid: false,
          reason: 'Customer profile not found'
        };
      }

      return {
        valid: true,
        profile
      };
    } catch (error) {
      console.error('Error validating session:', error);
      return {
        valid: false,
        reason: error.message
      };
    }
  }

  /**
   * Extend session
   */
  static extendSession() {
    try {
      localStorage.setItem('customerLoginTime', new Date().toISOString());
      return { success: true };
    } catch (error) {
      console.error('Error extending session:', error);
      return { success: false };
    }
  }
}

export default CustomerAuthService;

