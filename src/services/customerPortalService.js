import { 
  collection, 
  query, 
  where, 
  getDocs,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, auth } from './firebase';

class CustomerPortalService {
  /**
   * Find all companies where user is a customer (by email)
   * @param {string} email - Customer email
   * @returns {Promise<{success: boolean, companies?: Array, error?: string}>}
   */
  static async findCustomerCompanies(email) {
    try {
      if (!email) {
        return {
          success: false,
          error: 'Email is required'
        };
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Query customers collection for this email
      const customersQuery = query(
        collection(db, 'customers'),
        where('email', '==', normalizedEmail),
        where('status', '==', 'active')
      );

      const customersSnapshot = await getDocs(customersQuery);
      const companyIds = new Set();
      const customerRecords = [];

      customersSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.companyId) {
          companyIds.add(data.companyId);
          customerRecords.push({
            id: doc.id,
            ...data
          });
        }
      });

      if (companyIds.size === 0) {
        return {
          success: true,
          companies: [],
          customerRecords: []
        };
      }

      // Fetch company details
      const companies = [];
      for (const companyId of companyIds) {
        try {
          const companyDoc = await getDoc(doc(db, 'companies', companyId));
          if (companyDoc.exists()) {
            const companyData = companyDoc.data();
            const customerRecord = customerRecords.find(c => c.companyId === companyId);
            
            companies.push({
              id: companyDoc.id,
              ...companyData,
              customerId: customerRecord?.id,
              customerSince: customerRecord?.createdAt
            });
          }
        } catch (error) {
          console.error(`Error fetching company ${companyId}:`, error);
        }
      }

