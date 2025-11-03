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
  orderBy
} from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './firebase';

class EstimateTemplateService {
  // Get current user ID
  static getCurrentUserId() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No user is currently signed in');
    }
    return user.uid;
  }

  // Create a new estimate template
  static async createTemplate(templateData) {
    try {
      const userId = this.getCurrentUserId();
      
      const template = {
        ...templateData,
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        usageCount: 0
      };

      const docRef = await addDoc(collection(db, 'estimateTemplates'), template);
      
      return {
        success: true,
        templateId: docRef.id,
        template: { id: docRef.id, ...template }
      };
    } catch (error) {
      console.error('Error creating template:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get all templates for the current user
  static async getTemplates() {
    try {
      const userId = this.getCurrentUserId();
      
      const q = query(
        collection(db, 'estimateTemplates'),
        where('userId', '==', userId),
        orderBy('name', 'asc')
      );

      const querySnapshot = await getDocs(q);
      const templates = [];
      
      querySnapshot.forEach((doc) => {
        templates.push({ id: doc.id, ...doc.data() });
      });

      return {
        success: true,
        templates
      };
    } catch (error) {
      console.error('Error getting templates:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get template by ID
  static async getTemplate(templateId) {
    try {
      const userId = this.getCurrentUserId();
      const templateDoc = await getDoc(doc(db, 'estimateTemplates', templateId));
      
      if (!templateDoc.exists()) {
        return {
          success: false,
          error: 'Template not found'
        };
      }

      const templateData = templateDoc.data();
      
      // Verify user owns this template
      if (templateData.userId !== userId) {
        return {
          success: false,
          error: 'Unauthorized to access this template'
        };
      }

      return {
        success: true,
        template: { id: templateDoc.id, ...templateData }
      };
    } catch (error) {
      console.error('Error getting template:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Update template
  static async updateTemplate(templateId, updates) {
    try {
      const userId = this.getCurrentUserId();
      
      // Verify user owns the template
      const templateResult = await this.getTemplate(templateId);
      if (!templateResult.success) {
        return templateResult;
      }

      const updatedData = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'estimateTemplates', templateId), updatedData);

      return {
        success: true,
        template: { ...templateResult.template, ...updatedData }
      };
    } catch (error) {
      console.error('Error updating template:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Delete template
  static async deleteTemplate(templateId) {
    try {
      const userId = this.getCurrentUserId();
      
      // Verify user owns the template
      const templateResult = await this.getTemplate(templateId);
      if (!templateResult.success) {
        return templateResult;
      }

      await deleteDoc(doc(db, 'estimateTemplates', templateId));

      return {
        success: true
      };
    } catch (error) {
      console.error('Error deleting template:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Increment usage count when template is used
  static async incrementUsage(templateId) {
    try {
      const templateResult = await this.getTemplate(templateId);
      if (!templateResult.success) {
        return templateResult;
      }

      const newUsageCount = (templateResult.template.usageCount || 0) + 1;
      
      await updateDoc(doc(db, 'estimateTemplates', templateId), {
        usageCount: newUsageCount,
        updatedAt: new Date().toISOString()
      });

      return {
        success: true,
        usageCount: newUsageCount
      };
    } catch (error) {
      console.error('Error incrementing usage:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Duplicate template
  static async duplicateTemplate(templateId) {
    try {
      const templateResult = await this.getTemplate(templateId);
      if (!templateResult.success) {
        return templateResult;
      }

      const originalTemplate = templateResult.template;
      const duplicatedTemplate = {
        ...originalTemplate,
        name: `${originalTemplate.name} (Copy)`,
        usageCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Remove the id field so it creates a new document
      delete duplicatedTemplate.id;

      const docRef = await addDoc(collection(db, 'estimateTemplates'), duplicatedTemplate);
      
      return {
        success: true,
        templateId: docRef.id,
        template: { id: docRef.id, ...duplicatedTemplate }
      };
    } catch (error) {
      console.error('Error duplicating template:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get template statistics
  static async getTemplateStats() {
    try {
      const userId = this.getCurrentUserId();
      
      const q = query(
        collection(db, 'estimateTemplates'),
        where('userId', '==', userId)
      );
      
      const querySnapshot = await getDocs(q);
      
      let totalTemplates = 0;
      let activeTemplates = 0;
      let totalUsage = 0;
      let mostUsedTemplate = null;
      let maxUsage = 0;
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        totalTemplates++;
        if (data.isActive) {
          activeTemplates++;
        }
        const usage = data.usageCount || 0;
        totalUsage += usage;
        
        if (usage > maxUsage) {
          maxUsage = usage;
          mostUsedTemplate = { id: doc.id, ...data };
        }
      });

      return {
        success: true,
        stats: {
          totalTemplates,
          activeTemplates,
          inactiveTemplates: totalTemplates - activeTemplates,
          totalUsage,
          mostUsedTemplate
        }
      };
    } catch (error) {
      console.error('Error getting template stats:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Create default templates for new users
  static async createDefaultTemplates() {
    try {
      const userId = this.getCurrentUserId();
      
      // Check if user already has templates
      const existingTemplates = await this.getTemplates();
      if (existingTemplates.success && existingTemplates.templates.length > 0) {
        return {
          success: true,
          message: 'User already has templates'
        };
      }

      const defaultTemplates = [
        {
          name: 'Pool Maintenance',
          description: 'Regular pool cleaning and maintenance service',
          serviceType: 'Pool Maintenance',
          scopeOfWork: '• Weekly pool cleaning and skimming\n• Chemical balancing and testing\n• Equipment inspection and maintenance\n• Pool vacuuming and brushing\n• Filter cleaning and backwashing',
          materials: '• Pool chemicals (chlorine, pH adjusters)\n• Pool cleaning supplies\n• Filter media (if needed)',
          laborHours: 2,
          laborRate: 75,
          materialCost: 25,
          totalCost: 175,
          notes: 'Service includes basic chemical testing and adjustment. Additional chemicals or repairs quoted separately.',
          terms: 'Payment due upon completion. Service valid for 30 days.',
          validityDays: 30
        },
        {
          name: 'Pest Control Service',
          description: 'Comprehensive pest control treatment',
          serviceType: 'Pest Control',
          scopeOfWork: '• Interior and exterior inspection\n• Targeted treatment application\n• Entry point sealing recommendations\n• Follow-up inspection scheduling',
          materials: '• Pest control chemicals\n• Application equipment\n• Safety materials',
          laborHours: 1.5,
          laborRate: 85,
          materialCost: 45,
          totalCost: 172.50,
          notes: 'Treatment includes 30-day warranty. Follow-up service recommended in 2-3 months.',
          terms: 'Payment due upon completion. Warranty covers re-treatment if needed.',
          validityDays: 30
        },
        {
          name: 'Handyman Service',
          description: 'General handyman repairs and maintenance',
          serviceType: 'Handyman',
          scopeOfWork: '• Minor repairs and maintenance\n• Installation services\n• Assembly and mounting\n• General home improvements',
          materials: '• Hardware and fasteners\n• Basic materials as needed\n• Tools and equipment',
          laborHours: 3,
          laborRate: 65,
          materialCost: 50,
          totalCost: 245,
          notes: 'Service includes basic materials. Specialty items quoted separately.',
          terms: 'Payment due upon completion. 90-day warranty on workmanship.',
          validityDays: 30
        },
        {
          name: 'Landscaping Service',
          description: 'Landscape maintenance and improvement',
          serviceType: 'Landscaping',
          scopeOfWork: '• Lawn mowing and edging\n• Hedge trimming and pruning\n• Mulching and weeding\n• Plant installation and care',
          materials: '• Mulch and soil amendments\n• Plants and seeds\n• Fertilizers and treatments',
          laborHours: 4,
          laborRate: 60,
          materialCost: 75,
          totalCost: 315,
          notes: 'Service includes seasonal plant care recommendations.',
          terms: 'Payment due upon completion. Plant warranty as per nursery policy.',
          validityDays: 30
        }
      ];

      const createdTemplates = [];
      
      for (const templateData of defaultTemplates) {
        const template = {
          ...templateData,
          userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isActive: true,
          usageCount: 0
        };

        const docRef = await addDoc(collection(db, 'estimateTemplates'), template);
        createdTemplates.push({ id: docRef.id, ...template });
      }

      return {
        success: true,
        templates: createdTemplates
      };
    } catch (error) {
      console.error('Error creating default templates:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default EstimateTemplateService;
