import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  deleteDoc,
  addDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db, auth } from './firebase';

/**
 * Route Service
 * Handles saving, loading, and managing routes
 */
class RouteService {
  /**
   * Get current user ID
   */
  static getCurrentUserId() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No user is currently signed in');
    }
    return user.uid;
  }

  /**
   * Get current user profile (for company ID)
   */
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
   * Save a route to Firestore
   * @param {Object} routeData - Route data to save
   * @param {string} routeData.name - Route name
   * @param {string} routeData.date - Date for the route
   * @param {string} routeData.technicianId - Assigned technician ID (optional)
   * @param {Array} routeData.jobIds - Array of job IDs in order
   * @param {Object} routeData.routeInfo - Route optimization info (distance, duration, waypointOrder)
   * @param {Object} routeData.directions - Google Maps directions result (optional, can be large)
   * @param {boolean} routeData.isTemplate - Whether this is a template route
   * @returns {Promise<Object>} { success: boolean, routeId?: string, error?: string }
   */
  static async saveRoute(routeData) {
    try {
      const userId = this.getCurrentUserId();
      const userProfile = await this.getCurrentUserProfile();
      const companyId = userProfile?.companyId;

      if (!companyId) {
        return {
          success: false,
          error: 'Company ID not found. Please ensure you are part of a company.'
        };
      }

      if (!routeData.name || !routeData.name.trim()) {
        return {
          success: false,
          error: 'Route name is required'
        };
      }

      if (!routeData.jobIds || routeData.jobIds.length === 0) {
        return {
          success: false,
          error: 'At least one job is required'
        };
      }

      const routeDoc = {
        companyId,
        name: routeData.name.trim(),
        date: routeData.date || null,
        technicianId: routeData.technicianId || null,
        technicianName: routeData.technicianName || null,
        jobIds: routeData.jobIds,
        jobCount: routeData.jobIds.length,
        routeInfo: {
          totalDistance: routeData.routeInfo?.totalDistance || 0,
          totalDuration: routeData.routeInfo?.totalDuration || 0,
          waypointOrder: routeData.routeInfo?.waypointOrder || []
        },
        isTemplate: routeData.isTemplate || false,
        createdBy: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        // Store directions summary (not full directions object to save space)
        directionsSummary: routeData.directions ? {
          origin: routeData.directions.routes?.[0]?.legs?.[0]?.start_address || null,
          destination: routeData.directions.routes?.[0]?.legs?.[routeData.directions.routes[0].legs.length - 1]?.end_address || null,
          bounds: routeData.directions.routes?.[0]?.bounds ? {
            north: routeData.directions.routes[0].bounds.getNorthEast().lat(),
            south: routeData.directions.routes[0].bounds.getSouthWest().lat(),
            east: routeData.directions.routes[0].bounds.getNorthEast().lng(),
            west: routeData.directions.routes[0].bounds.getSouthWest().lng()
          } : null
        } : null
      };

      const routeRef = await addDoc(collection(db, 'routes'), routeDoc);

      return {
        success: true,
        routeId: routeRef.id,
        route: {
          id: routeRef.id,
          ...routeDoc
        }
      };
    } catch (error) {
      console.error('Error saving route:', error);
      return {
        success: false,
        error: error.message || 'Failed to save route'
      };
    }
  }

  /**
   * Get all routes for a company
   * @param {string} companyId - Company ID (optional, uses user's company if not provided)
   * @param {Object} filters - Filter options
   * @param {boolean} filters.templatesOnly - Only return template routes
   * @param {string} filters.date - Filter by date
   * @param {string} filters.technicianId - Filter by technician
   * @returns {Promise<Object>} { success: boolean, routes: Array, error?: string }
   */
  static async getRoutes(companyId = null, filters = {}) {
    let effectiveCompanyId;
    try {
      const userProfile = await this.getCurrentUserProfile();
      effectiveCompanyId = companyId || userProfile?.companyId;

      if (!effectiveCompanyId) {
        return {
          success: false,
          error: 'Company ID not found',
          routes: []
        };
      }

      let q = query(
        collection(db, 'routes'),
        where('companyId', '==', effectiveCompanyId),
        orderBy('createdAt', 'desc')
      );

      // Apply filters
      if (filters.templatesOnly) {
        q = query(q, where('isTemplate', '==', true));
      }

      if (filters.date) {
        q = query(q, where('date', '==', filters.date));
      }

      if (filters.technicianId) {
        q = query(q, where('technicianId', '==', filters.technicianId));
      }

      const snapshot = await getDocs(q);
      const routes = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        routes.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || data.createdAt || null,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt || null
        });
      });

      // Apply additional client-side filters if needed
      let filteredRoutes = routes;
      if (filters.templatesOnly === false) {
        filteredRoutes = filteredRoutes.filter(r => !r.isTemplate);
      }

      return {
        success: true,
        routes: filteredRoutes,
        count: filteredRoutes.length
      };
    } catch (error) {
      console.error('Error getting routes:', error);
      // If orderBy fails due to missing index, try without it
      if (error.code === 'failed-precondition') {
        try {
          let q = query(
            collection(db, 'routes'),
            where('companyId', '==', effectiveCompanyId)
          );
          const snapshot = await getDocs(q);
          const routes = [];

          snapshot.forEach((doc) => {
            routes.push({
              id: doc.id,
              ...doc.data()
            });
          });

          // Sort manually by createdAt descending
          routes.sort((a, b) => {
            const aTime = a.createdAt?.toDate?.() || a.createdAt || new Date(0);
            const bTime = b.createdAt?.toDate?.() || b.createdAt || new Date(0);
            return new Date(bTime).getTime() - new Date(aTime).getTime();
          });

          return {
            success: true,
            routes,
            count: routes.length
          };
        } catch (retryError) {
          return {
            success: false,
            error: retryError.message,
            routes: []
          };
        }
      }

      // Retry: get company ID if not already set
      if (!effectiveCompanyId) {
        const userProfile = await this.getCurrentUserProfile();
        effectiveCompanyId = companyId || userProfile?.companyId;
      }

      if (!effectiveCompanyId) {
        return {
          success: false,
          error: 'Company ID not found',
          routes: []
        };
      }

      return {
        success: false,
        error: error.message || 'Failed to get routes',
        routes: []
      };
    }
  }

  /**
   * Get a single route by ID
   * @param {string} routeId - Route document ID
   * @returns {Promise<Object>} { success: boolean, route?: Object, error?: string }
   */
  static async getRoute(routeId) {
    try {
      if (!routeId) {
        return {
          success: false,
          error: 'Route ID is required'
        };
      }

      const routeDoc = await getDoc(doc(db, 'routes', routeId));

      if (!routeDoc.exists()) {
        return {
          success: false,
          error: 'Route not found'
        };
      }

      const data = routeDoc.data();
      return {
        success: true,
        route: {
          id: routeDoc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || data.createdAt || null,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt || null
        }
      };
    } catch (error) {
      console.error('Error getting route:', error);
      return {
        success: false,
        error: error.message || 'Failed to get route'
      };
    }
  }

  /**
   * Update a route
   * @param {string} routeId - Route document ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} { success: boolean, error?: string }
   */
  static async updateRoute(routeId, updates) {
    try {
      if (!routeId) {
        return {
          success: false,
          error: 'Route ID is required'
        };
      }

      const updateData = {
        ...updates,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'routes', routeId), updateData);

      return {
        success: true
      };
    } catch (error) {
      console.error('Error updating route:', error);
      return {
        success: false,
        error: error.message || 'Failed to update route'
      };
    }
  }

  /**
   * Delete a route
   * @param {string} routeId - Route document ID
   * @returns {Promise<Object>} { success: boolean, error?: string }
   */
  static async deleteRoute(routeId) {
    try {
      if (!routeId) {
        return {
          success: false,
          error: 'Route ID is required'
        };
      }

      await deleteDoc(doc(db, 'routes', routeId));

      return {
        success: true
      };
    } catch (error) {
      console.error('Error deleting route:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete route'
      };
    }
  }

  /**
   * Load a saved route (get jobs in route order)
   * @param {string} routeId - Route document ID
   * @returns {Promise<Object>} { success: boolean, jobs?: Array, route?: Object, error?: string }
   */
  static async loadRoute(routeId) {
    try {
      const routeResult = await this.getRoute(routeId);
      if (!routeResult.success) {
        return routeResult;
      }

      const route = routeResult.route;

      // Fetch job details for each job ID
      const jobPromises = route.jobIds.map(async (jobId) => {
        try {
          const jobDoc = await getDoc(doc(db, 'jobs', jobId));
          if (jobDoc.exists()) {
            return {
              id: jobDoc.id,
              ...jobDoc.data()
            };
          }
          return null;
        } catch (error) {
          console.error(`Error fetching job ${jobId}:`, error);
          return null;
        }
      });

      const jobs = (await Promise.all(jobPromises)).filter(Boolean);

      return {
        success: true,
        route,
        jobs,
        jobIds: route.jobIds
      };
    } catch (error) {
      console.error('Error loading route:', error);
      return {
        success: false,
        error: error.message || 'Failed to load route'
      };
    }
  }

  /**
   * Apply a template route to a new date (clone jobs from template)
   * @param {string} templateRouteId - Template route document ID
   * @param {string} targetDate - Target date in YYYY-MM-DD format
   * @param {string} technicianId - Optional: Assign to specific technician
   * @returns {Promise<Object>} { success: boolean, jobs?: Array, routeId?: string, error?: string }
   */
  static async applyTemplateRoute(templateRouteId, targetDate, technicianId = null) {
    try {
      const userId = this.getCurrentUserId();
      const userProfile = await this.getCurrentUserProfile();
      const companyId = userProfile?.companyId;

      if (!companyId) {
        return {
          success: false,
          error: 'Company ID not found. Please ensure you are part of a company.'
        };
      }

      // Load the template route
      const templateResult = await this.loadRoute(templateRouteId);
      if (!templateResult.success) {
        return templateResult;
      }

      const templateRoute = templateResult.route;
      if (!templateRoute.isTemplate) {
        return {
          success: false,
          error: 'This route is not a template. Only template routes can be applied.'
        };
      }

      // Load template jobs
      const templateJobs = templateResult.jobs || [];
      if (templateJobs.length === 0) {
        return {
          success: false,
          error: 'Template route contains no valid jobs'
        };
      }

      // Get technician info if provided
      let technicianName = null;
      if (technicianId) {
        try {
          const techDoc = await getDoc(doc(db, 'users', technicianId));
          if (techDoc.exists()) {
            const techData = techDoc.data();
            technicianName = techData.name || techData.fullName || techData.email || null;
          }
        } catch (error) {
          console.warn('Could not fetch technician info:', error);
        }
      }

      // Clone jobs from template to new date
      const nowIso = new Date().toISOString();
      const newJobIds = [];
      const newJobs = [];

      for (const templateJob of templateJobs) {
        // Create a new job based on template job
        const newJobData = {
          userId,
          companyId,
          customerId: templateJob.customerId || null,
          customerName: (templateJob.customerName || '').trim(),
          customerPhone: (templateJob.customerPhone || '').trim() || null,
          address: (templateJob.address || templateJob.customerAddress || '').trim(),
          customerAddress: (templateJob.customerAddress || templateJob.address || '').trim(),
          serviceType: (templateJob.serviceType || '').trim(),
          status: 'scheduled',
          date: targetDate,
          time: templateJob.time || '09:00',
          duration: templateJob.duration || '',
          estimatedCost: templateJob.estimatedCost || null,
          notes: templateJob.notes || '',
          assignedTo: technicianId || templateJob.assignedTo || null,
          assignedToName: technicianName || templateJob.assignedToName || '',
          templateRouteId: templateRouteId,
          createdAt: nowIso,
          updatedAt: nowIso
        };

        // Create the job document
        const jobRef = await addDoc(collection(db, 'jobs'), newJobData);
        newJobIds.push(jobRef.id);
        newJobs.push({
          id: jobRef.id,
          ...newJobData
        });
      }

      // Optionally create a new route for this applied template
      // (This allows tracking which jobs came from which template application)
      let appliedRouteId = null;
      try {
        const appliedRouteData = {
          companyId,
          name: `${templateRoute.name} - ${targetDate}`,
          date: targetDate,
          technicianId: technicianId || templateRoute.technicianId || null,
          technicianName: technicianName || templateRoute.technicianName || null,
          jobIds: newJobIds,
          jobCount: newJobIds.length,
          routeInfo: templateRoute.routeInfo || {},
          isTemplate: false,
          templateRouteId: templateRouteId,
          createdBy: userId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        const routeRef = await addDoc(collection(db, 'routes'), appliedRouteData);
        appliedRouteId = routeRef.id;
      } catch (error) {
        console.warn('Could not create applied route record:', error);
        // Don't fail the entire operation if route creation fails
      }

      return {
        success: true,
        jobs: newJobs,
        jobIds: newJobIds,
        routeId: appliedRouteId,
        message: `Successfully created ${newJobs.length} jobs from template`
      };
    } catch (error) {
      console.error('Error applying template route:', error);
      return {
        success: false,
        error: error.message || 'Failed to apply template route'
      };
    }
  }

  /**
   * Get all template routes
   * @param {string} companyId - Company ID (optional)
   * @returns {Promise<Object>} { success: boolean, templates: Array, error?: string }
   */
  static async getTemplateRoutes(companyId = null) {
    const result = await this.getRoutes(companyId, {
      templatesOnly: true
    });

    if (result.success) {
      return {
        success: true,
        templates: result.routes,
        count: result.count
      };
    }

    return result;
  }
}

export default RouteService;