      return {
        success: true,
        companies: companies.sort((a, b) => a.name.localeCompare(b.name)),
        customerRecords
      };
    } catch (error) {
      console.error('Error finding customer companies:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get customer's service history for a company
   * @param {string} customerId - Customer ID
   * @param {string} companyId - Company ID
   * @returns {Promise<{success: boolean, jobs?: Array, error?: string}>}
   */
  static async getServiceHistory(customerId, companyId) {
    try {
      const jobsQuery = query(
        collection(db, 'jobs'),
        where('customerId', '==', customerId),
        where('companyId', '==', companyId),
        orderBy('date', 'desc'),
        limit(50)
      );

      const jobsSnapshot = await getDocs(jobsQuery);
      const jobs = [];

      jobsSnapshot.forEach((doc) => {
        jobs.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return {
        success: true,
        jobs
      };
    } catch (error) {
      console.error('Error getting service history:', error);
      return {
        success: false,
        error: error.message,
        jobs: []
      };
    }
  }

  /**
   * Get customer's upcoming appointments
   * @param {string} customerId - Customer ID
   * @param {string} companyId - Company ID
   * @returns {Promise<{success: boolean, appointments?: Array, error?: string}>}
   */
  static async getUpcomingAppointments(customerId, companyId) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const jobsQuery = query(
        collection(db, 'jobs'),
        where('customerId', '==', customerId),
        where('companyId', '==', companyId),
        where('date', '>=', today),
        where('status', 'in', ['scheduled', 'in_progress']),
        orderBy('date', 'asc'),
        limit(20)
      );

      const jobsSnapshot = await getDocs(jobsQuery);
      const appointments = [];

      jobsSnapshot.forEach((doc) => {
        appointments.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return {
        success: true,
        appointments
      };
    } catch (error) {
      console.error('Error getting upcoming appointments:', error);
      return {
        success: false,
        error: error.message,
        appointments: []
      };
    }
  }

  /**
   * Get customer's invoices
   * @param {string} customerId - Customer ID
   * @param {string} companyId - Company ID
   * @returns {Promise<{success: boolean, invoices?: Array, error?: string}>}
   */
  static async getInvoices(customerId, companyId) {
    try {
      const invoicesQuery = query(
        collection(db, 'invoices'),
        where('customerId', '==', customerId),
        where('companyId', '==', companyId),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      const invoicesSnapshot = await getDocs(invoicesQuery);
      const invoices = [];

      invoicesSnapshot.forEach((doc) => {
        invoices.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return {
        success: true,
        invoices
      };
    } catch (error) {
      console.error('Error getting invoices:', error);
      return {
        success: false,
        error: error.message,
        invoices: []
      };
    }
  }

  /**
   * Submit a service request
   * @param {Object} request - Service request data
   * @returns {Promise<{success: boolean, requestId?: string, error?: string}>}
   */
  static async submitServiceRequest(request) {
    try {
      const user = auth.currentUser;
      if (!user) {
        return {
          success: false,
          error: 'User not authenticated'
        };
      }

      const requestData = {
        customerId: request.customerId,
        customerEmail: user.email,
        customerName: request.customerName,
        companyId: request.companyId,
        serviceType: request.serviceType,
        description: request.description || '',
        preferredDate: request.preferredDate || null,
        preferredTime: request.preferredTime || null,
        urgency: request.urgency || 'normal',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'serviceRequests'), requestData);

      return {
        success: true,
        requestId: docRef.id
      };
    } catch (error) {
      console.error('Error submitting service request:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get customer's service requests
   * @param {string} customerId - Customer ID
   * @param {string} companyId - Company ID
   * @returns {Promise<{success: boolean, requests?: Array, error?: string}>}
   */
  static async getServiceRequests(customerId, companyId) {
    try {
      const requestsQuery = query(
        collection(db, 'serviceRequests'),
        where('customerId', '==', customerId),
        where('companyId', '==', companyId),
        orderBy('createdAt', 'desc'),
        limit(20)
      );

      const requestsSnapshot = await getDocs(requestsQuery);
      const requests = [];

      requestsSnapshot.forEach((doc) => {
        requests.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return {
        success: true,
        requests
      };
    } catch (error) {
      console.error('Error getting service requests:', error);
      return {
        success: false,
        error: error.message,
        requests: []
      };
    }
  }

  /**
   * Update customer preferences
   * @param {string} customerId - Customer ID
   * @param {Object} preferences - Customer preferences
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async updateCustomerPreferences(customerId, preferences) {
    try {
      const customerRef = doc(db, 'customers', customerId);
      
      await updateDoc(customerRef, {
        preferences: preferences,
        updatedAt: new Date().toISOString()
      });

      return {
        success: true
      };
    } catch (error) {
      console.error('Error updating customer preferences:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Rate a completed job
   * @param {string} jobId - Job ID
   * @param {number} rating - Rating (1-5)
   * @param {string} review - Optional review text
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async rateJob(jobId, rating, review = '') {
    try {
      const jobRef = doc(db, 'jobs', jobId);
      
      await updateDoc(jobRef, {
        customerRating: rating,
        customerReview: review,
        ratedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      return {
        success: true
      };
    } catch (error) {
      console.error('Error rating job:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get customer details
   * @param {string} customerId - Customer ID
   * @returns {Promise<{success: boolean, customer?: Object, error?: string}>}
   */
  static async getCustomerDetails(customerId) {
    try {
      const customerDoc = await getDoc(doc(db, 'customers', customerId));
      
      if (!customerDoc.exists()) {
        return {
          success: false,
          error: 'Customer not found'
        };
      }

      return {
        success: true,
        customer: {
          id: customerDoc.id,
          ...customerDoc.data()
        }
      };
    } catch (error) {
      console.error('Error getting customer details:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get recurring services for customer
   * @param {string} customerId - Customer ID
   * @param {string} companyId - Company ID
   * @returns {Promise<{success: boolean, recurringJobs?: Array, error?: string}>}
   */
  static async getRecurringServices(customerId, companyId) {
    try {
      const recurringQuery = query(
        collection(db, 'recurringJobs'),
        where('customerId', '==', customerId),
        where('companyId', '==', companyId),
        where('isActive', '==', true)
      );

      const recurringSnapshot = await getDocs(recurringQuery);
      const recurringJobs = [];

      recurringSnapshot.forEach((doc) => {
        recurringJobs.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return {
        success: true,
        recurringJobs
      };
    } catch (error) {
      console.error('Error getting recurring services:', error);
      return {
        success: false,
        error: error.message,
        recurringJobs: []
      };
    }
  }

  /**
   * Pause/resume recurring service
   * @param {string} recurringJobId - Recurring job ID
   * @param {boolean} pause - True to pause, false to resume
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async toggleRecurringService(recurringJobId, pause) {
    try {
      const recurringRef = doc(db, 'recurringJobs', recurringJobId);
      
      await updateDoc(recurringRef, {
        isPaused: pause,
        pausedAt: pause ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString()
      });

      return {
        success: true
      };
    } catch (error) {
      console.error('Error toggling recurring service:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default CustomerPortalService;

