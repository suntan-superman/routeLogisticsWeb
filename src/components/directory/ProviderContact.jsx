import React from 'react';
import { Link } from 'react-router-dom';
import { PhoneIcon, EnvelopeIcon, GlobeAltIcon, MapPinIcon } from '@heroicons/react/24/outline';

const ProviderContact = ({ provider }) => {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Contact Information</h2>
      <div className="space-y-4">
        {provider.phone && (
          <div className="flex items-center">
            <PhoneIcon className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
            <a
              href={`tel:${provider.phone}`}
              className="text-gray-700 hover:text-primary-600"
            >
              {provider.phone}
            </a>
          </div>
        )}
        {provider.email && (
          <div className="flex items-center">
            <EnvelopeIcon className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
            <a
              href={`mailto:${provider.email}`}
              className="text-gray-700 hover:text-primary-600 break-all"
            >
              {provider.email}
            </a>
          </div>
        )}
        {provider.address && (
          <div className="flex items-start">
            <MapPinIcon className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0 mt-0.5" />
            <div className="text-gray-700">
              <p>{provider.address}</p>
              {provider.city && (
                <p>
                  {provider.city}
                  {provider.state && `, ${provider.state}`}
                  {provider.zipCode && ` ${provider.zipCode}`}
                </p>
              )}
            </div>
          </div>
        )}
        {provider.websiteUrl && (
          <div className="flex items-center">
            <GlobeAltIcon className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
            <a
              href={provider.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700 break-all"
            >
              {provider.websiteUrl}
            </a>
          </div>
        )}
      </div>

      {/* Request Service Button */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <Link
          to="/customer-portal/dashboard"
          className="block w-full text-center px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
        >
          Request Service
        </Link>
        <p className="text-xs text-gray-500 text-center mt-2">
          You'll be redirected to the customer portal to request service
        </p>
      </div>
    </div>
  );
};

export default ProviderContact;

