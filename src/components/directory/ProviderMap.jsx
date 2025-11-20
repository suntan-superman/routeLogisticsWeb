import React from 'react';
import { MapPinIcon } from '@heroicons/react/24/outline';

const ProviderMap = ({ provider }) => {
  if (!provider.latitude || !provider.longitude) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <MapPinIcon className="w-6 h-6 mr-2 text-primary-600" />
          Service Area
        </h2>
        {provider.regionsServed && provider.regionsServed.length > 0 && (
          <div className="space-y-2">
            <p className="text-gray-600 font-medium">Regions Served:</p>
            <div className="flex flex-wrap gap-2">
              {provider.regionsServed.map((region, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                >
                  {region}
                </span>
              ))}
            </div>
          </div>
        )}
        {provider.zipCodes && provider.zipCodes.length > 0 && (
          <div className="mt-4">
            <p className="text-gray-600 font-medium mb-2">ZIP Codes Served:</p>
            <div className="flex flex-wrap gap-2">
              {provider.zipCodes.map((zip, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                >
                  {zip}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const mapUrl = `https://www.google.com/maps?q=${provider.latitude},${provider.longitude}&z=10&output=embed`;

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
      <div className="p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <MapPinIcon className="w-6 h-6 mr-2 text-primary-600" />
          Service Area
        </h2>
        <div className="relative w-full h-64 rounded-lg overflow-hidden">
          <iframe
            width="100%"
            height="100%"
            style={{ border: 0 }}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            src={mapUrl}
            title={`Service area map for ${provider.name}`}
          />
        </div>
        {((provider.regionsServed && provider.regionsServed.length > 0) || 
         (provider.zipCodes && provider.zipCodes.length > 0)) && (
          <div className="mt-4 space-y-2">
            {provider.regionsServed && provider.regionsServed.length > 0 && (
              <div>
                <p className="text-sm text-gray-600 font-medium mb-1">Regions Served:</p>
                <div className="flex flex-wrap gap-2">
                  {provider.regionsServed.map((region, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                    >
                      {region}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {provider.zipCodes && provider.zipCodes.length > 0 && (
              <div>
                <p className="text-sm text-gray-600 font-medium mb-1">ZIP Codes:</p>
                <div className="flex flex-wrap gap-2">
                  {provider.zipCodes.slice(0, 10).map((zip, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                    >
                      {zip}
                    </span>
                  ))}
                  {provider.zipCodes.length > 10 && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                      +{provider.zipCodes.length - 10} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProviderMap;

