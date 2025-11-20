import React from 'react';
import { BuildingOfficeIcon, MapPinIcon, PhoneIcon, EnvelopeIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

const ProviderHero = ({ provider }) => {
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

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-8">
        <div className="flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0 md:space-x-6">
          {/* Logo/Icon */}
          <div className="flex-shrink-0">
            {provider.logo ? (
              <img
                src={provider.logo}
                alt={provider.name}
                className="w-24 h-24 rounded-lg object-cover bg-white p-2"
              />
            ) : (
              <div className="w-24 h-24 rounded-lg bg-white flex items-center justify-center">
                <BuildingOfficeIcon className="w-12 h-12 text-primary-600" />
              </div>
            )}
          </div>

          {/* Company Info */}
          <div className="flex-1 text-white">
            <h1 className="text-3xl font-bold mb-2">{provider.name}</h1>
            {provider.category && (
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getCategoryColor(provider.category)}`}>
                {provider.category}
              </span>
            )}
            {provider.description && (
              <p className="mt-3 text-white/90">{provider.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Contact Info Bar */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {provider.address && (
            <div className="flex items-center text-sm text-gray-600">
              <MapPinIcon className="w-5 h-5 mr-2 text-gray-400 flex-shrink-0" />
              <span>{provider.address}{provider.city && `, ${provider.city}`}{provider.state && `, ${provider.state}`} {provider.zipCode}</span>
            </div>
          )}
          {provider.phone && (
            <div className="flex items-center text-sm text-gray-600">
              <PhoneIcon className="w-5 h-5 mr-2 text-gray-400 flex-shrink-0" />
              <a href={`tel:${provider.phone}`} className="hover:text-primary-600">
                {provider.phone}
              </a>
            </div>
          )}
          {provider.email && (
            <div className="flex items-center text-sm text-gray-600">
              <EnvelopeIcon className="w-5 h-5 mr-2 text-gray-400 flex-shrink-0" />
              <a href={`mailto:${provider.email}`} className="hover:text-primary-600 truncate">
                {provider.email}
              </a>
            </div>
          )}
        </div>
        {provider.websiteUrl && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <a
              href={provider.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm text-primary-600 hover:text-primary-700"
            >
              <GlobeAltIcon className="w-5 h-5 mr-2" />
              Visit Website
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProviderHero;

