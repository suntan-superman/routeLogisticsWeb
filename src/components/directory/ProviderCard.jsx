import React from 'react';
import { Link } from 'react-router-dom';
import { BuildingOfficeIcon, MapPinIcon, PhoneIcon, GlobeAltIcon } from '@heroicons/react/24/outline';

const ProviderCard = ({ provider }) => {
  const getCategoryColor = (category) => {
    const colors = {
      'Pest Control': 'bg-green-100 text-green-800',
      'Pool Service': 'bg-blue-100 text-blue-800',
      'Lawn Care': 'bg-emerald-100 text-emerald-800',
      'HVAC': 'bg-orange-100 text-orange-800',
      'Cleaning': 'bg-purple-100 text-purple-800',
      'Plumbing': 'bg-cyan-100 text-cyan-800',
      'Electrical': 'bg-yellow-100 text-yellow-800',
      'Handyman': 'bg-indigo-100 text-indigo-800',
      'Landscaping': 'bg-lime-100 text-lime-800',
      'Roofing': 'bg-red-100 text-red-800',
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  const formatServices = (services) => {
    if (!services || services.length === 0) return 'Services available';
    const serviceNames = services.slice(0, 3).map(s => {
      return typeof s === 'string' ? s : (s.name || s);
    });
    if (services.length > 3) {
      return `${serviceNames.join(', ')} +${services.length - 3} more`;
    }
    return serviceNames.join(', ');
  };

  return (
    <Link
      to={`/provider/${provider.id}`}
      className="block bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 overflow-hidden border border-gray-200"
    >
      <div className="p-6">
        {/* Header with Logo/Icon and Category */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            {provider.logo ? (
              <img
                src={provider.logo}
                alt={provider.name}
                className="w-12 h-12 rounded-lg object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-primary-500 flex items-center justify-center">
                <BuildingOfficeIcon className="w-6 h-6 text-white" />
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{provider.name}</h3>
              {provider.category && (
                <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-1 ${getCategoryColor(provider.category)}`}>
                  {provider.category}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Services */}
        <div className="mb-4">
          <p className="text-sm text-gray-600 line-clamp-2">
            {formatServices(provider.services)}
          </p>
        </div>

        {/* Location Info */}
        <div className="space-y-2 mb-4">
          {provider.regionsServed && provider.regionsServed.length > 0 && (
            <div className="flex items-center text-sm text-gray-600">
              <MapPinIcon className="w-4 h-4 mr-2 text-gray-400" />
              <span>Serves: {provider.regionsServed.slice(0, 2).join(', ')}
                {provider.regionsServed.length > 2 && ` +${provider.regionsServed.length - 2} more`}
              </span>
            </div>
          )}
          {provider.zipCodes && provider.zipCodes.length > 0 && (
            <div className="flex items-center text-sm text-gray-600">
              <span className="ml-6">ZIP: {provider.zipCodes.slice(0, 3).join(', ')}
                {provider.zipCodes.length > 3 && ` +${provider.zipCodes.length - 3} more`}
              </span>
            </div>
          )}
        </div>

        {/* Contact Info */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          {provider.phone && (
            <div className="flex items-center text-sm text-gray-600">
              <PhoneIcon className="w-4 h-4 mr-1 text-gray-400" />
              <span>{provider.phone}</span>
            </div>
          )}
          {provider.websiteUrl && (
            <div className="flex items-center text-sm text-primary-600">
              <GlobeAltIcon className="w-4 h-4 mr-1" />
              <span>Website</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

export default ProviderCard;

