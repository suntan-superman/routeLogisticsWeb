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
  orderBy,
  limit
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
      let companyId = recurringJobData.companyId || null;
      let assignedTechnicianId = recurringJobData.assignedTechnicianId || null;
      let assignedTechnicianName = recurringJobData.assignedTechnicianName || '';

      if (!companyId || (assignedTechnicianId && !assignedTechnicianName)) {
        try {
          const userDoc = await getDoc(doc(db, 'users', userId));
          if (userDoc.exists()) {
            const userData = userDoc.data() || {};
            if (!companyId) {
              companyId = userData.companyId || null;
            }
            if (assignedTechnicianId && !assignedTechnicianName) {
              assignedTechnicianName =
                userData.name || userData.fullName || userData.roleDisplay || userData.email || '';
            }
          }
        } catch (error) {
          console.warn('Unable to load user profile for recurring job creation:', error);
        }
      }
      
      const recurringJob = {
        ...recurringJobData,
        userId,
        companyId: companyId || null,
        assignedTechnicianId: assignedTechnicianId || null,
        assignedTechnicianName: assignedTechnicianName || '',
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
   * For super admin: can get all jobs or filter by companyId
   */
  static async getRecurringJobs(userProfile = null, companyId = null) {
    try {
      const userId = this.getCurrentUserId();
      const user = auth.currentUser;
      
      // Get user profile if not provided (needed for super admin check)
      if (!userProfile) {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          userProfile = userDoc.data();
        }
      }
      
      // Check super admin status after profile is loaded
      const isSuperAdmin = user?.email === 'sroy@worksidesoftware.com' || 
                          userProfile?.role === 'super_admin' ||
                          userProfile?.email === 'sroy@worksidesoftware.com';
      
      let q;
      
      if (isSuperAdmin) {
        // Super admin: get all recurring jobs if no company selected
        // Use a limit to avoid security rule evaluation issues on large collections
        // Note: Firestore security rules evaluate for each potential document
        // For super admin queries, we can query without where clause since isSuperAdmin() should pass
        if (companyId) {
          // Get all users in the company first, then query their recurring jobs
          // This is more efficient than querying all and filtering
          const usersQuery = query(
            collection(db, 'users'),
            where('companyId', '==', companyId)
          );
          const usersSnapshot = await getDocs(usersQuery);
          const userIds = usersSnapshot.docs.map(doc => doc.id);
          
          if (userIds.length === 0) {
            return { success: true, recurringJobs: [] };
          }
          
          // Query recurring jobs for users in this company
          // Note: Firestore 'in' operator supports up to 10 values
          // For more users, we'd need to batch queries
          if (userIds.length <= 10) {
            q = query(
              collection(db, 'recurringJobs'),
              where('userId', 'in', userIds),
              orderBy('createdAt', 'desc')
            );
          } else {
            // For more than 10 users, query all and filter client-side
            q = query(
              collection(db, 'recurringJobs'),
              orderBy('createdAt', 'desc')
            );
          }
        } else {
          // Get all recurring jobs (super admin can access all)
          // IMPORTANT: When querying without where clause, Firestore evaluates security rules
          // for each potential document, which can fail. Instead, fetch all users first,
          // then batch query recurring jobs with where clauses (more efficient and reliable)
          const usersQuery = query(collection(db, 'users'));
          const usersSnapshot = await getDocs(usersQuery);
          const userIds = usersSnapshot.docs.map(doc => doc.id);
          
          if (userIds.length === 0) {
            return { success: true, recurringJobs: [] };
          }
          
          // Batch query recurring jobs for all users
          // Firestore 'in' operator supports up to 10 values, so we need to batch
          const allRecurringJobs = [];
          const batchSize = 10;
          
          for (let i = 0; i < userIds.length; i += batchSize) {
            const batch = userIds.slice(i, i + batchSize);
            const batchQuery = query(
              collection(db, 'recurringJobs'),
              where('userId', 'in', batch)
            );
            const batchSnapshot = await getDocs(batchQuery);
            batchSnapshot.forEach((doc) => {
              allRecurringJobs.push({ id: doc.id, ...doc.data() });
            });
          }
          
          // Sort by createdAt descending
          allRecurringJobs.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
            const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
            return dateB - dateA;
          });
          
          return {
            success: true,
            recurringJobs: allRecurringJobs
          };
        }
      } else {
        // Regular user: only their own jobs
        // Remove orderBy to avoid index requirement - sort client-side
        q = query(
          collection(db, 'recurringJobs'),
          where('userId', '==', userId)
        );
      }

      const querySnapshot = await getDocs(q);
      const recurringJobs = [];

      querySnapshot.forEach((doc) => {
        const jobData = doc.data();
        // For super admin with company filter, filter by companyId if jobs have companyId field
        // Otherwise include all
        if (isSuperAdmin && companyId) {
          // If recurring jobs have companyId, filter by it
          // For now, we'll need to get user's companyId and match
          // This is a limitation - recurring jobs might not have companyId directly
          recurringJobs.push({ id: doc.id, ...jobData });
        } else {
          recurringJobs.push({ id: doc.id, ...jobData });
        }
      });

      // Sort by createdAt descending client-side
      // Do this for all users since we removed orderBy to avoid index requirements
      recurringJobs.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateB - dateA;
      });

      // If super admin with company filter, filter by users in that company
      if (isSuperAdmin && companyId) {
        const usersQuery = query(
          collection(db, 'users'),
          where('companyId', '==', companyId)
        );
        const usersSnapshot = await getDocs(usersQuery);
        const userIds = usersSnapshot.docs.map(doc => doc.id);
        
        const filteredJobs = recurringJobs.filter(job => userIds.includes(job.userId));
        return {
          success: true,
          recurringJobs: filteredJobs
        };
      }

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

      const existing = recurringJobResult.recurringJob || {};
      let companyId = updates.companyId || existing.companyId || null;
      let assignedTechnicianId =
        updates.assignedTechnicianId !== undefined
          ? updates.assignedTechnicianId
          : existing.assignedTechnicianId || null;
      let assignedTechnicianName =
        updates.assignedTechnicianName !== undefined
          ? updates.assignedTechnicianName
          : existing.assignedTechnicianName || '';

      if (!assignedTechnicianName && assignedTechnicianId) {
        try {
          const teamMemberDoc = await getDoc(doc(db, 'teamMembers', assignedTechnicianId));
          if (teamMemberDoc.exists()) {
            const data = teamMemberDoc.data() || {};
            assignedTechnicianName =
              data.name || data.fullName || data.roleDisplay || data.email || assignedTechnicianName;
          }
        } catch (error) {
          console.warn('Unable to resolve technician name while updating recurring job:', error);
        }
      }

      const updatedData = {
        ...updates,
        companyId,
        assignedTechnicianId,
        assignedTechnicianName,
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

