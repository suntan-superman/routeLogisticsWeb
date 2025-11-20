import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import DirectoryService from '../services/directoryService';
import ProviderHero from '../components/directory/ProviderHero';
import ProviderServices from '../components/directory/ProviderServices';
import ProviderMap from '../components/directory/ProviderMap';
import ProviderContact from '../components/directory/ProviderContact';
import { 
  ArrowLeftIcon, 
  ExclamationTriangleIcon,
  ArrowPathIcon 
} from '@heroicons/react/24/outline';

const ProviderProfilePage = () => {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadProvider = async () => {
      if (!companyId) {
        setError('Provider ID is required');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const result = await DirectoryService.getProviderProfile(companyId);

        if (result.success) {
          setProvider(result.provider);
        } else {
          setError(result.error || 'Provider not found');
        }
      } catch (err) {
        console.error('Error loading provider:', err);
        setError(err.message || 'An error occurred while loading provider');
      } finally {
        setLoading(false);
      }
    };

    loadProvider();
  }, [companyId]);

  return (
    <>
      <Helmet>
        <title>
          {provider ? `${provider.name} - Service Provider` : 'Provider Profile'} | Route Logistics
        </title>
        <meta 
          name="description" 
          content={provider?.description || `View ${provider?.name || 'provider'} profile and services.`} 
        />
      </Helmet>

      <div className="min-h-screen bg-gray-50">
        {/* Header with Back Button */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <Link
              to="/directory"
              className="inline-flex items-center text-primary-600 hover:text-primary-700"
            >
              <ArrowLeftIcon className="w-5 h-5 mr-2" />
              Back to Directory
            </Link>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <ArrowPathIcon className="w-8 h-8 text-primary-500 animate-spin" />
              <span className="ml-3 text-gray-600">Loading provider...</span>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <ExclamationTriangleIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Provider Not Found
              </h2>
              <p className="text-gray-600 mb-6">{error}</p>
              <Link
                to="/directory"
                className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Browse Directory
              </Link>
            </div>
          )}

          {/* Provider Content */}
          {provider && !loading && !error && (
            <div className="space-y-6">
              {/* Hero Section */}
              <ProviderHero provider={provider} />

              {/* Main Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - Services and Map */}
                <div className="lg:col-span-2 space-y-6">
                  <ProviderServices services={provider.services} />
                  <ProviderMap provider={provider} />
                </div>

                {/* Right Column - Contact */}
                <div className="lg:col-span-1">
                  <ProviderContact provider={provider} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ProviderProfilePage;

