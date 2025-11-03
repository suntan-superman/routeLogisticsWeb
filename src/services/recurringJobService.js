import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  getDocs, 
  query, 
  where,
  addDoc,
  deleteDoc,
  orderBy
} from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './firebase';

class RecurringJobService {
  // Get current user ID
  static getCurrentUserId() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No user is currently signed in');
    }
    return user.uid;
  }

  /**
   * Create a new recurring job template
   */
  static async createRecurringJob(recurringJobData) {
    try {
      const userId = this.getCurrentUserId();
      
      const recurringJob = {
        ...recurringJobData,
        userId,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'recurringJobs'), recurringJob);

      return {
        success: true,
        recurringJobId: docRef.id,
        recurringJob: { id: docRef.id, ...recurringJob }
      };
    } catch (error) {
      console.error('Error creating recurring job:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get all recurring jobs for the current user
   */
  static async getRecurringJobs() {
    try {
      const userId = this.getCurrentUserId();
      
      const q = query(
        collection(db, 'recurringJobs'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const recurringJobs = [];
      
      querySnapshot.forEach((doc) => {
        recurringJobs.push({ id: doc.id, ...doc.data() });
      });

      return {
        success: true,
        recurringJobs
      };
    } catch (error) {
      console.error('Error getting recurring jobs:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get a recurring job by ID
   */
  static async getRecurringJob(recurringJobId) {
    try {
      const userId = this.getCurrentUserId();
      const recurringJobDoc = await getDoc(doc(db, 'recurringJobs', recurringJobId));
      
      if (!recurringJobDoc.exists()) {
        return {
          success: false,
          error: 'Recurring job not found'
        };
      }

      const recurringJobData = recurringJobDoc.data();
      
      // Verify user owns this recurring job
      if (recurringJobData.userId !== userId) {
        return {
          success: false,
          error: 'Unauthorized to access this recurring job'
        };
      }

      return {
        success: true,
        recurringJob: { id: recurringJobDoc.id, ...recurringJobData }
      };
    } catch (error) {
      console.error('Error getting recurring job:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update a recurring job
   */
  static async updateRecurringJob(recurringJobId, updates) {
    try {
      const userId = this.getCurrentUserId();
      
      // Verify user owns the recurring job
      const recurringJobResult = await this.getRecurringJob(recurringJobId);
      if (!recurringJobResult.success) {
        return recurringJobResult;
      }

      const updatedData = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'recurringJobs', recurringJobId), updatedData);

      return {
        success: true,
        recurringJob: { ...recurringJobResult.recurringJob, ...updatedData }
      };
    } catch (error) {
      console.error('Error updating recurring job:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete a recurring job
   */
  static async deleteRecurringJob(recurringJobId) {
    try {
      const userId = this.getCurrentUserId();
      
      // Verify user owns the recurring job
      const recurringJobResult = await this.getRecurringJob(recurringJobId);
      if (!recurringJobResult.success) {
        return recurringJobResult;
      }

      await deleteDoc(doc(db, 'recurringJobs', recurringJobId));

      return {
        success: true
      };
    } catch (error) {
      console.error('Error deleting recurring job:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Toggle active status of a recurring job
   */
  static async toggleRecurringJobActive(recurringJobId, isActive) {
    return this.updateRecurringJob(recurringJobId, { isActive });
  }

  /**
   * Calculate next occurrence date based on frequency
   * This is a helper function used by the scheduler
   */
  static calculateNextOccurrence(lastDate, frequency, dayOfWeek = null) {
    const date = new Date(lastDate);
    const nextDate = new Date(date);

    switch (frequency) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'bi-weekly':
        nextDate.setDate(nextDate.getDate() + 14);
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case 'bi-monthly':
        nextDate.setMonth(nextDate.getMonth() + 2);
        break;
      case 'quarterly':
        nextDate.setMonth(nextDate.getMonth() + 3);
        break;
      case 'annually':
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
      default:
        nextDate.setDate(nextDate.getDate() + 7); // Default to weekly
    }

    // If dayOfWeek is specified, adjust to that day
    if (dayOfWeek !== null && dayOfWeek !== undefined) {
      const currentDay = nextDate.getDay();
      const targetDay = dayOfWeek;
      const diff = targetDay - currentDay;
      nextDate.setDate(nextDate.getDate() + (diff >= 0 ? diff : diff + 7));
    }

    return nextDate;
  }
}

export default RecurringJobService;

