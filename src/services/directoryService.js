import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * Directory Service
 * Handles public directory queries for service providers
 */
class DirectoryService {
  /**
   * Service categories available in the directory
   */
  static SERVICE_CATEGORIES = [
    'Pest Control',
    'Pool Service',
    'Lawn Care',
    'HVAC',
    'Cleaning',
    'Plumbing',
    'Electrical',
    'Handyman',
    'Landscaping',
    'Roofing'
  ];

  /**
   * Get all public providers with optional filters
   * @param {Object} filters - Filter options
   * @param {string} filters.category - Filter by category
   * @param {string} filters.zipCode - Filter by ZIP code
   * @param {string} filters.service - Filter by service name
   * @param {string} filters.searchTerm - Search in company name
   * @param {string} filters.sortBy - Sort field ('name', 'category')
   * @param {string} filters.sortOrder - Sort order ('asc', 'desc')
   * @param {number} filters.pageSize - Number of results per page (default: 20)
   * @param {Object} filters.lastDoc - Last document for pagination
   * @returns {Promise<Object>} { success, providers, lastDoc, totalCount }
   */
  static async getPublicProviders(filters = {}) {
    try {
      const {
        category,
        zipCode,
        service,
        searchTerm,
        sortBy = 'name',
        sortOrder = 'asc',
        pageSize = 20,
        lastDoc = null
      } = filters;

      // Base query: only companies that opted into directory
      let q = query(
        collection(db, 'companies'),
        where('displayInDirectory', '==', true),
        where('isActive', '==', true)
      );

      // Apply category filter
      if (category) {
        q = query(q, where('category', '==', category));
      }

      // Apply ZIP code filter (array-contains)
      if (zipCode) {
        q = query(q, where('zipCodes', 'array-contains', zipCode));
      }

      // Add ordering
      const orderDirection = sortOrder === 'desc' ? 'desc' : 'asc';
      q = query(q, orderBy(sortBy, orderDirection));

      // Add pagination
      if (lastDoc) {
        q = query(q, startAfter(lastDoc));
      }
      q = query(q, limit(pageSize));

      // Execute query
      const querySnapshot = await getDocs(q);
      const providers = [];
      const lastDocument = querySnapshot.docs[querySnapshot.docs.length - 1] || null;

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const provider = {
          id: docSnap.id,
          name: data.name || '',
          category: data.category || '',
          services: data.services || [],
          regionsServed: data.regionsServed || [],
          zipCodes: data.zipCodes || [],
          latitude: data.latitude || null,
          longitude: data.longitude || null,
          websiteUrl: data.websiteUrl || '',
          hostedSiteEnabled: data.hostedSiteEnabled || false,
          hostedSiteSlug: data.hostedSiteSlug || '',
          logo: data.logo || '',
          phone: data.phone || '',
          email: data.email || '',
          address: data.address || '',
          city: data.city || '',
          state: data.state || '',
          zipCode: data.zipCode || ''
        };

        // Apply service filter (client-side if needed, or use array-contains in query)
        if (service && !provider.services.some(s => {
          const serviceName = typeof s === 'string' ? s : (s.name || s);
          return serviceName.toLowerCase().includes(service.toLowerCase());
        })) {
          return; // Skip this provider
        }

        // Apply search term filter (client-side)
        if (searchTerm) {
          const searchLower = searchTerm.toLowerCase();
          const matchesName = provider.name.toLowerCase().includes(searchLower);
          const matchesCategory = provider.category.toLowerCase().includes(searchLower);
          const matchesRegion = provider.regionsServed.some(r => 
            r.toLowerCase().includes(searchLower)
          );
          
          if (!matchesName && !matchesCategory && !matchesRegion) {
            return; // Skip this provider
          }
        }

        providers.push(provider);
      });

