import { readWorkspace, callWorkspace } from './workspaceApi';
import { 
  collection, 
  doc, 
  getDoc, 
  updateDoc, 
  getDocs, 
  query, 
  deleteDoc,
  orderBy,
  limit,
  startAfter,
  documentId
} from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './firebase';
import { scopeWhere, isInScope, getClaims, can, requireCapability } from './tenancy';
import { csvCell } from '../utils/customerCsv';
import { customerView, customerActive, legacyDate } from '../utils/legacyCustomer';

const editableFields = ['name', 'firstName', 'lastName', 'email', 'phone', 'phoneNumber', 'address', 'city', 'state', 'zipCode', 'postalCode', 'notes', 'serviceInstructions', 'isActive', 'status', 'emailConsent'];
const customerInput = data => Object.fromEntries(editableFields.filter(field => Object.hasOwn(data || {}, field)).map(field => [field, data[field]]));
const customerFailure = failure => ({ success: false, error: failure?.message || 'The customer could not be saved. Please try again.', ...(failure?.code ? { code: failure.code } : {}), ...(failure?.details?.matches ? { matches: failure.details.matches } : {}), ...(failure?.details?.addressValidation ? { addressValidation: failure.details.addressValidation } : {}) });

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
  static async createCustomer(customerData, options = {}) {
    try {
      requireCapability('customers.manage');
      this.getCurrentUserId();
      const result = await callWorkspace('rlManageCustomer', { action: 'create', customer: customerInput(customerData), operationId: options.operationId || crypto.randomUUID(), ...(options.duplicateDecision === 'separate' ? { duplicateDecision: 'separate', duplicateReason: options.duplicateReason } : {}) });
      return { success: true, customerId: result.id, customer: customerView(result.id, result.customer) };
    } catch (error) {
      return customerFailure(error);
    }
  }

  // Get all customers for the current user
  static async getCustomers(limitCount = 50, lastDoc = null) {
    try {
      if (getClaims()?.companyId) { const result = await readWorkspace('customers', { limit: limitCount, after: lastDoc?.id || lastDoc }); return { success: true, ...result, customers: result.customers.map(row => customerView(row.id, row)) }; }
      this.getCurrentUserId();
      
      let q = query(
        collection(db, 'customers'),
        scopeWhere(),
        orderBy(documentId()),
        limit(limitCount)
      );

      if (lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const querySnapshot = await getDocs(q);
      const customers = [];
      
      querySnapshot.forEach((doc) => {
        customers.push(customerView(doc.id, doc.data()));
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

  // Search the authorized tenant directory, including customers outside loaded list pages.
  static async searchCustomers(searchTerm, limitCount = 30) {
    try {
      requireCapability('customers.manage');
      this.getCurrentUserId();
      const query = String(searchTerm || '').trim();
      if (query.length < 2) return { success: true, customers: [], hasMore: false };
      const result = await callWorkspace('rlManageInquiry', { action: 'matches', query });
      const matches = result.matches || [];
      return {
        success: true,
        customers: matches.slice(0, limitCount).map(match => customerView(match.customer.id, match.customer)),
        hasMore: result.hasMore || matches.length > limitCount
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
      if (getClaims()?.companyId) return { success: true, ...(await readWorkspace('customers', { id: customerId })) };
      this.getCurrentUserId();
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
        customer: customerView(customerDoc.id, customerData)
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
  static async updateCustomer(customerId, updates, expectedVersion = null) {
    try {
      requireCapability('customers.manage');
      this.getCurrentUserId();
      const result = await callWorkspace('rlManageCustomer', { action: 'update', id: customerId, customer: customerInput(updates), expectedVersion });
      return { success: true, customer: customerView(result.id, result.customer) };
    } catch (error) {
      return customerFailure(error);
    }
  }

  // Delete customer (soft delete)
  static async deleteCustomer(customerId) {
    try {
      requireCapability('customers.manage');
      this.getCurrentUserId();
      
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
      requireCapability('customers.export');
      this.getCurrentUserId();
      
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
      requireCapability('customers.manage');
      this.getCurrentUserId();
      
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
      if (getClaims()?.companyId && !can('reports.financial')) return { success: true, ...(await readWorkspace('customerStats')) };
      this.getCurrentUserId();
      
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
        if (customerActive(data)) {
          activeCustomers++;
        }
        totalRevenue += Number.isFinite(Number(data.totalSpent)) ? Number(data.totalSpent) : 0;
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

  // Export customers to CSV (placeholder for future implementation)
  static async exportCustomers() {
    try {
      requireCapability('customers.export');
      const customers = [];
      let cursor = null;
      do {
        const result = await this.getCustomers(500, cursor);
        if (!result.success) return result;
        customers.push(...result.customers);
        cursor = result.hasMore ? result.lastDoc : null;
      } while (cursor);

      // Convert to CSV format
      const headers = ['Name', 'Email', 'Phone', 'Address', 'City', 'State', 'ZIP', 'Created Date'];
      const csvRows = [headers.join(',')];
      
      customers.forEach(customer => {
        const row = [
          customer.name || '',
          customer.email || '',
          customer.phone || '',
          customer.address || '',
          customer.city || '',
          customer.state || '',
          customer.zipCode || '',
          legacyDate(customer.createdAt)?.toISOString() || ''
        ];
        csvRows.push(row.map(csvCell).join(','));
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
