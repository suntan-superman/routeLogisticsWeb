import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import DirectoryService from '../services/directoryService';
import ProviderCard from '../components/directory/ProviderCard';
import DirectoryFilters from '../components/directory/DirectoryFilters';
import DirectorySearchBar from '../components/directory/DirectorySearchBar';
import { 
  BuildingOfficeIcon, 
  ExclamationTriangleIcon,
  ArrowPathIcon 
} from '@heroicons/react/24/outline';

const PublicDirectoryPage = () => {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    category: null,
    zipCode: null,
    service: null,
    searchTerm: null,
    sortBy: 'name',
    sortOrder: 'asc'
  });
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Load providers with current filters
  const loadProviders = useCallback(async (reset = true) => {
    try {
      if (reset) {
        setLoading(true);
        setProviders([]);
        setLastDoc(null);
      } else {
        setIsLoadingMore(true);
      }

      setError(null);

      const result = await DirectoryService.getPublicProviders({
        ...filters,
        pageSize: 20,
        lastDoc: reset ? null : lastDoc
      });

      if (result.success) {
        if (reset) {
          setProviders(result.providers);
        } else {
          setProviders(prev => [...prev, ...result.providers]);
        }
        setLastDoc(result.lastDoc);
        setHasMore(result.hasMore);
      } else {
        setError(result.error || 'Failed to load providers');
      }
    } catch (err) {
      console.error('Error loading providers:', err);
      setError(err.message || 'An error occurred while loading providers');
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [filters, lastDoc]);

  // Load providers when filters change
  useEffect(() => {
    loadProviders(true);
  }, [filters.category, filters.zipCode, filters.service, filters.searchTerm, filters.sortBy, filters.sortOrder]);

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Handle search term changes (with debounce)
  const [searchTimeout, setSearchTimeout] = useState(null);
  const handleSearchChange = (value) => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    const timeout = setTimeout(() => {
      handleFilterChange('searchTerm', value || null);
    }, 500);
    setSearchTimeout(timeout);
  };

  // Clear all filters
  const handleClearFilters = () => {
    setFilters({
      category: null,
      zipCode: null,
      service: null,
      searchTerm: null,
      sortBy: 'name',
      sortOrder: 'asc'
    });
  };

  // Load more providers
  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore) {
      loadProviders(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Service Provider Directory | Route Logistics</title>
        <meta 
          name="description" 
          content="Find trusted service providers in your area. Browse pest control, pool service, lawn care, HVAC, and more." 
        />
      </Helmet>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                Service Provider Directory
              </h1>
              <p className="text-lg text-gray-600">
                Find trusted service providers in your area
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Filters Sidebar */}
            <div className="lg:col-span-1">
              <DirectoryFilters
                filters={filters}
                onFilterChange={handleFilterChange}
                onClearFilters={handleClearFilters}
              />
            </div>

            {/* Main Content */}
            <div className="lg:col-span-3">
              {/* Search Bar */}
              <div className="mb-6">
                <DirectorySearchBar
                  searchTerm={filters.searchTerm || ''}
                  onSearchChange={handleSearchChange}
                />
              </div>

              {/* Loading State */}
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <ArrowPathIcon className="w-8 h-8 text-primary-500 animate-spin" />
                  <span className="ml-3 text-gray-600">Loading providers...</span>
                </div>
              )}

              {/* Error State */}
              {error && !loading && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center">
                    <ExclamationTriangleIcon className="w-5 h-5 text-red-600 mr-2" />
                    <p className="text-red-800">{error}</p>
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!loading && !error && providers.length === 0 && (
                <div className="bg-white rounded-lg shadow-md p-12 text-center">
                  <BuildingOfficeIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    No providers found
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Try adjusting your filters or search terms.
                  </p>
                  <button
                    onClick={handleClearFilters}
                    className="text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Clear all filters
                  </button>
                </div>
              )}

              {/* Providers Grid */}
              {!loading && !error && providers.length > 0 && (
                <>
                  <div className="mb-4">
                    <p className="text-sm text-gray-600">
                      Found {providers.length} provider{providers.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {providers.map((provider) => (
                      <ProviderCard key={provider.id} provider={provider} />
                    ))}
                  </div>

                  {/* Load More Button */}
                  {hasMore && (
                    <div className="text-center">
                      <button
                        onClick={handleLoadMore}
                        disabled={isLoadingMore}
                        className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center mx-auto"
                      >
                        {isLoadingMore ? (
                          <>
                            <ArrowPathIcon className="w-5 h-5 mr-2 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          'Load More Providers'
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PublicDirectoryPage;