      return {
        success: true,
        providers,
        lastDoc: lastDocument,
        hasMore: querySnapshot.docs.length === pageSize
      };
    } catch (error) {
      console.error('Error fetching public providers:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch providers',
        providers: [],
        lastDoc: null,
        hasMore: false
      };
    }
  }

  /**
   * Get a single provider profile by company ID (public access)
   * @param {string} companyId - Company ID
   * @returns {Promise<Object>} { success, provider }
   */
  static async getProviderProfile(companyId) {
    try {
      if (!companyId) {
        return {
          success: false,
          error: 'Company ID is required'
        };
      }

      const companyDoc = await getDoc(doc(db, 'companies', companyId));

      if (!companyDoc.exists()) {
        return {
          success: false,
          error: 'Provider not found'
        };
      }

      const data = companyDoc.data();

      // Only return if provider opted into directory
      if (!data.displayInDirectory || !data.isActive) {
        return {
          success: false,
          error: 'Provider not available in directory'
        };
      }

      const provider = {
        id: companyDoc.id,
        name: data.name || '',
        category: data.category || '',
        services: data.services || [],
        regionsServed: data.regionsServed || [],
        zipCodes: data.zipCodes || [],
        latitude: data.latitude || null,
        longitude: data.longitude || null,
        websiteUrl: data.websiteUrl || '',
        hostedSiteEnabled: data.hostedSiteEnabled || false,
        hostedSiteSlug: data.hostedSiteSlug || '',
        logo: data.logo || '',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
        city: data.city || '',
        state: data.state || '',
        zipCode: data.zipCode || '',
        description: data.description || '',
        directoryLastUpdated: data.directoryLastUpdated || null
      };

      return {
        success: true,
        provider
      };
    } catch (error) {
      console.error('Error fetching provider profile:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch provider profile'
      };
    }
  }

  /**
   * Get providers by ZIP code
   * @param {string} zipCode - ZIP code to search
   * @param {Object} options - Additional options (pageSize, lastDoc)
   * @returns {Promise<Object>} { success, providers, lastDoc }
   */
  static async getProvidersByZip(zipCode, options = {}) {
    return this.getPublicProviders({
      zipCode,
      ...options
    });
  }

  /**
   * Get providers by category
   * @param {string} category - Category to filter by
   * @param {Object} options - Additional options (pageSize, lastDoc)
   * @returns {Promise<Object>} { success, providers, lastDoc }
   */
  static async getProvidersByCategory(category, options = {}) {
    return this.getPublicProviders({
      category,
      ...options
    });
  }

  /**
   * Get all available categories from active providers
   * @returns {Promise<Object>} { success, categories }
   */
  static async getAvailableCategories() {
    try {
      const result = await this.getPublicProviders({ pageSize: 1000 });
      
      if (!result.success) {
        return result;
      }

      // Extract unique categories
      const categories = new Set();
      result.providers.forEach(provider => {
        if (provider.category) {
          categories.add(provider.category);
        }
      });

      return {
        success: true,
        categories: Array.from(categories).sort()
      };
    } catch (error) {
      console.error('Error fetching available categories:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch categories',
        categories: []
      };
    }
  }

  /**
   * Validate directory fields
   * @param {Object} directoryData - Directory data to validate
   * @returns {Object} { valid, errors }
   */
  static validateDirectoryData(directoryData) {
    const errors = [];

    if (directoryData.displayInDirectory === true) {
      // If opting in, validate required fields
      if (!directoryData.category) {
        errors.push('Category is required when displaying in directory');
      } else if (!this.SERVICE_CATEGORIES.includes(directoryData.category)) {
        errors.push(`Category must be one of: ${this.SERVICE_CATEGORIES.join(', ')}`);
      }

      if (!directoryData.regionsServed || directoryData.regionsServed.length === 0) {
        errors.push('At least one region served is required');
      }

      if (!directoryData.zipCodes || directoryData.zipCodes.length === 0) {
        errors.push('At least one ZIP code is required');
      }

      // Validate ZIP codes format
      if (directoryData.zipCodes) {
        const zipRegex = /^\d{5}(-\d{4})?$/;
        const invalidZips = directoryData.zipCodes.filter(zip => !zipRegex.test(zip));
        if (invalidZips.length > 0) {
          errors.push(`Invalid ZIP code format: ${invalidZips.join(', ')}`);
        }
      }

      // Validate website URL if provided
      if (directoryData.websiteUrl) {
        try {
          new URL(directoryData.websiteUrl);
        } catch (e) {
          errors.push('Invalid website URL format');
        }
      }

      // Validate coordinates if provided
      if (directoryData.latitude !== undefined || directoryData.longitude !== undefined) {
        if (directoryData.latitude === undefined || directoryData.longitude === undefined) {
          errors.push('Both latitude and longitude must be provided together');
        } else {
          if (directoryData.latitude < -90 || directoryData.latitude > 90) {
            errors.push('Latitude must be between -90 and 90');
          }
          if (directoryData.longitude < -180 || directoryData.longitude > 180) {
            errors.push('Longitude must be between -180 and 180');
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export default DirectoryService;

