// Firebase Authentication Service for Route Logisitcs
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, collection, addDoc, getDocs, deleteDoc, query, where, orderBy } from 'firebase/firestore';
import { auth, db } from '../constants/firebase';

export class AuthService {
  // Check if Firebase Auth is available
  static isAuthAvailable() {
    return !!auth;
  }

  // Get current user
  static getCurrentUser() {
    return auth.currentUser;
  }

  // Sign in with email and password
  static async signIn(email, password) {
    try {
      // Check if auth is available
      if (!auth) {
        return { success: false, error: { message: 'Firebase auth not initialized' } };
      }
      
      // Try to sign in with Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Get user data from Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};
      
      const completeUserData = {
        id: user.uid,
        email: user.email,
        name: user.displayName || userData.name || 'User',
        emailVerified: user.emailVerified,
        ...userData,
      };
      
      return {
        success: true,
        user: completeUserData,
        needsEmailVerification: !user.emailVerified
      };
    } catch (error) {
      console.error('Sign in error:', error);
      return {
        success: false,
        error: {
          message: this.getErrorMessage(error.code),
          code: error.code
        }
      };
    }
  }

  // Sign up with email and password
  static async signUp(email, password, userData = {}) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Update profile with display name if provided
      if (userData.name) {
        await updateProfile(user, {
          displayName: userData.name
        });
      }
      
      // Create user document in Firestore
      const userDocData = {
        name: userData.name || 'User',
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...userData
      };
      
      await setDoc(doc(db, 'users', user.uid), userDocData);
      
      const completeUserData = {
        id: user.uid,
        email: user.email,
        name: userData.name || 'User',
        emailVerified: user.emailVerified,
        ...userDocData
      };
      
      return {
        success: true,
        user: completeUserData,
        needsEmailVerification: !user.emailVerified
      };
    } catch (error) {
      console.error('Sign up error:', error);
      return {
        success: false,
        error: {
          message: this.getErrorMessage(error.code),
          code: error.code
        }
      };
    }
  }

  // Sign out
  static async signOut() {
    try {
      await firebaseSignOut(auth);
      return { success: true };
    } catch (error) {
      console.error('Sign out error:', error);
      return {
        success: false,
        error: {
          message: 'Failed to sign out',
          code: error.code
        }
      };
    }
  }

  // Reset password
  static async resetPassword(email) {
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (error) {
      console.error('Reset password error:', error);
      return {
        success: false,
        error: {
          message: this.getErrorMessage(error.code),
          code: error.code
        }
      };
    }
  }

  // Send email verification
  static async sendEmailVerification() {
    try {
      const user = auth.currentUser;
      if (!user) {
        return {
          success: false,
          error: { message: 'No user is currently signed in' }
        };
      }
      
      await sendEmailVerification(user);
      return { success: true };
    } catch (error) {
      console.error('Send email verification error:', error);
      return {
        success: false,
        error: {
          message: this.getErrorMessage(error.code),
          code: error.code
        }
      };
    }
  }

  // Check if email is verified
  static async isEmailVerified() {
    try {
      const user = auth.currentUser;
      if (!user) return false;
      
      // Reload user to get fresh data
      await user.reload();
      return user.emailVerified;
    } catch (error) {
      console.error('Email verification check error:', error);
      return false;
    }
  }

  // Listen to auth state changes
  static onAuthStateChanged(callback) {
    return auth.onAuthStateChanged(callback);
  }

  // Update user profile
  static async updateUserProfile(profileData) {
    try {
      const user = auth.currentUser;
      if (!user) {
        return {
          success: false,
          error: { message: 'No user is currently signed in' }
        };
      }
      
      // Update Firebase Auth profile
      if (profileData.name) {
        await updateProfile(user, {
          displayName: profileData.name
        });
      }
      
      // Update Firestore document
      await updateDoc(doc(db, 'users', user.uid), {
        ...profileData,
        updatedAt: new Date().toISOString()
      });
      
      return { success: true };
    } catch (error) {
      console.error('Update profile error:', error);
      return {
        success: false,
        error: {
          message: this.getErrorMessage(error.code),
          code: error.code
        }
      };
    }
  }

  // Get user-friendly error messages
  static getErrorMessage(errorCode) {
    const errorMessages = {
      'auth/user-not-found': 'No account found with this email address.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/email-already-in-use': 'An account already exists with this email address.',
      'auth/weak-password': 'Password should be at least 6 characters.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Please check your connection.',
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/requires-recent-login': 'Please sign in again to complete this action.',
    };
    
    return errorMessages[errorCode] || 'An unexpected error occurred. Please try again.';
  }
}

