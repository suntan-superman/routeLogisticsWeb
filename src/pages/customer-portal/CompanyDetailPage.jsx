import React, { useState, useEffect } from 'react';
import { useCustomerPortal } from '../../contexts/CustomerPortalContext';
import CustomerPortalService from '../../services/customerPortalService';
import {
  BuildingOfficeIcon,
  PhoneIcon,
  EnvelopeIcon,
  MapPinIcon,
  GlobeAltIcon,
  StarIcon,
  SparklesIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const CompanyDetailPage = () => {
  const { selectedCompanyId } = useCustomerPortal();
  const [company, setCompany] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadCompanyDetails();
  }, [selectedCompanyId]);

  const loadCompanyDetails = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await CustomerPortalService.getCompanyDetails(selectedCompanyId);

      if (result.success) {
        setCompany(result.company);
      } else {
        setError(result.error || 'Failed to load company details');
        toast.error(result.error || 'Failed to load company details');
      }
    } catch (err) {
      console.error('Error loading company details:', err);
      setError('An error occurred');
      toast.error('An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCall = (phone) => {
    window.location.href = `tel:${phone}`;
  };

  const handleEmail = (email) => {
    window.location.href = `mailto:${email}`;
  };

  const handleVisitWebsite = (website) => {
    window.open(website, '_blank');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block">
            <div className="w-12 h-12 border-4 border-green-200 border-t-green-600 rounded-full animate-spin" />
          </div>
          <p className="mt-4 text-gray-600 font-medium">Loading company details...</p>
        </div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-700 font-medium">{error || 'Company not found'}</p>
        <button
          onClick={loadCompanyDetails}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Company Details</h1>
        <p className="mt-1 text-sm text-gray-600">
          Information about {company.businessName || company.name}
        </p>
      </div>

      {/* Company Hero Section */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-lg text-white p-8">
        <div className="flex items-center gap-6">
          {company.logo && (
            <img
              src={company.logo}
              alt={company.businessName}
              className="w-24 h-24 rounded-lg object-cover bg-white p-2"
            />
          )}
          <div>
            <h2 className="text-3xl font-bold">{company.businessName || company.name}</h2>
            {company.tagline && (
              <p className="mt-2 text-green-50">{company.tagline}</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {company.phone && (
          <button
            onClick={() => handleCall(company.phone)}
            className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg hover:border-gray-300 transition-all text-center group"
          >
            <div className="flex justify-center mb-3">
              <PhoneIcon className="w-8 h-8 text-blue-600 group-hover:scale-110 transition-transform" />
            </div>
            <p className="text-xs text-gray-600 uppercase tracking-wide font-medium">Call</p>
            <p className="mt-1 font-semibold text-gray-900">{company.phone}</p>
          </button>
        )}

        {company.email && (
          <button
            onClick={() => handleEmail(company.email)}
            className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg hover:border-gray-300 transition-all text-center group"
          >
            <div className="flex justify-center mb-3">
              <EnvelopeIcon className="w-8 h-8 text-purple-600 group-hover:scale-110 transition-transform" />
            </div>
            <p className="text-xs text-gray-600 uppercase tracking-wide font-medium">Email</p>
            <p className="mt-1 font-semibold text-gray-900 truncate">{company.email}</p>
          </button>
        )}

        {company.website && (
          <button
            onClick={() => handleVisitWebsite(company.website)}
            className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg hover:border-gray-300 transition-all text-center group"
          >
            <div className="flex justify-center mb-3">
              <GlobeAltIcon className="w-8 h-8 text-green-600 group-hover:scale-110 transition-transform" />
            </div>
            <p className="text-xs text-gray-600 uppercase tracking-wide font-medium">Website</p>
            <p className="mt-1 font-semibold text-gray-900 truncate">Visit Site</p>
          </button>
        )}
      </div>

      {/* Company Description */}
      {company.description && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">About</h3>
          <p className="text-gray-700 whitespace-pre-line">{company.description}</p>
        </div>
      )}

      {/* Contact Information */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MapPinIcon className="w-5 h-5 text-green-600" />
          Contact Information
        </h3>

        <div className="space-y-4">
          {company.address && (
            <div className="flex gap-4">
              <MapPinIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
              <div>
                <p className="text-sm text-gray-600">Address</p>
                <p className="text-gray-900 font-medium">{company.address}</p>
                {company.city && (
                  <p className="text-sm text-gray-600">
                    {company.city}
                    {company.state && `, ${company.state}`}
                    {company.zipCode && ` ${company.zipCode}`}
                  </p>
                )}
              </div>
            </div>
          )}

          {company.phone && (
            <div className="flex gap-4">
              <PhoneIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
              <div>
                <p className="text-sm text-gray-600">Phone</p>
                <a
                  href={`tel:${company.phone}`}
                  className="text-green-600 font-medium hover:text-green-700"
                >
                  {company.phone}
                </a>
              </div>
            </div>
          )}

          {company.email && (
            <div className="flex gap-4">
              <EnvelopeIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <a
                  href={`mailto:${company.email}`}
                  className="text-green-600 font-medium hover:text-green-700"
                >
                  {company.email}
                </a>
              </div>
            </div>
          )}

          {company.website && (
            <div className="flex gap-4">
              <GlobeAltIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
              <div>
                <p className="text-sm text-gray-600">Website</p>
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-600 font-medium hover:text-green-700"
                >
                  {company.website}
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Service Areas */}
      {company.serviceAreas && company.serviceAreas.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-green-600" />
            Service Areas
          </h3>
          <div className="flex flex-wrap gap-2">
            {company.serviceAreas.map((area, idx) => (
              <span
                key={idx}
                className="px-4 py-2 bg-green-50 text-green-700 rounded-full text-sm font-medium border border-green-200"
              >
                {area}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Service Types */}
      {company.services && company.services.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CheckCircleIcon className="w-5 h-5 text-green-600" />
            Available Services
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {company.services.map((service, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
              >
                <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">{service.name}</p>
                  {service.description && (
                    <p className="text-xs text-gray-600 mt-1">{service.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Business Hours */}
      {company.businessHours && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Business Hours</h3>
          <div className="space-y-2">
            {Object.entries(company.businessHours).map(([day, hours]) => (
              <div key={day} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                <span className="font-medium text-gray-900 capitalize">{day}</span>
                <span className="text-gray-600">
                  {hours.open && hours.close
                    ? `${hours.open} - ${hours.close}`
                    : hours.closed ? 'Closed' : 'N/A'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rating */}
      {company.rating && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <StarIcon className="w-5 h-5 text-yellow-400" />
            Customer Rating
          </h3>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <StarIcon
                  key={i}
                  className={`w-6 h-6 ${
                    i < Math.round(company.rating)
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              ))}
            </div>
            <div>
              <p className="font-bold text-gray-900">{company.rating.toFixed(1)} out of 5</p>
              {company.ratingCount && (
                <p className="text-sm text-gray-600">Based on {company.ratingCount} reviews</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyDetailPage;

