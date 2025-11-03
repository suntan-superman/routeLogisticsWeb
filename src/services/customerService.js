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
import { getCustomerCreationStatus, canApproveCustomers } from '../utils/permissions';

class CustomerService {
  // Get current user ID
  static getCurrentUserId() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No user is currently signed in');
    }
    return user.uid;
  }

  // Get current user profile (for role checking)
  static async getCurrentUserProfile() {
    try {
      const userId = this.getCurrentUserId();
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        return userDoc.data();
      }
      return null;
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  // Create a new customer (with approval workflow)
  static async createCustomer(customerData, userProfile = null) {
    try {
      const userId = this.getCurrentUserId();
      
      // Get user profile if not provided
      if (!userProfile) {
        userProfile = await this.getCurrentUserProfile();
      }
      
      // Determine status based on role
      const status = getCustomerCreationStatus(userProfile);
      
      const customer = {
        ...customerData,
        userId,
        companyId: userProfile?.companyId || null,
        status: status, // 'approved' or 'pending'
        createdBy: userId,
        createdByRole: userProfile?.role || 'field_tech',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        totalJobs: 0,
        totalSpent: 0,
        lastServiceDate: null,
        // Approval fields (set if approved)
        approvedBy: status === 'approved' ? userId : null,
        approvedAt: status === 'approved' ? new Date().toISOString() : null
      };

      const docRef = await addDoc(collection(db, 'customers'), customer);
      
      return {
        success: true,
        customerId: docRef.id,
        customer: { id: docRef.id, ...customer }
      };
    } catch (error) {
      console.error('Error creating customer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Approve a pending customer
  static async approveCustomer(customerId, userProfile = null) {
    try {
      const userId = this.getCurrentUserId();
      
      if (!userProfile) {
        userProfile = await this.getCurrentUserProfile();
      }
      
      if (!canApproveCustomers(userProfile)) {
        return {
          success: false,
          error: 'You do not have permission to approve customers'
        };
      }
      
      const customerResult = await this.getCustomer(customerId);
      if (!customerResult.success) {
        return customerResult;
      }
      
      if (customerResult.customer.status !== 'pending') {
        return {
          success: false,
          error: 'Customer is not in pending status'
        };
      }

      await updateDoc(doc(db, 'customers', customerId), {
        status: 'approved',
        approvedBy: userId,
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      return {
        success: true
      };
    } catch (error) {
      console.error('Error approving customer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Reject a pending customer
  static async rejectCustomer(customerId, rejectionReason, userProfile = null) {
    try {
      const userId = this.getCurrentUserId();
      
      if (!userProfile) {
        userProfile = await this.getCurrentUserProfile();
      }
      
      if (!canApproveCustomers(userProfile)) {
        return {
          success: false,
          error: 'You do not have permission to reject customers'
        };
      }
      
      const customerResult = await this.getCustomer(customerId);
      if (!customerResult.success) {
        return customerResult;
      }
      
      if (customerResult.customer.status !== 'pending') {
        return {
          success: false,
          error: 'Customer is not in pending status'
        };
      }

      await updateDoc(doc(db, 'customers', customerId), {
        status: 'rejected',
        rejectedBy: userId,
        rejectedAt: new Date().toISOString(),
        rejectionReason: rejectionReason || '',
        updatedAt: new Date().toISOString()
      });

      return {
        success: true
      };
    } catch (error) {
      console.error('Error rejecting customer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get all customers (role-aware: company scope for admins/supervisors, own for field techs)
  static async getCustomers(limitCount = 50, lastDoc = null, filters = {}, userProfile = null) {
    try {
      const userId = this.getCurrentUserId();
      
      // Get user profile if not provided
      if (!userProfile) {
        userProfile = await this.getCurrentUserProfile();
      }
      
      // Build query based on role
      let q;
      
      // Super admin, admin, or supervisor: get all company customers
      if (userProfile?.role === 'super_admin' || 
          userProfile?.role === 'admin' || 
          userProfile?.role === 'supervisor') {
        
        // If companyId exists, filter by company
        if (userProfile?.companyId) {
          q = query(
            collection(db, 'customers'),
            where('companyId', '==', userProfile.companyId),
            orderBy('name', 'asc'),
            limit(limitCount)
          );
        } else {
          // Fallback to userId for users without company
          q = query(
            collection(db, 'customers'),
            where('userId', '==', userId),
            orderBy('name', 'asc'),
            limit(limitCount)
          );
        }
      } else {
        // Field techs: only their own customers
        q = query(
          collection(db, 'customers'),
          where('userId', '==', userId),
          orderBy('name', 'asc'),
          limit(limitCount)
        );
      }

      if (lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const querySnapshot = await getDocs(q);
      const customers = [];
      
      querySnapshot.forEach((doc) => {
        customers.push({ id: doc.id, ...doc.data() });
      });

      // Apply client-side filters (status, etc.)
      let filteredCustomers = customers;
      if (filters.status) {
        filteredCustomers = filteredCustomers.filter(c => c.status === filters.status);
      }
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filteredCustomers = filteredCustomers.filter(c => 
          c.name?.toLowerCase().includes(searchLower) ||
          c.email?.toLowerCase().includes(searchLower) ||
          c.phone?.includes(filters.search)
        );
      }

      return {
        success: true,
        customers: filteredCustomers,
        lastDoc: querySnapshot.docs[querySnapshot.docs.length - 1] || null,
        hasMore: querySnapshot.docs.length === limitCount
      };
    } catch (error) {
      console.error('Error getting customers:', error);
      return {
        success: false,
        error: error.message,
        customers: []
      };
    }
  }
  
  // Get pending customers (for admins/supervisors)
  static async getPendingCustomers(companyId = null, userProfile = null) {
    try {
      if (!userProfile) {
        userProfile = await this.getCurrentUserProfile();
      }
      
      // Only admins and supervisors can see pending customers
      if (userProfile?.role !== 'super_admin' && 
          userProfile?.role !== 'admin' && 
          userProfile?.role !== 'supervisor') {
        return {
          success: false,
          error: 'You do not have permission to view pending customers',
          customers: []
        };
      }
      
      const effectiveCompanyId = companyId || userProfile?.companyId;
      
      let q;
      if (effectiveCompanyId) {
        q = query(
          collection(db, 'customers'),
          where('companyId', '==', effectiveCompanyId),
          where('status', '==', 'pending'),
          orderBy('createdAt', 'desc')
        );
      } else {
        // For users without company, filter by userId
        const userId = this.getCurrentUserId();
        q = query(
          collection(db, 'customers'),
          where('userId', '==', userId),
          where('status', '==', 'pending'),
          orderBy('createdAt', 'desc')
        );
      }

      const querySnapshot = await getDocs(q);
      const customers = [];
      
      querySnapshot.forEach((doc) => {
        customers.push({ id: doc.id, ...doc.data() });
      });

      return {
        success: true,
        customers
      };
    } catch (error) {
      console.error('Error getting pending customers:', error);
      return {
        success: false,
        error: error.message,
        customers: []
      };
    }
  }

  // Search customers by name, email, or phone
  static async searchCustomers(searchTerm, limitCount = 20) {
    try {
      const userId = this.getCurrentUserId();
      
      // Get all customers and filter client-side for now
      // In production, you might want to use Algolia or similar for better search
      const result = await this.getCustomers(1000); // Get more for search
      
      if (!result.success) {
        return result;
      }

      const filteredCustomers = result.customers.filter(customer => {
        const searchLower = searchTerm.toLowerCase();
        return (
          customer.name?.toLowerCase().includes(searchLower) ||
          customer.email?.toLowerCase().includes(searchLower) ||
          customer.phone?.includes(searchTerm) ||
          customer.address?.toLowerCase().includes(searchLower)
        );
      });

      return {
        success: true,
        customers: filteredCustomers.slice(0, limitCount)
      };
    } catch (error) {
      console.error('Error searching customers:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get customer by ID (role-aware access)
  static async getCustomer(customerId, userProfile = null) {
    try {
      const userId = this.getCurrentUserId();
      
      if (!userProfile) {
        userProfile = await this.getCurrentUserProfile();
      }
      
      const customerDoc = await getDoc(doc(db, 'customers', customerId));
      
      if (!customerDoc.exists()) {
        return {
          success: false,
          error: 'Customer not found'
        };
      }

      const customerData = customerDoc.data();
      
      // Role-based access check:
      // - Owner can access
      // - Super admin can access
      // - Company admin/supervisor can access same company customers
      const isOwner = customerData.userId === userId;
      const isSuperAdmin = userProfile?.role === 'super_admin' || 
                          userProfile?.email === 'sroy@worksidesoftware.com';
      const isCompanyAdminOrSupervisor = (userProfile?.role === 'admin' || 
                                         userProfile?.role === 'supervisor') &&
                                         customerData.companyId === userProfile?.companyId;
      
      if (!isOwner && !isSuperAdmin && !isCompanyAdminOrSupervisor) {
        return {
          success: false,
          error: 'Unauthorized to access this customer'
        };
      }

      return {
        success: true,
        customer: { id: customerDoc.id, ...customerData }
      };
    } catch (error) {
      console.error('Error getting customer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Update customer
  static async updateCustomer(customerId, updates) {
    try {
      const userId = this.getCurrentUserId();
      
      // Verify user owns the customer
      const customerResult = await this.getCustomer(customerId);
      if (!customerResult.success) {
        return customerResult;
      }

      const updatedData = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'customers', customerId), updatedData);

      return {
        success: true,
        customer: { ...customerResult.customer, ...updatedData }
      };
    } catch (error) {
      console.error('Error updating customer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Delete customer (soft delete)
  static async deleteCustomer(customerId) {
    try {
      const userId = this.getCurrentUserId();
      
      // Verify user owns the customer
      const customerResult = await this.getCustomer(customerId);
      if (!customerResult.success) {
        return customerResult;
      }

      // Soft delete by setting isActive to false
      await updateDoc(doc(db, 'customers', customerId), {
        isActive: false,
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      return {
        success: true
      };
    } catch (error) {
      console.error('Error deleting customer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Permanently delete customer
  static async permanentlyDeleteCustomer(customerId) {
    try {
      const userId = this.getCurrentUserId();
      
      // Verify user owns the customer
      const customerResult = await this.getCustomer(customerId);
      if (!customerResult.success) {
        return customerResult;
      }

      await deleteDoc(doc(db, 'customers', customerId));

      return {
        success: true
      };
    } catch (error) {
      console.error('Error permanently deleting customer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Restore soft-deleted customer
  static async restoreCustomer(customerId) {
    try {
      const userId = this.getCurrentUserId();
      
      // Verify user owns the customer
      const customerResult = await this.getCustomer(customerId);
      if (!customerResult.success) {
        return customerResult;
      }

      await updateDoc(doc(db, 'customers', customerId), {
        isActive: true,
        deletedAt: null,
        updatedAt: new Date().toISOString()
      });

      return {
        success: true
      };
    } catch (error) {
      console.error('Error restoring customer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get customer statistics (role-aware)
  static async getCustomerStats(userProfile = null) {
    try {
      const userId = this.getCurrentUserId();
      
      if (!userProfile) {
        userProfile = await this.getCurrentUserProfile();
      }
      
      // Build query based on role
      let q;
      if (userProfile?.role === 'super_admin' || 
          userProfile?.role === 'admin' || 
          userProfile?.role === 'supervisor') {
        if (userProfile?.companyId) {
          q = query(
            collection(db, 'customers'),
            where('companyId', '==', userProfile.companyId)
          );
        } else {
          q = query(
            collection(db, 'customers'),
            where('userId', '==', userId)
          );
        }
      } else {
        q = query(
          collection(db, 'customers'),
          where('userId', '==', userId)
        );
      }
      
      const querySnapshot = await getDocs(q);
      
      let totalCustomers = 0;
      let activeCustomers = 0;
      let pendingCustomers = 0;
      let totalRevenue = 0;
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        totalCustomers++;
        if (data.isActive && data.status === 'approved') {
          activeCustomers++;
        }
        if (data.status === 'pending') {
          pendingCustomers++;
        }
        totalRevenue += data.totalSpent || 0;
      });

      return {
        success: true,
        stats: {
          totalCustomers,
          activeCustomers,
          inactiveCustomers: totalCustomers - activeCustomers - pendingCustomers,
          pendingCustomers,
          totalRevenue
        }
      };
    } catch (error) {
      console.error('Error getting customer stats:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Import customers from CSV (placeholder for future implementation)
  static async importCustomers(csvData) {
    try {
      // This would parse CSV and create multiple customers
      // For now, return a placeholder
      return {
        success: false,
        error: 'CSV import not yet implemented'
      };
    } catch (error) {
      console.error('Error importing customers:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Export customers to CSV (placeholder for future implementation)
  static async exportCustomers() {
    try {
      const result = await this.getCustomers(1000);
      if (!result.success) {
        return result;
      }

      // Convert to CSV format
      const headers = ['Name', 'Email', 'Phone', 'Address', 'City', 'State', 'ZIP', 'Created Date'];
      const csvRows = [headers.join(',')];
      
      result.customers.forEach(customer => {
        const row = [
          customer.name || '',
          customer.email || '',
          customer.phone || '',
          customer.address || '',
          customer.city || '',
          customer.state || '',
          customer.zipCode || '',
          customer.createdAt || ''
        ];
        csvRows.push(row.map(field => `"${field}"`).join(','));
      });

      return {
        success: true,
        csvData: csvRows.join('\n')
      };
    } catch (error) {
      console.error('Error exporting customers:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default CustomerService;
