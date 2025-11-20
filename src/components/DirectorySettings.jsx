import React, { useState, useEffect } from 'react';
import { 
  GlobeAltIcon, 
  MapPinIcon, 
  ExclamationTriangleIcon,
  InformationCircleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import DirectoryService from '../services/directoryService';
import toast from 'react-hot-toast';

const DirectorySettings = ({ 
  companyData, 
  onDataChange, 
  onValidationChange,
  showConfirmationModal = false,
  onConfirmOptIn = null,
  onCancelOptIn = null
}) => {
  const [localData, setLocalData] = useState({
    displayInDirectory: companyData?.displayInDirectory || false,
    category: companyData?.category || '',
    regionsServed: companyData?.regionsServed || [],
    zipCodes: companyData?.zipCodes || [],
    latitude: companyData?.latitude || null,
    longitude: companyData?.longitude || null,
    websiteUrl: companyData?.websiteUrl || companyData?.website || '',
    hostedSiteEnabled: companyData?.hostedSiteEnabled || false,
    hostedSiteSlug: companyData?.hostedSiteSlug || ''
  });

  const [newRegion, setNewRegion] = useState('');
  const [newZipCode, setNewZipCode] = useState('');
  const [validationErrors, setValidationErrors] = useState({});
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Update local data when companyData changes
  useEffect(() => {
    if (companyData) {
      setLocalData({
        displayInDirectory: companyData.displayInDirectory || false,
        category: companyData.category || '',
        regionsServed: companyData.regionsServed || [],
        zipCodes: companyData.zipCodes || [],
        latitude: companyData.latitude || null,
        longitude: companyData.longitude || null,
        websiteUrl: companyData.websiteUrl || '',
        hostedSiteEnabled: companyData.hostedSiteEnabled || false,
        hostedSiteSlug: companyData.hostedSiteSlug || ''
      });
    }
  }, [companyData]);

  // Validate and notify parent
  useEffect(() => {
    const validation = DirectoryService.validateDirectoryData(localData);
    setValidationErrors(validation.errors.reduce((acc, err) => {
      // Parse error messages to extract field names
      if (err.includes('Category')) acc.category = err;
      else if (err.includes('region')) acc.regionsServed = err;
      else if (err.includes('ZIP')) acc.zipCodes = err;
      else if (err.includes('website')) acc.websiteUrl = err;
      else if (err.includes('latitude') || err.includes('longitude')) acc.coordinates = err;
      else acc.general = err;
      return acc;
    }, {}));

    if (onValidationChange) {
      onValidationChange(validation.valid, validation.errors);
    }

    // Notify parent of data changes
    if (onDataChange) {
      onDataChange(localData);
    }
  }, [localData, onDataChange, onValidationChange]);

  const handleInputChange = (field, value) => {
    setLocalData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleToggleDirectory = (enabled) => {
    if (enabled && !localData.displayInDirectory) {
      // Show confirmation modal if callback provided
      if (onConfirmOptIn) {
        onConfirmOptIn(() => {
          handleInputChange('displayInDirectory', true);
        });
      } else {
        handleInputChange('displayInDirectory', true);
      }
    } else {
      handleInputChange('displayInDirectory', enabled);
    }
  };

  const handleAddRegion = () => {
    const trimmed = newRegion.trim();
    if (trimmed && !localData.regionsServed.includes(trimmed)) {
      handleInputChange('regionsServed', [...localData.regionsServed, trimmed]);
      setNewRegion('');
    }
  };

  const handleRemoveRegion = (region) => {
    handleInputChange('regionsServed', localData.regionsServed.filter(r => r !== region));
  };

  const handleAddZipCode = () => {
    const trimmed = newZipCode.trim().replace(/\D/g, '').slice(0, 5);
    if (trimmed && trimmed.length === 5 && !localData.zipCodes.includes(trimmed)) {
      handleInputChange('zipCodes', [...localData.zipCodes, trimmed]);
      setNewZipCode('');
    }
  };

  const handleRemoveZipCode = (zip) => {
    handleInputChange('zipCodes', localData.zipCodes.filter(z => z !== zip));
  };

  // Geocode address to get lat/lng (optional enhancement)
  const handleGeocodeAddress = async () => {
    if (!companyData?.address && !companyData?.city && !companyData?.state) {
      toast.error('Please enter an address in Basic Info first');
      return;
    }

    setIsGeocoding(true);
    try {
      const address = [
        companyData.address,
        companyData.city,
        companyData.state,
        companyData.zipCode
      ].filter(Boolean).join(', ');

      // Use a geocoding service (Google Maps Geocoding API or similar)
      // For now, we'll use a simple placeholder
      // In production, you'd call your geocoding API here
      toast('Geocoding feature coming soon. Please enter coordinates manually.');
      
      // Example implementation:
      // const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`);
      // const data = await response.json();
      // if (data.results && data.results[0]) {
      //   const location = data.results[0].geometry.location;
      //   handleInputChange('latitude', location.lat);
      //   handleInputChange('longitude', location.lng);
      //   toast.success('Coordinates updated from address');
      // }
    } catch (error) {
      console.error('Geocoding error:', error);
      toast.error('Failed to geocode address');
    } finally {
      setIsGeocoding(false);
    }
  };

  const categories = DirectoryService.SERVICE_CATEGORIES;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Directory Settings</h3>
        <p className="text-sm text-gray-600 mb-6">
          Control your company's visibility in the public service provider directory. When enabled, 
          your company information will be visible to potential customers searching for services.
        </p>

        {/* Display in Directory Toggle */}
        <div className="mb-6">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex-1">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={localData.displayInDirectory}
                  onChange={(e) => handleToggleDirectory(e.target.checked)}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <span className="ml-3 text-sm font-medium text-gray-900">
                  Display in Public Directory
                </span>
              </label>
              <p className="ml-7 mt-1 text-xs text-gray-500">
                Make your company discoverable by potential customers
              </p>
            </div>
            {localData.displayInDirectory && (
              <div className="ml-4 flex items-center text-green-600">
                <CheckCircleIcon className="w-5 h-5" />
                <span className="ml-2 text-sm font-medium">Active</span>
              </div>
            )}
          </div>
        </div>

        {/* Directory Fields (only shown when displayInDirectory is true) */}
        {localData.displayInDirectory && (
          <div className="space-y-6 border-t border-gray-200 pt-6">
            {/* Category */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Service Category *
              </label>
              <select
                value={localData.category}
                onChange={(e) => handleInputChange('category', e.target.value)}
                className={`w-full px-4 py-2.5 rounded-lg border shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm ${
                  validationErrors.category ? 'border-red-300' : 'border-gray-300'
                }`}
              >
                <option value="">Select a category</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              {validationErrors.category && (
                <p className="mt-1 text-sm text-red-600">{validationErrors.category}</p>
              )}
            </div>

            {/* Regions Served */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Regions Served *
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newRegion}
                  onChange={(e) => setNewRegion(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddRegion();
                    }
                  }}
                  placeholder="Enter region (e.g., Bakersfield)"
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddRegion}
                  className="px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  Add
                </button>
              </div>
              {validationErrors.regionsServed && (
                <p className="mt-1 text-sm text-red-600">{validationErrors.regionsServed}</p>
              )}
              {localData.regionsServed.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {localData.regionsServed.map((region, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary-100 text-primary-800"
                    >
                      {region}
                      <button
                        type="button"
                        onClick={() => handleRemoveRegion(region)}
                        className="ml-2 text-primary-600 hover:text-primary-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* ZIP Codes Served */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                ZIP Codes Served *
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newZipCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                    setNewZipCode(value);
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddZipCode();
                    }
                  }}
                  placeholder="Enter ZIP code (e.g., 93309)"
                  maxLength={5}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddZipCode}
                  className="px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  Add
                </button>
              </div>
              {validationErrors.zipCodes && (
                <p className="mt-1 text-sm text-red-600">{validationErrors.zipCodes}</p>
              )}
              {localData.zipCodes.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {localData.zipCodes.map((zip, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary-100 text-primary-800"
                    >
                      {zip}
                      <button
                        type="button"
                        onClick={() => handleRemoveZipCode(zip)}
                        className="ml-2 text-primary-600 hover:text-primary-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Coordinates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Latitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={localData.latitude || ''}
                  onChange={(e) => handleInputChange('latitude', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="e.g., 35.3733"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Longitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={localData.longitude || ''}
                  onChange={(e) => handleInputChange('longitude', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="e.g., -119.0187"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                />
              </div>
            </div>
            {validationErrors.coordinates && (
              <p className="text-sm text-red-600">{validationErrors.coordinates}</p>
            )}
            {companyData?.address && (
              <button
                type="button"
                onClick={handleGeocodeAddress}
                disabled={isGeocoding}
                className="text-sm text-primary-600 hover:text-primary-700 flex items-center"
              >
                <MapPinIcon className="w-4 h-4 mr-1" />
                {isGeocoding ? 'Geocoding...' : 'Auto-fill from address'}
              </button>
            )}

            {/* Website URL */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Website URL
              </label>
              <div className="flex items-center">
                <GlobeAltIcon className="w-5 h-5 text-gray-400 mr-2" />
                <input
                  type="url"
                  value={localData.websiteUrl}
                  onChange={(e) => handleInputChange('websiteUrl', e.target.value)}
                  placeholder="https://www.example.com"
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                />
              </div>
              {validationErrors.websiteUrl && (
                <p className="mt-1 text-sm text-red-600">{validationErrors.websiteUrl}</p>
              )}
            </div>

            {/* Hosted Site (disabled for now) */}
            <div className="opacity-50">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Route Logistics Hosted Site
              </label>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={localData.hostedSiteEnabled}
                  onChange={(e) => handleInputChange('hostedSiteEnabled', e.target.checked)}
                  disabled
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <span className="ml-3 text-sm text-gray-600">
                  Enable Route Logistics hosted mini-site (Coming soon)
                </span>
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <InformationCircleIcon className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">What information will be public?</p>
                  <ul className="list-disc list-inside space-y-1 text-blue-700">
                    <li>Company name and category</li>
                    <li>Services offered</li>
                    <li>Regions and ZIP codes served</li>
                    <li>Contact information (phone, email, address)</li>
                    <li>Website URL (if provided)</li>
                  </ul>
                  <p className="mt-2 text-blue-700">
                    Internal notes, financial data, and customer information will never be visible.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DirectorySettings;

