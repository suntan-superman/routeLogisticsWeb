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
  limit,
  startAfter
} from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './firebase';

class JobManagementService {
  // Get current user ID
  static getCurrentUserId() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No user is currently signed in');
    }
    return user.uid;
  }

  // Get all jobs for the current user's company
  static async getJobs(limitCount = 50, lastDoc = null, filters = {}) {
    try {
      const userId = this.getCurrentUserId();
      
      // For now, we'll get jobs by userId (individual user)
      // Later this can be expanded to get jobs by companyId
      let q = query(
        collection(db, 'jobs'),
        where('userId', '==', userId),
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

      // Apply additional filters
      let filteredJobs = jobs;
      
      if (filters.status) {
        filteredJobs = filteredJobs.filter(job => job.status === filters.status);
      }
      
      if (filters.dateRange) {
        const { startDate, endDate } = filters.dateRange;
        filteredJobs = filteredJobs.filter(job => {
          const jobDate = new Date(job.date);
          return jobDate >= startDate && jobDate <= endDate;
        });
      }
      
      if (filters.customerId) {
        filteredJobs = filteredJobs.filter(job => job.customerId === filters.customerId);
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
      const userId = this.getCurrentUserId();
      const jobDoc = await getDoc(doc(db, 'jobs', jobId));
      
      if (!jobDoc.exists()) {
        return {
          success: false,
          error: 'Job not found'
        };
      }

      const jobData = jobDoc.data();
      
      // Verify user owns this job
      if (jobData.userId !== userId) {
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

  static sanitizeNumber(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  static parseDurationMinutes(rawValue, fallback = 60) {
    if (!rawValue) {
      return fallback;
    }

    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      return rawValue;
    }

    if (typeof rawValue !== 'string') {
      return fallback;
    }

    const value = rawValue.trim().toLowerCase();
    const numberMatch = value.match(/([\d.,]+)/);
    if (!numberMatch) {
      return fallback;
    }

    const numeric = parseFloat(numberMatch[1].replace(',', ''));
    if (!Number.isFinite(numeric)) {
      return fallback;
    }

    if (value.includes('min')) {
      return Math.max(5, Math.round(numeric));
    }

    if (value.includes('hour') || value.includes('hr')) {
      return Math.max(5, Math.round(numeric * 60));
    }

    if (numeric <= 10 && !value.includes(':')) {
      return Math.max(5, Math.round(numeric * 60));
    }

    return Math.max(5, Math.round(numeric));
  }

  static parseTimeToDate(dateString, timeString) {
    if (!dateString) {
      return null;
    }

    const baseDate = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) {
      return null;
    }

    if (!timeString) {
      return baseDate;
    }

    const trimmed = timeString.trim();
    const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);

    if (!match) {
      const parsed = new Date(`${dateString}T${trimmed}`);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
      return baseDate;
    }

    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const meridiem = match[3] ? match[3].toUpperCase() : null;

    if (meridiem) {
      if (meridiem === 'AM' && hours === 12) {
        hours = 0;
      }
      if (meridiem === 'PM' && hours < 12) {
        hours += 12;
      }
    }

    const adjusted = new Date(baseDate);
    adjusted.setHours(hours, minutes, 0, 0);
    return adjusted;
  }

  static async checkTechnicianAvailability(technicianId, date, time, durationMinutes = 60, excludeJobId = null) {
    if (!technicianId || !date || !time) {
      return { hasConflict: false, conflicts: [] };
    }

    try {
      const newStart = this.parseTimeToDate(date, time);
      if (!newStart) {
        return { hasConflict: false, conflicts: [] };
      }

      const querySnapshot = await getDocs(
        query(
          collection(db, 'jobs'),
          where('assignedTo', '==', technicianId),
          where('date', '==', date)
        )
      );

      const bufferMinutes = 15;
      const newEnd = new Date(newStart.getTime() + (durationMinutes + bufferMinutes) * 60000);

      const conflicts = [];

      querySnapshot.forEach((docSnap) => {
        if (excludeJobId && docSnap.id === excludeJobId) {
          return;
        }

        const job = docSnap.data() || {};
        const jobStart = this.parseTimeToDate(job.date || date, job.time || '09:00');
        if (!jobStart) {
          return;
        }

        const jobDuration =
          this.parseDurationMinutes(job.duration, null) ||
          this.parseDurationMinutes(job.estimatedDuration, null) ||
          this.parseDurationMinutes(job.actualHours, null) ||
          durationMinutes;

        const jobEnd = new Date(jobStart.getTime() + (jobDuration + bufferMinutes) * 60000);

        const overlap = newStart < jobEnd && newEnd > jobStart;
        if (overlap) {
          conflicts.push({
            id: docSnap.id,
            date: job.date,
            time: job.time,
            serviceType: job.serviceType,
            customerName: job.customerName,
          });
        }
      });

      return {
        hasConflict: conflicts.length > 0,
        conflicts,
      };
    } catch (error) {
      console.error('Error checking technician availability:', error);
      return {
        hasConflict: false,
        conflicts: [],
        error: error.message,
      };
    }
  }

  // Create job
  static async createJob(jobData) {
    try {
      const userId = this.getCurrentUserId();
      const nowIso = new Date().toISOString();

      console.log('=== JobManagementService.createJob ===');
      console.log('Received jobData:', jobData);
      console.log('jobData.customerPhone:', jobData.customerPhone);
      console.log('jobData.address:', jobData.address);

      const sanitized = {
        userId,
        companyId: jobData.companyId || null,
        customerId: jobData.customerId || null,
        customerName: (jobData.customerName || '').trim(),
        customerPhone: (jobData.customerPhone || '').trim(),
        address: (jobData.address || '').trim(),
        serviceType: (jobData.serviceType || '').trim(),
        status: jobData.status || 'scheduled',
        date: jobData.date || nowIso.split('T')[0],
        time: jobData.time || '09:00',
        duration: jobData.duration || '',
        estimatedCost: this.sanitizeNumber(jobData.estimatedCost),
        notes: jobData.notes || '',
        assignedTo: jobData.assignedTo || null,
        assignedToName: jobData.assignedToName || '',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      console.log('=== Sanitized data being saved ===');
      console.log('sanitized:', sanitized);
      console.log('sanitized.customerPhone:', sanitized.customerPhone);
      console.log('sanitized.address:', sanitized.address);

      const docRef = await addDoc(collection(db, 'jobs'), sanitized);

      return {
        success: true,
        job: { id: docRef.id, ...sanitized },
      };
    } catch (error) {
      console.error('Error creating job:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Update job
  static async updateJob(jobId, updates) {
    try {
      const userId = this.getCurrentUserId();
      
      // Verify user owns the job
      const jobResult = await this.getJob(jobId);
      if (!jobResult.success) {
        return jobResult;
      }

      const updatedData = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'jobs', jobId), updatedData);

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
      const userId = this.getCurrentUserId();
      
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
      const userId = this.getCurrentUserId();
      
      const q = query(
        collection(db, 'jobs'),
        where('userId', '==', userId),
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
      const userId = this.getCurrentUserId();
      
      // Get all jobs and filter by date range
      const q = query(
        collection(db, 'jobs'),
        where('userId', '==', userId),
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
      const userId = this.getCurrentUserId();
      
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
      const userId = this.getCurrentUserId();
      
      const q = query(
        collection(db, 'jobs'),
        where('userId', '==', userId)
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
      const userId = this.getCurrentUserId();
      
      const q = query(
        collection(db, 'jobs'),
        where('userId', '==', userId),
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
