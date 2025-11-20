import React from 'react';
import { WrenchScrewdriverIcon } from '@heroicons/react/24/outline';

const ProviderServices = ({ services }) => {
  if (!services || services.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <WrenchScrewdriverIcon className="w-6 h-6 mr-2 text-primary-600" />
          Services
        </h2>
        <p className="text-gray-600">No services listed.</p>
      </div>
    );
  }

  const serviceNames = services.map(s => {
    return typeof s === 'string' ? s : (s.name || s);
  });

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
        <WrenchScrewdriverIcon className="w-6 h-6 mr-2 text-primary-600" />
        Services Offered
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {serviceNames.map((service, index) => (
          <div
            key={index}
            className="px-4 py-2 bg-primary-50 border border-primary-200 rounded-lg text-sm text-primary-900"
          >
            {service}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProviderServices;

