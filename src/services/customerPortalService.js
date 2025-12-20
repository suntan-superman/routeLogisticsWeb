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

  /**
   * Get photos for a customer job
   * Fetches photos from jobPhotos collection using jobId and companyId
   * @param {string} companyId - Company ID
   * @param {string} jobId - Job ID (same as customerJob document ID)
   * @returns {Promise<{success: boolean, photos: Array, error?: string}>}
   */
  static async getCustomerJobPhotos(companyId, jobId) {
    try {
      if (!companyId || !jobId) {
        throw new Error('Company ID and Job ID are required');
      }

      const photosQuery = query(
        collection(db, 'jobPhotos'),
        where('companyId', '==', companyId),
        where('jobId', '==', jobId),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(photosQuery);
      const photos = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        // Transform photo data to match PhotoGallery component format
        photos.push({
          id: doc.id,
          url: data.downloadURL || data.url || '',
          thumbnailUrl: data.thumbnailURL || null,
          fileName: data.fileName || `photo-${doc.id}.jpg`,
          capturedAt: data.capturedAt?.toDate?.() || data.capturedAt || null,
          uploadedAt: data.createdAt?.toDate?.() || data.createdAt || null,
          latitude: data.latitude || null,
          longitude: data.longitude || null,
          locationAccuracy: data.locationAccuracy || null,
          notes: data.note || data.notes || data.caption || '',
          storagePath: data.storagePath || null,
          mimeType: data.mimeType || 'image/jpeg',
          size: data.size || 0,
        });
      });

      return {
        success: true,
        photos
      };
    } catch (error) {
      console.error('[CustomerPortalService] Error getting customer job photos:', error);
      // If orderBy fails (index not created), try without orderBy
      if (error.code === 'failed-precondition') {
        try {
          const photosQuery = query(
            collection(db, 'jobPhotos'),
            where('companyId', '==', companyId),
            where('jobId', '==', jobId)
          );
          const snapshot = await getDocs(photosQuery);
          const photos = [];

          snapshot.forEach((doc) => {
            const data = doc.data();
            photos.push({
              id: doc.id,
              url: data.downloadURL || data.url || '',
              thumbnailUrl: data.thumbnailURL || null,
              fileName: data.fileName || `photo-${doc.id}.jpg`,
              capturedAt: data.capturedAt?.toDate?.() || data.capturedAt || null,
              uploadedAt: data.createdAt?.toDate?.() || data.createdAt || null,
              latitude: data.latitude || null,
              longitude: data.longitude || null,
              locationAccuracy: data.locationAccuracy || null,
              notes: data.note || data.notes || data.caption || '',
              storagePath: data.storagePath || null,
              mimeType: data.mimeType || 'image/jpeg',
              size: data.size || 0,
            });
          });

          // Sort manually by createdAt descending (newest first)
          photos.sort((a, b) => {
            const aTime = a.uploadedAt || a.capturedAt || new Date(0);
            const bTime = b.uploadedAt || b.capturedAt || new Date(0);
            return new Date(bTime).getTime() - new Date(aTime).getTime();
          });

          return {
            success: true,
            photos
          };
        } catch (retryError) {
          return {
            success: false,
            error: retryError.message,
            photos: []
          };
        }
      }
      return {
        success: false,
        error: error.message,
        photos: []
      };
    }
  }
}

export default CustomerPortalService;