export class CustomerService {
  // Get current user ID
  static getCurrentUserId() {
    const user = auth.currentUser;
    return user ? user.uid : null;
  }

  // Add a new customer
  static async addCustomer(customerData) {
    try {
      const userId = this.getCurrentUserId();
      if (!userId) {
        return {
          success: false,
          error: { message: 'No user is currently signed in' }
        };
      }

      const customerDoc = {
        ...customerData,
        userId: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'customers'), customerDoc);
      
      return {
        success: true,
        customer: {
          id: docRef.id,
          ...customerDoc
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to add customer',
          code: error.code
        }
      };
    }
  }

  // Get all customers for the current user
  static async getCustomers() {
    try {
      const userId = this.getCurrentUserId();
      if (!userId) {
        return {
          success: false,
          error: { message: 'No user is currently signed in' }
        };
      }

      const q = query(
        collection(db, 'customers'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const customers = [];
      
      querySnapshot.forEach((doc) => {
        customers.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return {
        success: true,
        customers: customers
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to fetch customers',
          code: error.code
        }
      };
    }
  }

  // Update a customer
  static async updateCustomer(customerId, customerData) {
    try {
      const userId = this.getCurrentUserId();
      if (!userId) {
        return {
          success: false,
          error: { message: 'No user is currently signed in' }
        };
      }

      await updateDoc(doc(db, 'customers', customerId), {
        ...customerData,
        updatedAt: new Date().toISOString()
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to update customer',
          code: error.code
        }
      };
    }
  }

  // Delete a customer
  static async deleteCustomer(customerId) {
    try {
      const userId = this.getCurrentUserId();
      if (!userId) {
        return {
          success: false,
          error: { message: 'No user is currently signed in' }
        };
      }

      await deleteDoc(doc(db, 'customers', customerId));

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to delete customer',
          code: error.code
        }
      };
    }
  }
}

export class EstimateService {
  // Get current user ID
  static getCurrentUserId() {
    const user = auth.currentUser;
    return user ? user.uid : null;
  }

  // Add a new estimate
  static async addEstimate(estimateData) {
    try {
      const userId = this.getCurrentUserId();
      if (!userId) {
        return {
          success: false,
          error: { message: 'No user is currently signed in' }
        };
      }

      // Generate estimate number
      const estimateNumber = await this.generateEstimateNumber();
      
      const estimateDoc = {
        ...estimateData,
        userId: userId,
        estimateNumber: estimateNumber,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        validUntil: this.calculateValidUntil(),
      };

      const docRef = await addDoc(collection(db, 'estimates'), estimateDoc);
      
      return {
        success: true,
        estimate: {
          id: docRef.id,
          ...estimateDoc
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to add estimate',
          code: error.code
        }
      };
    }
  }

  // Get all estimates for the current user
  static async getEstimates() {
    try {
      const userId = this.getCurrentUserId();
      console.log('EstimateService - Current user ID:', userId);
      
      if (!userId) {
        console.log('EstimateService - No user ID found');
        return {
          success: false,
          error: { message: 'No user is currently signed in' }
        };
      }

      console.log('EstimateService - Querying estimates for user:', userId);
      const q = query(
        collection(db, 'estimates'),
        where('userId', '==', userId)
      );
      
      const querySnapshot = await getDocs(q);
      console.log('EstimateService - Query snapshot size:', querySnapshot.size);
      
      const estimates = [];
      
      querySnapshot.forEach((doc) => {
        console.log('EstimateService - Found estimate:', doc.id);
        estimates.push({
          id: doc.id,
          ...doc.data()
        });
      });

      // Sort by createdAt descending (newest first)
      estimates.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateB - dateA;
      });

