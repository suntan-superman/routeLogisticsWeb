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
import { scopeWhere, tenantFields, localDate, getClaims } from './tenancy';
import { cachedRead, overlayJobs, readCache, writeCache, saveJobOffline, isOffline } from './offline';

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


        name: user.displayName || userData.name || 'User',

        ...userData,
        id: user.uid, email: user.email, emailVerified: user.emailVerified,
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
        email: (customerData.email || '').trim().toLowerCase(),
        emailNormalized: (customerData.email || '').trim().toLowerCase(),
        isActive: true,
        ...tenantFields(),
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
        scopeWhere(),
        orderBy('createdAt', 'desc')
      );

      const customers = await cachedRead('customers', async () => {
        const snapshot = await getDocs(q);
        return snapshot.docs.map((row) => { const data = row.data(); return { id: row.id, name: data.name?.trim() || data.displayName || [data.firstName, data.lastName].filter(Boolean).join(' ') || 'Name not provided', phone: data.phone || data.phoneNumber || '', email: data.email || '', address: typeof data.address === 'string' ? data.address : data.address?.street || '', city: data.city || '', state: data.state || '', zipCode: data.zipCode || '' }; });
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
        ...tenantFields(),
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

      if (!userId) {
        return {
          success: false,
          error: { message: 'No user is currently signed in' }
        };
      }

      const q = query(
        collection(db, 'estimates'),
        scopeWhere()
      );

      const querySnapshot = await getDocs(q);

      const estimates = [];

      querySnapshot.forEach((doc) => {
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
        scopeWhere(),
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
        totalCost: Number(jobData.totalCost ?? jobData.estimatedCost) || 0,
        estimatedDuration: Number(jobData.estimatedDuration ?? jobData.duration) || 1,
        time: normalizeTime(jobData.time),
        ...tenantFields(),
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
        scopeWhere(),
        ...(getClaims()?.role === 'technician' ? [where('assignedTo', '==', getClaims().membershipId)] : []),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'asc'),
        orderBy('time', 'asc')
      );

      const loaded = await cachedRead(`jobs:${startDate}:${endDate}`, async (scope) => {
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((row) => ({ id: row.id, ...row.data() }));
        const bases = await readCache('job-bases', scope) || {};
        data.forEach((job) => { bases[job.id] = job; });
        await writeCache('job-bases', bases, scope);
        return data;
      });
      const jobs = await overlayJobs(loaded);

      return { success: true, jobs };
    } catch (error) {
      return { success: false, error: error.message, jobs: [] };
    }
  }

  // Get jobs for today
  static async getTodaysJobs() {
    const today = localDate();
    return this.getJobsByDateRange(today, today);
  }

  // Get jobs for this week
  static async getThisWeeksJobs() {
    const today = new Date();
    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
    const endOfWeek = new Date(today.setDate(today.getDate() - today.getDay() + 6));

    return this.getJobsByDateRange(
      localDate(startOfWeek),
      localDate(endOfWeek)
    );
  }

  // Get jobs for this month
  static async getThisMonthsJobs() {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    return this.getJobsByDateRange(
      localDate(startOfMonth),
      localDate(endOfMonth)
    );
  }

  // Update a job
  static async updateJob(jobId, jobData) {
    try {
      const supported = ['status', 'notes', 'actualWorkDone', 'actualHours', 'completionNotes', 'completedAt'];
      if (Object.keys(jobData).every((key) => supported.includes(key))) return await saveJobOffline(jobId, jobData);
      if (await isOffline()) throw new Error('Scheduling and pricing changes require an internet connection. Work notes and completion details can be saved offline.');
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
          message: error.message || 'Failed to update job',
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

function normalizeTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) throw new Error('Choose a valid job time.');
  let hour = Number(match[1]);
  if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  if (hour > 23 || Number(match[2]) > 59) throw new Error('Choose a valid job time.');
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}
