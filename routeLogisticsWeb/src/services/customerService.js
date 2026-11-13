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
import { scopeWhere, tenantFields, isInScope } from './tenancy';

class CustomerService {
  // Get current user ID
  static getCurrentUserId() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No user is currently signed in');
    }
    return user.uid;
  }

  // Create a new customer
  static async createCustomer(customerData) {
    try {
      const userId = this.getCurrentUserId();
      
      const customer = {
        ...customerData,
        ...tenantFields(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        totalJobs: 0,
        totalSpent: 0,
        lastServiceDate: null
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

  // Get all customers for the current user
  static async getCustomers(limitCount = 50, lastDoc = null) {
    try {
      const userId = this.getCurrentUserId();
      
      let q = query(
        collection(db, 'customers'),
        scopeWhere(),
        orderBy('name', 'asc'),
        limit(limitCount)
      );

      if (lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const querySnapshot = await getDocs(q);
      const customers = [];
      
      querySnapshot.forEach((doc) => {
        customers.push({ id: doc.id, ...doc.data() });
      });

      return {
        success: true,
        customers,
        lastDoc: querySnapshot.docs[querySnapshot.docs.length - 1] || null,
        hasMore: querySnapshot.docs.length === limitCount
      };
    } catch (error) {
      console.error('Error getting customers:', error);
      return {
        success: false,
        error: error.message
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

  // Get customer by ID
  static async getCustomer(customerId) {
    try {
      const userId = this.getCurrentUserId();
      const customerDoc = await getDoc(doc(db, 'customers', customerId));
      
      if (!customerDoc.exists()) {
        return {
          success: false,
          error: 'Customer not found'
        };
      }

      const customerData = customerDoc.data();
      
      // Verify user owns this customer
      if (!isInScope(customerData)) {
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

  // Get customer statistics
  static async getCustomerStats() {
    try {
      const userId = this.getCurrentUserId();
      
      const q = query(
        collection(db, 'customers'),
        scopeWhere()
      );
      
      const querySnapshot = await getDocs(q);
      
      let totalCustomers = 0;
      let activeCustomers = 0;
      let totalRevenue = 0;
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        totalCustomers++;
        if (data.isActive) {
          activeCustomers++;
        }
        totalRevenue += data.totalSpent || 0;
      });

      return {
        success: true,
        stats: {
          totalCustomers,
          activeCustomers,
          inactiveCustomers: totalCustomers - activeCustomers,
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
