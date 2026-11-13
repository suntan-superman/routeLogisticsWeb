import { 
  collection, 
  doc, 
  getDoc, 
  runTransaction,
  updateDoc, 
  getDocs, 
  query, 
  where,
  addDoc,
  deleteDoc,
  orderBy,
  limit,
  startAfter
} from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './firebase';
import { scopeWhere, isInScope, tenantFields } from './tenancy';

class JobManagementService {
  // Get current user ID
  static getCurrentUserId() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No user is currently signed in');
    }
    return user.uid;
  }

  static async createJob(jobData) {
    try {
      const now = new Date().toISOString();
      const job = {
        ...jobData,
        ...tenantFields(),
        status: 'scheduled',
        createdAt: now,
        updatedAt: now
      };
      const docRef = await addDoc(collection(db, 'jobs'), job);
      return { success: true, jobId: docRef.id, job: { id: docRef.id, ...job } };
    } catch (error) {
      console.error('Error creating job:', error);
      return { success: false, error: error.message };
    }
  }

  // Get all jobs for the current user's company
  static async getJobs(limitCount = 50, lastDoc = null, filters = {}) {
    try {
      this.getCurrentUserId();

      // Scoped to the company (members) or the user (solo accounts). Status/customer filters run
      // server-side so pagination limits apply to the filtered set, not the unfiltered one.
      const constraints = [scopeWhere()];
      if (filters.status) constraints.push(where('status', '==', filters.status));
      if (filters.customerId) constraints.push(where('customerId', '==', filters.customerId));
      let q = query(
        collection(db, 'jobs'),
        ...constraints,
        orderBy('date', 'desc'),
        orderBy('time', 'desc'),
        limit(limitCount)
      );

      if (lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const querySnapshot = await getDocs(q);
      const jobs = [];
      
      querySnapshot.forEach((doc) => {
        jobs.push({ id: doc.id, ...doc.data() });
      });

      let filteredJobs = jobs;
      
      if (filters.dateRange) {
        const { startDate, endDate } = filters.dateRange;
        filteredJobs = filteredJobs.filter(job => {
          const jobDate = new Date(job.date);
          return jobDate >= startDate && jobDate <= endDate;
        });
      }

      return {
        success: true,
        jobs: filteredJobs,
        lastDoc: querySnapshot.docs[querySnapshot.docs.length - 1] || null,
        hasMore: querySnapshot.docs.length === limitCount
      };
    } catch (error) {
      console.error('Error getting jobs:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get job by ID
  static async getJob(jobId) {
    try {
      this.getCurrentUserId();
      const jobDoc = await getDoc(doc(db, 'jobs', jobId));
      
      if (!jobDoc.exists()) {
        return {
          success: false,
          error: 'Job not found'
        };
      }

      const jobData = jobDoc.data();
      
      // Verify user owns this job
      if (!isInScope(jobData)) {
        return {
          success: false,
          error: 'Unauthorized to access this job'
        };
      }

      return {
        success: true,
        job: { id: jobDoc.id, ...jobData }
      };
    } catch (error) {
      console.error('Error getting job:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Update job
  static async updateJob(jobId, updates, expectedUpdatedAt = undefined) {
    try {
      this.getCurrentUserId();
      
      // Verify user owns the job
      const jobResult = await this.getJob(jobId);
      if (!jobResult.success) {
        return jobResult;
      }

      const updatedData = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      if (expectedUpdatedAt !== undefined) {
        await runTransaction(db, async (transaction) => {
          const ref = doc(db, 'jobs', jobId);
          const latest = await transaction.get(ref);
          if (!latest.exists()) throw new Error('This job no longer exists.');
          const version = (value) => value?.toMillis?.() ?? value ?? null;
          if (version(latest.data().updatedAt) !== version(expectedUpdatedAt)) throw new Error('This job changed while you were editing. Close the form, refresh, and review the latest version before saving.');
          transaction.update(ref, updatedData);
        });
      } else await updateDoc(doc(db, 'jobs', jobId), updatedData);

      return {
        success: true,
        job: { ...jobResult.job, ...updatedData }
      };
    } catch (error) {
      console.error('Error updating job:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Delete job
  static async deleteJob(jobId) {
    try {
      this.getCurrentUserId();
      
      // Verify user owns the job
      const jobResult = await this.getJob(jobId);
      if (!jobResult.success) {
        return jobResult;
      }

      await deleteDoc(doc(db, 'jobs', jobId));

      return {
        success: true
      };
    } catch (error) {
      console.error('Error deleting job:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get jobs by status
  static async getJobsByStatus(status) {
    try {
      this.getCurrentUserId();
      
      const q = query(
        collection(db, 'jobs'),
        scopeWhere(),
        where('status', '==', status),
        orderBy('date', 'desc'),
        orderBy('time', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const jobs = [];
      
      querySnapshot.forEach((doc) => {
        jobs.push({ id: doc.id, ...doc.data() });
      });

      return {
        success: true,
        jobs
      };
    } catch (error) {
      console.error('Error getting jobs by status:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get jobs by date range
  static async getJobsByDateRange(startDate, endDate) {
    try {
      this.getCurrentUserId();
      
      // Get all jobs and filter by date range
      const q = query(
        collection(db, 'jobs'),
        scopeWhere(),
        orderBy('date', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const jobs = [];
      
      querySnapshot.forEach((doc) => {
        const jobData = doc.data();
        const jobDate = new Date(jobData.date);
        
        if (jobDate >= startDate && jobDate <= endDate) {
          jobs.push({ id: doc.id, ...jobData });
        }
      });

      return {
        success: true,
        jobs
      };
    } catch (error) {
      console.error('Error getting jobs by date range:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get today's jobs
  static async getTodaysJobs() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return this.getJobsByDateRange(today, tomorrow);
  }

  // Get this week's jobs
  static async getThisWeeksJobs() {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    return this.getJobsByDateRange(startOfWeek, endOfWeek);
  }

  // Get this month's jobs
  static async getThisMonthsJobs() {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);
    
    return this.getJobsByDateRange(startOfMonth, endOfMonth);
  }

  // Search jobs
  static async searchJobs(searchTerm, limitCount = 20) {
    try {
      this.getCurrentUserId();
      
      // Get all jobs and filter client-side for now
      const result = await this.getJobs(1000); // Get more for search
      
      if (!result.success) {
        return result;
      }

      const filteredJobs = result.jobs.filter(job => {
        const searchLower = searchTerm.toLowerCase();
        return (
          job.customerName?.toLowerCase().includes(searchLower) ||
          job.serviceType?.toLowerCase().includes(searchLower) ||
          job.address?.toLowerCase().includes(searchLower) ||
          job.notes?.toLowerCase().includes(searchLower)
        );
      });

      return {
        success: true,
        jobs: filteredJobs.slice(0, limitCount)
      };
    } catch (error) {
      console.error('Error searching jobs:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get job statistics
  static async getJobStats() {
    try {
      this.getCurrentUserId();
      
      const q = query(
        collection(db, 'jobs'),
        scopeWhere()
      );
      
      const querySnapshot = await getDocs(q);
      
      let totalJobs = 0;
      let scheduledJobs = 0;
      let inProgressJobs = 0;
      let completedJobs = 0;
      let cancelledJobs = 0;
      let totalRevenue = 0;
      let thisWeekJobs = 0;
      let thisMonthJobs = 0;
      
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        totalJobs++;
        
        // Count by status
        switch (data.status) {
          case 'scheduled':
            scheduledJobs++;
            break;
          case 'in-progress':
            inProgressJobs++;
            break;
          case 'completed':
            completedJobs++;
            break;
          case 'cancelled':
            cancelledJobs++;
            break;
        }
        
        // Calculate revenue for completed jobs
        if (data.status === 'completed' && data.totalCost) {
          totalRevenue += parseFloat(data.totalCost) || 0;
        }
        
        // Count this week's jobs
        const jobDate = new Date(data.date);
        if (jobDate >= startOfWeek) {
          thisWeekJobs++;
        }
        
        // Count this month's jobs
        if (jobDate >= startOfMonth) {
          thisMonthJobs++;
        }
      });

      return {
        success: true,
        stats: {
          totalJobs,
          scheduledJobs,
          inProgressJobs,
          completedJobs,
          cancelledJobs,
          totalRevenue,
          thisWeekJobs,
          thisMonthJobs
        }
      };
    } catch (error) {
      console.error('Error getting job stats:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Assign job to team member
  static async assignJob(jobId, teamMemberId, teamMemberName) {
    try {
      const updates = {
        assignedTo: teamMemberId,
        assignedToName: teamMemberName,
        assignedAt: new Date().toISOString()
      };

      return await this.updateJob(jobId, updates);
    } catch (error) {
      console.error('Error assigning job:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Update job status
  static async updateJobStatus(jobId, status, additionalData = {}) {
    try {
      const updates = {
        status,
        ...additionalData
      };

      // Add completion data if marking as completed
      if (status === 'completed') {
        updates.completedAt = new Date().toISOString();
        updates.actualWorkDone = additionalData.actualWorkDone || '';
        updates.actualHours = additionalData.actualHours || '';
        updates.completionNotes = additionalData.completionNotes || '';
      }

      // Add cancellation data if marking as cancelled
      if (status === 'cancelled') {
        updates.cancelledAt = new Date().toISOString();
        updates.cancellationReason = additionalData.cancellationReason || '';
      }

      return await this.updateJob(jobId, updates);
    } catch (error) {
      console.error('Error updating job status:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get jobs by customer
  static async getJobsByCustomer(customerId) {
    try {
      this.getCurrentUserId();
      
      const q = query(
        collection(db, 'jobs'),
        scopeWhere(),
        where('customerId', '==', customerId),
        orderBy('date', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const jobs = [];
      
      querySnapshot.forEach((doc) => {
        jobs.push({ id: doc.id, ...doc.data() });
      });

      return {
        success: true,
        jobs
      };
    } catch (error) {
      console.error('Error getting jobs by customer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Export jobs to CSV
  static async exportJobs(filters = {}) {
    try {
      const result = await this.getJobs(1000, null, filters);
      if (!result.success) {
        return result;
      }

      // Convert to CSV format
      const headers = ['Date', 'Time', 'Customer', 'Service Type', 'Address', 'Status', 'Assigned To', 'Total Cost', 'Notes'];
      const csvRows = [headers.join(',')];
      
      result.jobs.forEach(job => {
        const row = [
          job.date || '',
          job.time || '',
          job.customerName || '',
          job.serviceType || '',
          job.address || '',
          job.status || '',
          job.assignedToName || '',
          job.totalCost || '',
          (job.notes || '').replace(/\n/g, ' ')
        ];
        csvRows.push(row.map(field => `"${field}"`).join(','));
      });

      return {
        success: true,
        csvData: csvRows.join('\n')
      };
    } catch (error) {
      console.error('Error exporting jobs:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default JobManagementService;
