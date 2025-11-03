import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import CompanyService from '../services/companyService';
import { MagnifyingGlassIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const CompanySearchPage = () => {
  const { userProfile, isSuperAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentCompanies, setRecentCompanies] = useState([]);

  useEffect(() => {
    if (isSuperAdmin) {
      loadRecentCompanies();
    }
  }, [isSuperAdmin]);

  const loadRecentCompanies = async () => {
    // For super admin, load recent companies
    // This would require a new service method to get recent companies
    // For now, we'll just show empty state
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      toast.error('Please enter a search term');
      return;
    }

    setIsSearching(true);
    try {
      // Search by company code (exact match)
      if (searchTerm.length === 6 && /^[A-Z0-9]{6}$/i.test(searchTerm)) {
        const result = await CompanyService.getCompanyByCode(searchTerm.toUpperCase());
        if (result.success) {
          // getCompanyByCode already filters admin companies, but double-check
          if (!result.company.isAdminCompany && !result.company.isProtected) {
            setSearchResults([result.company]);
          } else {
            setSearchResults([]);
            toast.error('This company is not available for public access');
          }
        } else {
          setSearchResults([]);
          // Only show error if it's not the admin company protection message
          if (result.error !== 'This company is not available for public signup') {
            toast.error(result.error || 'Company not found with this code');
          } else {
            toast.error('This company is not available for public access');
          }
        }
        setIsSearching(false);
        return;
      }

      // For super admin: search by name (would need a new service method)
      if (isSuperAdmin) {
        // TODO: Implement company name search
        toast.info('Company name search coming soon. Use company code for now.');
        setSearchResults([]);
      } else {
        toast.error('Please enter a valid 6-character company code');
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching companies:', error);
      toast.error('Failed to search companies');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Company Search</h1>
        <p className="mt-1 text-sm text-gray-500">
          {isSuperAdmin 
            ? 'Search for companies by name or code'
            : 'Search for companies by code to join'
          }
        </p>
      </div>

      {/* Search Bar */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex space-x-3">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={isSuperAdmin ? "Enter company name or code" : "Enter 6-character company code"}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching || !searchTerm.trim()}
            className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">
              Search Results ({searchResults.length})
            </h2>
          </div>
          <ul className="divide-y divide-gray-200">
            {searchResults.map((company) => (
              <li key={company.id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <BuildingOfficeIcon className="h-10 w-10 text-primary-500 mr-4" />
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">{company.name}</h3>
                      <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                        <span>Code: {company.code}</span>
                        {company.email && <span>{company.email}</span>}
                        {company.phone && <span>{company.phone}</span>}
                      </div>
                      {company.address && (
                        <p className="mt-1 text-sm text-gray-500">{company.address}</p>
                      )}
                    </div>
                  </div>
                  {isSuperAdmin && (
                    <button
                      onClick={() => {
                        // Navigate to company management (would need routing)
                        toast.info('Company management coming soon');
                      }}
                      className="px-4 py-2 text-sm font-medium text-primary-600 hover:text-primary-800"
                    >
                      View Details
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Empty State */}
      {!isSearching && searchResults.length === 0 && searchTerm && (
        <div className="bg-white shadow rounded-lg p-12 text-center">
          <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No companies found</h3>
          <p className="mt-1 text-sm text-gray-500">
            Try a different search term or check the company code
          </p>
        </div>
      )}

      {/* Instructions */}
      {!searchTerm && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-sm font-medium text-blue-900 mb-2">How to search:</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
            <li>Enter a 6-character company code for exact match</li>
            {isSuperAdmin && (
              <li>Company name search coming soon</li>
            )}
            <li>Company codes are case-insensitive</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default CompanySearchPage;