      console.log('EstimateService - Returning estimates:', estimates.length);
      return {
        success: true,
        estimates: estimates
      };
    } catch (error) {
      console.error('EstimateService - Error fetching estimates:', error);
      return {
        success: false,
        error: {
          message: 'Failed to fetch estimates',
          code: error.code,
          details: error.message
        }
      };
    }
  }

  // Update an estimate
  static async updateEstimate(estimateId, estimateData) {
    try {
      const userId = this.getCurrentUserId();
      if (!userId) {
        return {
          success: false,
          error: { message: 'No user is currently signed in' }
        };
      }

      await updateDoc(doc(db, 'estimates', estimateId), {
        ...estimateData,
        updatedAt: new Date().toISOString()
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to update estimate',
          code: error.code
        }
      };
    }
  }

  // Delete an estimate
  static async deleteEstimate(estimateId) {
    try {
      const userId = this.getCurrentUserId();
      if (!userId) {
        return {
          success: false,
          error: { message: 'No user is currently signed in' }
        };
      }

      await deleteDoc(doc(db, 'estimates', estimateId));
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to delete estimate',
          code: error.code
        }
      };
    }
  }

  // Generate estimate number (EST-YYYY-XXX format)
  static async generateEstimateNumber() {
    try {
      const userId = this.getCurrentUserId();
      if (!userId) return 'EST-2025-001';

      const year = new Date().getFullYear();
      const q = query(
        collection(db, 'estimates'),
        where('userId', '==', userId),
        where('estimateNumber', '>=', `EST-${year}-001`),
        where('estimateNumber', '<=', `EST-${year}-999`),
        orderBy('estimateNumber', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      let nextNumber = 1;
      
      if (!querySnapshot.empty) {
        const lastEstimate = querySnapshot.docs[0].data();
        const lastNumber = parseInt(lastEstimate.estimateNumber.split('-')[2]);
        nextNumber = lastNumber + 1;
      }
      
      return `EST-${year}-${nextNumber.toString().padStart(3, '0')}`;
    } catch (error) {
      // Fallback to timestamp-based number
      return `EST-${new Date().getFullYear()}-${Date.now().toString().slice(-3)}`;
    }
  }

  // Calculate valid until date (30 days from now)
  static calculateValidUntil() {
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);
    return validUntil.toISOString().split('T')[0];
  }
}

export class JobService {
  // Get current user ID
  static getCurrentUserId() {
    const user = auth.currentUser;
    return user ? user.uid : null;
  }

  // Add a new job/appointment
  static async addJob(jobData) {
    try {
      const userId = this.getCurrentUserId();
      if (!userId) {
        return {
          success: false,
          error: { message: 'No user is currently signed in' }
        };
      }

      const jobDoc = {
        ...jobData,
        userId: userId,
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'jobs'), jobDoc);
      
      return {
        success: true,
        job: {
          id: docRef.id,
          ...jobDoc
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to add job',
          code: error.code
        }
      };
    }
  }

  // Get jobs for a specific date range
  static async getJobsByDateRange(startDate, endDate) {
    try {
      const userId = this.getCurrentUserId();
      if (!userId) {
        return {
          success: false,
          error: { message: 'No user is currently signed in' }
        };
      }

      const q = query(
        collection(db, 'jobs'),
        where('userId', '==', userId),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'asc'),
        orderBy('time', 'asc')
      );
      
      const querySnapshot = await getDocs(q);
      const jobs = [];
      
      querySnapshot.forEach((doc) => {
        jobs.push({
          id: doc.id,
          ...doc.data(),
        });
      });
      
      return { success: true, jobs };
    } catch (error) {
      return { success: false, error: error.message, jobs: [] };
    }
  }

  // Get jobs for today
  static async getTodaysJobs() {
    const today = new Date().toISOString().split('T')[0];
    return this.getJobsByDateRange(today, today);
  }

  // Get jobs for this week
  static async getThisWeeksJobs() {
    const today = new Date();
    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
    const endOfWeek = new Date(today.setDate(today.getDate() - today.getDay() + 6));
    
    return this.getJobsByDateRange(
      startOfWeek.toISOString().split('T')[0],
      endOfWeek.toISOString().split('T')[0]
    );
  }

  // Get jobs for this month
  static async getThisMonthsJobs() {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    return this.getJobsByDateRange(
      startOfMonth.toISOString().split('T')[0],
      endOfMonth.toISOString().split('T')[0]
    );
  }

  // Update a job
  static async updateJob(jobId, jobData) {
    try {
      const userId = this.getCurrentUserId();
      if (!userId) {
        return {
          success: false,
          error: { message: 'No user is currently signed in' }
        };
      }

      await updateDoc(doc(db, 'jobs', jobId), {
        ...jobData,
        updatedAt: new Date().toISOString(),
      });
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to update job',
          code: error.code
        }
      };
    }
  }

  // Delete a job
  static async deleteJob(jobId) {
    try {
      const userId = this.getCurrentUserId();
      if (!userId) {
        return {
          success: false,
          error: { message: 'No user is currently signed in' }
        };
      }

      await deleteDoc(doc(db, 'jobs', jobId));
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Failed to delete job',
          code: error.code
        }
      };
    }
  }
}

export default AuthService;
