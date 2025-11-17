import { 
  collection, 
  doc, 
  getDoc, 
  addDoc, 
  updateDoc,
  deleteDoc,
  getDocs, 
  query, 
  where,
  orderBy,
  limit,
  Timestamp
} from 'firebase/firestore';
import { db, auth } from './firebase';

/**
 * Invoice Template Service for managing invoice templates
 */
class InvoiceTemplateService {
  // Get current user ID
  static getCurrentUserId() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No user is currently signed in');
    }
    return user.uid;
  }

  /**
   * Get all templates for the current user's company
   * @param {string} companyId - Company ID
   * @returns {Promise<{success: boolean, templates?: Array, error?: string}>}
   */
  static async getTemplates(companyId) {
    try {
      if (!companyId) {
        return { success: false, error: 'Company ID is required' };
      }

      const templatesRef = collection(db, 'invoiceTemplates');
      const q = query(
        templatesRef,
        where('companyId', '==', companyId),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const templates = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return {
        success: true,
        templates
      };
    } catch (error) {
      console.error('Error getting templates:', error);
      return {
        success: false,
        error: error.message || 'Failed to get templates'
      };
    }
  }

  /**
   * Get template by ID
   * @param {string} templateId - Template ID
   * @returns {Promise<{success: boolean, template?: Object, error?: string}>}
   */
  static async getTemplate(templateId) {
    try {
      const templateDoc = await getDoc(doc(db, 'invoiceTemplates', templateId));
      if (!templateDoc.exists()) {
        return { success: false, error: 'Template not found' };
      }

      return {
        success: true,
        template: { id: templateDoc.id, ...templateDoc.data() }
      };
    } catch (error) {
      console.error('Error getting template:', error);
      return {
        success: false,
        error: error.message || 'Failed to get template'
      };
    }
  }

  /**
   * Create a new template
   * @param {Object} templateData - Template data
   * @returns {Promise<{success: boolean, templateId?: string, error?: string}>}
   */
  static async createTemplate(templateData) {
    try {
      const userId = this.getCurrentUserId();
      const { companyId, name, ...rest } = templateData;

      if (!companyId || !name) {
        return { success: false, error: 'Company ID and name are required' };
      }

      const template = {
        companyId,
        name,
        isDefault: templateData.isDefault || false,
        ...rest,
        userId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      // If this is set as default, unset other defaults
      if (template.isDefault) {
        await this.unsetOtherDefaults(companyId);
      }

      const docRef = await addDoc(collection(db, 'invoiceTemplates'), template);

      return {
        success: true,
        templateId: docRef.id,
        template: { id: docRef.id, ...template }
      };
    } catch (error) {
      console.error('Error creating template:', error);
      return {
        success: false,
        error: error.message || 'Failed to create template'
      };
    }
  }

  /**
   * Update template
   * @param {string} templateId - Template ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async updateTemplate(templateId, updates) {
    try {
      const templateDoc = await getDoc(doc(db, 'invoiceTemplates', templateId));
      if (!templateDoc.exists()) {
        return { success: false, error: 'Template not found' };
      }

      const updateData = {
        ...updates,
        updatedAt: Timestamp.now()
      };

      // If setting as default, unset other defaults
      if (updates.isDefault) {
        const template = templateDoc.data();
        await this.unsetOtherDefaults(template.companyId, templateId);
      }

      await updateDoc(doc(db, 'invoiceTemplates', templateId), updateData);

      return { success: true };
    } catch (error) {
      console.error('Error updating template:', error);
      return {
        success: false,
        error: error.message || 'Failed to update template'
      };
    }
  }

  /**
   * Delete template
   * @param {string} templateId - Template ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async deleteTemplate(templateId) {
    try {
      await deleteDoc(doc(db, 'invoiceTemplates', templateId));
      return { success: true };
    } catch (error) {
      console.error('Error deleting template:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete template'
      };
    }
  }

  /**
   * Get default template for company
   * @param {string} companyId - Company ID
   * @returns {Promise<{success: boolean, template?: Object, error?: string}>}
   */
  static async getDefaultTemplate(companyId) {
    try {
      const templatesRef = collection(db, 'invoiceTemplates');
      const q = query(
        templatesRef,
        where('companyId', '==', companyId),
        where('isDefault', '==', true),
        limit(1)
      );

      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        // Return classic template as fallback
        return {
          success: true,
          template: this.getDefaultClassicTemplate()
        };
      }

      const template = {
        id: querySnapshot.docs[0].id,
        ...querySnapshot.docs[0].data()
      };

      return {
        success: true,
        template
      };
    } catch (error) {
      console.error('Error getting default template:', error);
      return {
        success: true,
        template: this.getDefaultClassicTemplate() // Fallback
      };
    }
  }

  /**
   * Unset other default templates
   * @param {string} companyId - Company ID
   * @param {string} excludeTemplateId - Template ID to exclude from update
   */
  static async unsetOtherDefaults(companyId, excludeTemplateId = null) {
    try {
      const templatesRef = collection(db, 'invoiceTemplates');
      const q = query(
        templatesRef,
        where('companyId', '==', companyId),
        where('isDefault', '==', true)
      );

      const querySnapshot = await getDocs(q);
      const updatePromises = querySnapshot.docs
        .filter(doc => doc.id !== excludeTemplateId)
        .map(doc => updateDoc(doc.ref, { isDefault: false }));

      await Promise.all(updatePromises);
    } catch (error) {
      console.error('Error unsetting defaults:', error);
    }
  }

  /**
   * Get default classic template (fallback)
   */
  static getDefaultClassicTemplate() {
    return {
      id: 'default-classic',
      name: 'Classic',
      layout: 'classic',
      colors: {
        primary: '#10b981', // Green
        secondary: '#6b7280', // Gray
        accent: '#059669'
      },
      fonts: {
        heading: 'helvetica',
        body: 'helvetica'
      },
      logoPosition: 'left',
      headerStyle: 'standard',
      footerText: '',
      showBorder: true,
      borderColor: '#e5e7eb'
    };
  }

  /**
   * Get predefined template configurations
   */
  static getPredefinedTemplates() {
    return {
      classic: {
        name: 'Classic',
        layout: 'classic',
        colors: {
          primary: '#10b981',
          secondary: '#6b7280',
          accent: '#059669'
        },
        fonts: {
          heading: 'helvetica',
          body: 'helvetica'
        },
        logoPosition: 'left',
        headerStyle: 'standard',
        footerText: '',
        showBorder: true,
        borderColor: '#e5e7eb'
      },
      modern: {
        name: 'Modern',
        layout: 'modern',
        colors: {
          primary: '#3b82f6',
          secondary: '#1e40af',
          accent: '#60a5fa'
        },
        fonts: {
          heading: 'helvetica',
          body: 'helvetica'
        },
        logoPosition: 'center',
        headerStyle: 'minimal',
        footerText: '',
        showBorder: false,
        borderColor: '#e5e7eb'
      },
      professional: {
        name: 'Professional',
        layout: 'professional',
        colors: {
          primary: '#1f2937',
          secondary: '#4b5563',
          accent: '#6b7280'
        },
        fonts: {
          heading: 'helvetica',
          body: 'helvetica'
        },
        logoPosition: 'right',
        headerStyle: 'formal',
        footerText: '',
        showBorder: true,
        borderColor: '#374151'
      },
      creative: {
        name: 'Creative',
        layout: 'creative',
        colors: {
          primary: '#8b5cf6',
          secondary: '#a78bfa',
          accent: '#c4b5fd'
        },
        fonts: {
          heading: 'helvetica',
          body: 'helvetica'
        },
        logoPosition: 'left',
        headerStyle: 'bold',
        footerText: '',
        showBorder: false,
        borderColor: '#e5e7eb'
      }
    };
  }
}

export default InvoiceTemplateService;

