import { db } from './firebase';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  startAfter,
  doc,
  getDoc,
} from 'firebase/firestore';

/**
 * Customer Portal Service
 * Handles all customer portal data operations
 */
class CustomerPortalService {
  /**
   * Get all jobs for a customer
   */
  static async getCustomerJobs(customerId, companyId = null, statusFilter = null) {
    try {
      if (!customerId) {
        throw new Error('Customer ID is required');
      }

      let q;

      if (companyId && statusFilter) {
        q = query(
          collection(db, 'customerJobs'),
          where('customerId', '==', customerId),
          where('companyId', '==', companyId),
          where('status', '==', statusFilter),
          orderBy('scheduledDate', 'desc'),
          limit(100)
        );
      } else if (companyId) {
        q = query(
          collection(db, 'customerJobs'),
          where('customerId', '==', customerId),
          where('companyId', '==', companyId),
          orderBy('scheduledDate', 'desc'),
          limit(100)
        );
      } else if (statusFilter) {
        q = query(
          collection(db, 'customerJobs'),
          where('customerId', '==', customerId),
          where('status', '==', statusFilter),
          orderBy('scheduledDate', 'desc'),
          limit(100)
        );
      } else {
        q = query(
          collection(db, 'customerJobs'),
          where('customerId', '==', customerId),
          orderBy('scheduledDate', 'desc'),
          limit(100)
        );
      }

      const snapshot = await getDocs(q);
      const jobs = [];

      snapshot.forEach((doc) => {
        jobs.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return {
        success: true,
        jobs,
        count: jobs.length
      };
    } catch (error) {
      console.error('Error getting customer jobs:', error);
      return {
        success: false,
        error: error.message,
        jobs: [],
        count: 0
      };
    }
  }

  /**
   * Get job details
   */
  static async getJobDetails(jobId) {
    try {
      if (!jobId) {
        throw new Error('Job ID is required');
      }

      const jobRef = doc(db, 'customerJobs', jobId);
      const jobDoc = await getDoc(jobRef);

      if (!jobDoc.exists()) {
        throw new Error('Job not found');
      }

      return {
        success: true,
        job: {
          id: jobDoc.id,
          ...jobDoc.data()
        }
      };
    } catch (error) {
      console.error('Error getting job details:', error);
      return {
        success: false,
        error: error.message,
        job: null
      };
    }
  }

  /**
   * Submit job rating
   */
  static async submitJobRating(jobId, rating, review) {
    try {
      if (!jobId || !rating) {
        throw new Error('Job ID and rating are required');
      }

      if (rating < 1 || rating > 5) {
        throw new Error('Rating must be between 1 and 5');
      }

      // Note: This will be done via Cloud Function for security
      // Frontend just prepares the data

      return {
        success: true,
        message: 'Rating submitted',
        rating,
        review
      };
    } catch (error) {
      console.error('Error submitting rating:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get all invoices for a customer
   */
  static async getCustomerInvoices(customerId, companyId = null, statusFilter = null) {
    try {
      if (!customerId) {
        throw new Error('Customer ID is required');
      }

      let q;

      if (companyId && statusFilter) {
        q = query(
          collection(db, 'customerInvoices'),
          where('customerId', '==', customerId),
          where('companyId', '==', companyId),
          where('status', '==', statusFilter),
          orderBy('createdAt', 'desc'),
          limit(100)
        );
      } else if (companyId) {
        q = query(
          collection(db, 'customerInvoices'),
          where('customerId', '==', customerId),
          where('companyId', '==', companyId),
          orderBy('createdAt', 'desc'),
          limit(100)
        );
      } else if (statusFilter) {
        q = query(
          collection(db, 'customerInvoices'),
          where('customerId', '==', customerId),
          where('status', '==', statusFilter),
          orderBy('createdAt', 'desc'),
          limit(100)
        );
      } else {
        q = query(
          collection(db, 'customerInvoices'),
          where('customerId', '==', customerId),
          orderBy('createdAt', 'desc'),
          limit(100)
        );
      }

      const snapshot = await getDocs(q);
      const invoices = [];

      snapshot.forEach((doc) => {
        invoices.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return {
        success: true,
        invoices,
        count: invoices.length
      };
    } catch (error) {
      console.error('Error getting customer invoices:', error);
      return {
        success: false,
        error: error.message,
        invoices: [],
        count: 0
      };
    }
  }

  /**
   * Get invoice details
   */
  static async getInvoiceDetails(invoiceId) {
    try {
      if (!invoiceId) {
        throw new Error('Invoice ID is required');
      }

      const invoiceRef = doc(db, 'customerInvoices', invoiceId);
      const invoiceDoc = await getDoc(invoiceRef);

      if (!invoiceDoc.exists()) {
        throw new Error('Invoice not found');
      }

      return {
        success: true,
        invoice: {
          id: invoiceDoc.id,
          ...invoiceDoc.data()
        }
      };
    } catch (error) {
      console.error('Error getting invoice details:', error);
      return {
        success: false,
        error: error.message,
        invoice: null
      };
    }
  }

  /**
   * Get job stats for dashboard
   */
  static async getJobStats(customerId, companyId) {
    try {
      const result = await this.getCustomerJobs(customerId, companyId);

      if (!result.success) {
        throw new Error(result.error);
      }

      const jobs = result.jobs;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const upcoming = jobs.filter(job => {
        const jobDate = new Date(job.scheduledDate);
        return jobDate >= today && job.status === 'scheduled';
      }).length;

      const completed = jobs.filter(job => job.status === 'completed').length;

      return {
        success: true,
        stats: {
          upcomingJobs: upcoming,
          completedJobs: completed,
          totalJobs: jobs.length
        }
      };
    } catch (error) {
      console.error('Error getting job stats:', error);
      return {
        success: false,
        error: error.message,
        stats: null
      };
    }
  }

  /**
   * Get invoice stats for dashboard
   */
  static async getInvoiceStats(customerId, companyId) {
    try {
      const result = await this.getCustomerInvoices(customerId, companyId);

      if (!result.success) {
        throw new Error(result.error);
      }

      const invoices = result.invoices;

      const pending = invoices.filter(inv => inv.status === 'pending').length;
      const paid = invoices.filter(inv => inv.status === 'paid').length;
      const overdue = invoices.filter(inv => inv.status === 'overdue').length;
      const totalAmount = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

      return {
        success: true,
        stats: {
          pendingInvoices: pending,
          paidInvoices: paid,
          overdueInvoices: overdue,
          totalAmount: totalAmount
        }
      };
    } catch (error) {
      console.error('Error getting invoice stats:', error);
      return {
        success: false,
        error: error.message,
        stats: null
      };
    }
  }

  /**
   * Get company details
   */
  static async getCompanyDetails(companyId) {
    try {
      if (!companyId) {
        throw new Error('Company ID is required');
      }

      const companyRef = doc(db, 'companies', companyId);
      const companyDoc = await getDoc(companyRef);

      if (!companyDoc.exists()) {
        throw new Error('Company not found');
      }

      return {
        success: true,
        company: {
          id: companyDoc.id,
          ...companyDoc.data()
        }
      };
    } catch (error) {
      console.error('Error getting company details:', error);
      return {
        success: false,
        error: error.message,
        company: null
      };
    }
  }

  /**
   * Format currency
   */
  static formatCurrency(amount, currency = 'USD') {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
      }).format(amount || 0);
    } catch (error) {
      console.error('Error formatting currency:', error);
      return `$${(amount || 0).toFixed(2)}`;
    }
  }

  /**
   * Format date
   */
  static formatDate(dateString) {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString;
    }
  }

  /**
   * Get status badge color
   */
  static getStatusColor(status) {
    const colors = {
      scheduled: 'blue',
      'in-progress': 'yellow',
      'in_progress': 'yellow',
      completed: 'green',
      cancelled: 'red',
      draft: 'gray',
      sent: 'blue',
      viewed: 'purple',
      paid: 'green',
      pending: 'yellow',
      overdue: 'red'
    };
    return colors[status] || 'gray';
  }
}

export default CustomerPortalService;
