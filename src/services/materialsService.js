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
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from './firebase';

class MaterialsService {
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

  /**
   * Get all materials for a company
   * @param {string} companyId - Company ID (optional, uses effective company if not provided)
   * @param {Object} userProfile - User profile (optional, for super admin access)
   * @returns {Promise<Object>} { success: boolean, materials: Array, error?: string }
   */
  static async getMaterials(companyId = null, userProfile = null) {
    try {
      const userId = this.getCurrentUserId();
      const user = auth.currentUser;
      
      // Get user profile if not provided
      if (!userProfile) {
        userProfile = await this.getCurrentUserProfile();
      }
      
      const isSuperAdmin = user?.email === 'sroy@worksidesoftware.com' || 
                          userProfile?.role === 'super_admin' ||
                          userProfile?.email === 'sroy@worksidesoftware.com';
      
      let q;
      
      // Always use a where clause for better security rule evaluation
      // For super admin without companyId, we'll need to fetch all and filter client-side
      // or require a companyId for queries
      const effectiveCompanyId = companyId || userProfile?.companyId;
      
      if (!effectiveCompanyId && !isSuperAdmin) {
        return {
          success: false,
          error: 'Company ID is required',
          materials: []
        };
      }

      if (isSuperAdmin && !companyId) {
        // Super admin viewing all materials - query without companyId filter
        // This requires the security rules to allow it
        // We'll limit results to avoid large queries
        q = query(
          collection(db, 'materials')
        );
      } else {
        // Query with companyId (works for both super admin with companyId and regular users)
        q = query(
          collection(db, 'materials'),
          where('companyId', '==', effectiveCompanyId)
        );
      }
      
      const snapshot = await getDocs(q);
      const materials = [];
      
      snapshot.forEach((doc) => {
        materials.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // Sort by name client-side
      materials.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      
      return {
        success: true,
        materials
      };
    } catch (error) {
      console.error('Error getting materials:', error);
      return {
        success: false,
        error: error.message,
        materials: []
      };
    }
  }

  /**
   * Get active materials only (for mobile app)
   * @param {string} companyId - Company ID
   * @returns {Promise<Object>} { success: boolean, materials: Array, error?: string }
   */
  static async getActiveMaterials(companyId) {
    try {
      if (!companyId) {
        return {
          success: false,
          error: 'Company ID is required',
          materials: []
        };
      }

      const q = query(
        collection(db, 'materials'),
        where('companyId', '==', companyId),
        where('active', '==', true)
      );

      const snapshot = await getDocs(q);
      const materials = [];

      snapshot.forEach((doc) => {
        materials.push({
          id: doc.id,
          ...doc.data()
        });
      });

      // Sort by name
      materials.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      return {
        success: true,
        materials
      };
    } catch (error) {
      console.error('Error getting active materials:', error);
      return {
        success: false,
        error: error.message,
        materials: []
      };
    }
  }

  /**
   * Get a single material by ID
   * @param {string} materialId - Material document ID
   * @returns {Promise<Object>} { success: boolean, material?: Object, error?: string }
   */
  static async getMaterial(materialId) {
    try {
      if (!materialId) {
        return {
          success: false,
          error: 'Material ID is required'
        };
      }

      const materialDoc = await getDoc(doc(db, 'materials', materialId));
      
      if (!materialDoc.exists()) {
        return {
          success: false,
          error: 'Material not found'
        };
      }

      return {
        success: true,
        material: {
          id: materialDoc.id,
          ...materialDoc.data()
        }
      };
    } catch (error) {
      console.error('Error getting material:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a new material
   * @param {Object} materialData - Material data
   * @param {string} companyId - Company ID (optional, uses user's company if not provided)
   * @returns {Promise<Object>} { success: boolean, material?: Object, error?: string }
   */
  static async createMaterial(materialData, companyId = null) {
    try {
      const userId = this.getCurrentUserId();
      const userProfile = await this.getCurrentUserProfile();
      
      // Check permissions - only admin/supervisor can create
      if (userProfile?.role !== 'admin' && 
          userProfile?.role !== 'supervisor' && 
          userProfile?.role !== 'super_admin') {
        return {
          success: false,
          error: 'Only admins and supervisors can create materials'
        };
      }

      const effectiveCompanyId = companyId || userProfile?.companyId;
      if (!effectiveCompanyId) {
        return {
          success: false,
          error: 'Company ID is required'
        };
      }

      // Validate required fields
      if (!materialData.name || !materialData.category || !materialData.unit || !materialData.retailPrice) {
        return {
          success: false,
          error: 'Name, category, unit, and retail price are required'
        };
      }

      const now = Timestamp.now();
      const material = {
        name: materialData.name.trim(),
        description: materialData.description?.trim() || '',
        category: materialData.category.trim(),
        subcategory: materialData.subcategory?.trim() || '',
        unit: materialData.unit.trim(),
        costPerUnit: materialData.costPerUnit || 0,
        retailPrice: parseFloat(materialData.retailPrice) || 0,
        supplier: materialData.supplier?.trim() || '',
        supplierSku: materialData.supplierSku?.trim() || '',
        reorderThreshold: materialData.reorderThreshold || 0,
        quantityInStock: materialData.quantityInStock || 0,
        storageLocation: materialData.storageLocation?.trim() || '',
        imageUrl: materialData.imageUrl?.trim() || '',
        barcode: materialData.barcode?.trim() || '',
        expirationDate: materialData.expirationDate || null,
        active: materialData.active !== undefined ? materialData.active : true,
        taxable: materialData.taxable !== undefined ? materialData.taxable : false,
        internalNotes: materialData.internalNotes?.trim() || '',
        defaultMarkupPercent: materialData.defaultMarkupPercent || 0,
        companyId: effectiveCompanyId,
        createdAt: now,
        updatedAt: now,
        createdBy: userId
      };

      const docRef = await addDoc(collection(db, 'materials'), material);

      return {
        success: true,
        material: {
          id: docRef.id,
          ...material
        }
      };
    } catch (error) {
      console.error('Error creating material:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update a material
   * @param {string} materialId - Material document ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} { success: boolean, error?: string }
   */
  static async updateMaterial(materialId, updates) {
    try {
      const userId = this.getCurrentUserId();
      const userProfile = await this.getCurrentUserProfile();
      
      // Check permissions - only admin/supervisor can update
      if (userProfile?.role !== 'admin' && 
          userProfile?.role !== 'supervisor' && 
          userProfile?.role !== 'super_admin') {
        return {
          success: false,
          error: 'Only admins and supervisors can update materials'
        };
      }

      if (!materialId) {
        return {
          success: false,
          error: 'Material ID is required'
        };
      }

      // Validate required fields if being updated
      if (updates.name !== undefined && !updates.name.trim()) {
        return {
          success: false,
          error: 'Name is required'
        };
      }
      if (updates.category !== undefined && !updates.category.trim()) {
        return {
          success: false,
          error: 'Category is required'
        };
      }
      if (updates.unit !== undefined && !updates.unit.trim()) {
        return {
          success: false,
          error: 'Unit is required'
        };
      }
      if (updates.retailPrice !== undefined && (updates.retailPrice === null || updates.retailPrice === '')) {
        return {
          success: false,
          error: 'Retail price is required'
        };
      }

      const updateData = {
        ...updates,
        updatedAt: Timestamp.now(),
        updatedBy: userId
      };

      // Clean up fields
      if (updateData.name) updateData.name = updateData.name.trim();
      if (updateData.description) updateData.description = updateData.description.trim();
      if (updateData.category) updateData.category = updateData.category.trim();
      if (updateData.subcategory) updateData.subcategory = updateData.subcategory.trim();
      if (updateData.supplier) updateData.supplier = updateData.supplier.trim();
      if (updateData.supplierSku) updateData.supplierSku = updateData.supplierSku.trim();
      if (updateData.storageLocation) updateData.storageLocation = updateData.storageLocation.trim();
      if (updateData.internalNotes) updateData.internalNotes = updateData.internalNotes.trim();
      if (updateData.imageUrl) updateData.imageUrl = updateData.imageUrl.trim();
      if (updateData.barcode) updateData.barcode = updateData.barcode.trim();
      if (updateData.retailPrice !== undefined) updateData.retailPrice = parseFloat(updateData.retailPrice) || 0;
      if (updateData.costPerUnit !== undefined) updateData.costPerUnit = parseFloat(updateData.costPerUnit) || 0;
      if (updateData.reorderThreshold !== undefined) updateData.reorderThreshold = parseFloat(updateData.reorderThreshold) || 0;
      if (updateData.quantityInStock !== undefined) updateData.quantityInStock = parseFloat(updateData.quantityInStock) || 0;
      if (updateData.defaultMarkupPercent !== undefined) updateData.defaultMarkupPercent = parseFloat(updateData.defaultMarkupPercent) || 0;
      if (updateData.active !== undefined) {
        if (typeof updateData.active === 'string') {
          updateData.active = ['true', 'yes', '1', 'active'].includes(updateData.active.toLowerCase());
        }
        updateData.active = Boolean(updateData.active);
      }
      if (updateData.taxable !== undefined) {
        if (typeof updateData.taxable === 'string') {
          updateData.taxable = ['true', 'yes', '1', 'taxable'].includes(updateData.taxable.toLowerCase());
        }
        updateData.taxable = Boolean(updateData.taxable);
      }

      await updateDoc(doc(db, 'materials', materialId), updateData);

      return {
        success: true
      };
    } catch (error) {
      console.error('Error updating material:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete a material
   * @param {string} materialId - Material document ID
   * @returns {Promise<Object>} { success: boolean, error?: string }
   */
  static async deleteMaterial(materialId) {
    try {
      const userProfile = await this.getCurrentUserProfile();
      
      // Check permissions - only admin/supervisor can delete
      if (userProfile?.role !== 'admin' && 
          userProfile?.role !== 'supervisor' && 
          userProfile?.role !== 'super_admin') {
        return {
          success: false,
          error: 'Only admins and supervisors can delete materials'
        };
      }

      if (!materialId) {
        return {
          success: false,
          error: 'Material ID is required'
        };
      }

      // Check if material is used in any jobMaterials
      const jobMaterialsQuery = query(
        collection(db, 'jobMaterials'),
        where('materialId', '==', materialId)
      );
      const jobMaterialsSnapshot = await getDocs(jobMaterialsQuery);
      
      if (!jobMaterialsSnapshot.empty) {
        return {
          success: false,
          error: 'Cannot delete material that has been used in jobs. Deactivate it instead.'
        };
      }

      await deleteDoc(doc(db, 'materials', materialId));

      return {
        success: true
      };
    } catch (error) {
      console.error('Error deleting material:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get materials by category
   * @param {string} companyId - Company ID
   * @param {string} category - Category name (optional)
   * @param {boolean} activeOnly - Only return active materials
   * @returns {Promise<Object>} { success: boolean, materials: Array, error?: string }
   */
  static async getMaterialsByCategory(companyId, category = null, activeOnly = false) {
    try {
      if (!companyId) {
        return {
          success: false,
          error: 'Company ID is required',
          materials: []
        };
      }

      let q;
      if (category && activeOnly) {
        q = query(
          collection(db, 'materials'),
          where('companyId', '==', companyId),
          where('category', '==', category),
          where('active', '==', true)
        );
      } else if (category) {
        q = query(
          collection(db, 'materials'),
          where('companyId', '==', companyId),
          where('category', '==', category)
        );
      } else if (activeOnly) {
        q = query(
          collection(db, 'materials'),
          where('companyId', '==', companyId),
          where('active', '==', true)
        );
      } else {
        q = query(
          collection(db, 'materials'),
          where('companyId', '==', companyId)
        );
      }

      const snapshot = await getDocs(q);
      const materials = [];

      snapshot.forEach((doc) => {
        materials.push({
          id: doc.id,
          ...doc.data()
        });
      });

      materials.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      return {
        success: true,
        materials
      };
    } catch (error) {
      console.error('Error getting materials by category:', error);
      return {
        success: false,
        error: error.message,
        materials: []
      };
    }
  }

  /**
   * Add materials used on a job
   * Creates jobMaterials records linking materials to a job
   * @param {string} jobId - Job ID
   * @param {string} companyId - Company ID
   * @param {string} technicianId - Technician who used the materials
   * @param {string} customerId - Customer ID
   * @param {Array} materialsUsed - Array of {materialId, quantityUsed, notes?}
   * @returns {Promise<Object>} { success: boolean, jobMaterials: Array, error?: string }
   */
  static async addMaterialsToJob(jobId, companyId, technicianId, customerId, materialsUsed) {
    try {
      if (!jobId || !companyId || !technicianId || !customerId) {
        throw new Error('Missing required parameters (jobId, companyId, technicianId, customerId)');
      }

      if (!Array.isArray(materialsUsed) || materialsUsed.length === 0) {
        return {
          success: true,
          jobMaterials: [],
          message: 'No materials to add'
        };
      }

      const userId = this.getCurrentUserId();
      const jobMaterialsRef = collection(db, 'jobMaterials');
      const createdJobMaterials = [];

      // Process each material
      for (const materialUsage of materialsUsed) {
        const { materialId, quantityUsed, notes = '' } = materialUsage;

        if (!materialId || !quantityUsed || quantityUsed <= 0) {
          console.warn('Skipping invalid material usage:', materialUsage);
          continue;
        }

        // Fetch material to get current cost and price
        const materialDoc = await getDoc(doc(db, 'materials', materialId));
        
        if (!materialDoc.exists()) {
          console.warn(`Material ${materialId} not found, skipping`);
          continue;
        }

        const material = materialDoc.data();
        
        // Use current material prices
        const unitCostAtUse = material.costPerUnit || 0;
        const unitPriceAtUse = material.retailPrice || 0;
        const totalCost = quantityUsed * unitCostAtUse;
        const totalPrice = quantityUsed * unitPriceAtUse;

        // Create jobMaterial record
        const jobMaterialData = {
          jobId,
          companyId,
          technicianId,
          customerId,
          materialId,
          quantityUsed,
          unitCostAtUse,
          unitPriceAtUse,
          totalCost,
          totalPrice,
          notes: notes || '',
          dateUsed: serverTimestamp(),
          addedBy: userId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        const jobMaterialRef = await addDoc(jobMaterialsRef, jobMaterialData);
        
        createdJobMaterials.push({
          id: jobMaterialRef.id,
          ...jobMaterialData
        });
      }

      return {
        success: true,
        jobMaterials: createdJobMaterials,
        count: createdJobMaterials.length
      };
    } catch (error) {
      console.error('Error adding materials to job:', error);
      return {
        success: false,
        error: error.message || 'Failed to add materials to job',
        jobMaterials: []
      };
    }
  }

  /**
   * Get materials used on a job
   * @param {string} jobId - Job ID
   * @returns {Promise<Object>} { success: boolean, jobMaterials: Array, error?: string }
   */
  static async getJobMaterials(jobId) {
    try {
      if (!jobId) {
        throw new Error('Job ID is required');
      }

      const jobMaterialsQuery = query(
        collection(db, 'jobMaterials'),
        where('jobId', '==', jobId),
        orderBy('dateUsed', 'desc')
      );

      const snapshot = await getDocs(jobMaterialsQuery);
      const jobMaterials = [];

      // Fetch material details for each jobMaterial
      const materialPromises = [];
      
      snapshot.forEach((doc) => {
        const jobMaterial = {
          id: doc.id,
          ...doc.data()
        };
        
        if (jobMaterial.materialId) {
          materialPromises.push(
            getDoc(doc(db, 'materials', jobMaterial.materialId))
              .then(materialDoc => ({
                ...jobMaterial,
                material: materialDoc.exists() ? {
                  id: materialDoc.id,
                  ...materialDoc.data()
                } : null
              }))
              .catch(err => {
                console.error('Error fetching material:', err);
                return {
                  ...jobMaterial,
                  material: null
                };
              })
          );
        } else {
          jobMaterials.push(jobMaterial);
        }
      });

      // Wait for all material fetches
      const results = await Promise.all(materialPromises);
      jobMaterials.push(...results);

      return {
        success: true,
        jobMaterials,
        count: jobMaterials.length
      };
    } catch (error) {
      console.error('Error getting job materials:', error);
      // If orderBy fails due to missing index, try without orderBy
      if (error.code === 'failed-precondition') {
        try {
          const jobMaterialsQuery = query(
            collection(db, 'jobMaterials'),
            where('jobId', '==', jobId)
          );
          const snapshot = await getDocs(jobMaterialsQuery);
          const jobMaterials = [];

          snapshot.forEach((doc) => {
            jobMaterials.push({
              id: doc.id,
              ...doc.data()
            });
          });

          return {
            success: true,
            jobMaterials,
            count: jobMaterials.length
          };
        } catch (retryError) {
          return {
            success: false,
            error: retryError.message,
            jobMaterials: []
          };
        }
      }
      
      return {
        success: false,
        error: error.message || 'Failed to get job materials',
        jobMaterials: []
      };
    }
  }

  /**
   * Remove a material from a job
   * @param {string} jobMaterialId - JobMaterial document ID
   * @returns {Promise<Object>} { success: boolean, error?: string }
   */
  static async removeMaterialFromJob(jobMaterialId) {
    try {
      if (!jobMaterialId) {
        throw new Error('JobMaterial ID is required');
      }

      await deleteDoc(doc(db, 'jobMaterials', jobMaterialId));

      return {
        success: true,
        message: 'Material removed from job'
      };
    } catch (error) {
      console.error('Error removing material from job:', error);
      return {
        success: false,
        error: error.message || 'Failed to remove material from job'
      };
    }
  }

  /**
   * Update quantity of material used on a job
   * @param {string} jobMaterialId - JobMaterial document ID
   * @param {number} quantityUsed - New quantity
   * @param {string} notes - Optional notes
   * @returns {Promise<Object>} { success: boolean, jobMaterial?: Object, error?: string }
   */
  static async updateJobMaterialQuantity(jobMaterialId, quantityUsed, notes = null) {
    try {
      if (!jobMaterialId) {
        throw new Error('JobMaterial ID is required');
      }

      if (!quantityUsed || quantityUsed <= 0) {
        throw new Error('Quantity must be greater than 0');
      }

      // Get existing jobMaterial to recalculate totals
      const jobMaterialRef = doc(db, 'jobMaterials', jobMaterialId);
      const jobMaterialDoc = await getDoc(jobMaterialRef);

      if (!jobMaterialDoc.exists()) {
        throw new Error('JobMaterial not found');
      }

      const jobMaterial = jobMaterialDoc.data();
      const unitCostAtUse = jobMaterial.unitCostAtUse || 0;
      const unitPriceAtUse = jobMaterial.unitPriceAtUse || 0;
      
      const updateData = {
        quantityUsed,
        totalCost: quantityUsed * unitCostAtUse,
        totalPrice: quantityUsed * unitPriceAtUse,
        updatedAt: serverTimestamp()
      };

      if (notes !== null) {
        updateData.notes = notes;
      }

      await updateDoc(jobMaterialRef, updateData);

      return {
        success: true,
        jobMaterial: {
          id: jobMaterialDoc.id,
          ...jobMaterial,
          ...updateData
        }
      };
    } catch (error) {
      console.error('Error updating job material quantity:', error);
      return {
        success: false,
        error: error.message || 'Failed to update job material'
      };
    }
  }
}

export default MaterialsService;

