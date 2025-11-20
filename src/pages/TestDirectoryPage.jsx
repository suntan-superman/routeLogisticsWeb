import React, { useState } from 'react';
import DirectoryService from '../services/directoryService';
import CompanyService from '../services/companyService';
import { useCompany } from '../contexts/CompanyContext';
import toast from 'react-hot-toast';

/**
 * Test Page for Phase 1 Directory Backend
 * This page allows testing DirectoryService and CompanyService directory functionality
 * Remove this page after Phase 1 testing is complete
 */
const TestDirectoryPage = () => {
  const { getEffectiveCompanyId } = useCompany();
  const [testResults, setTestResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const addResult = (testName, result) => {
    setTestResults(prev => [...prev, { testName, result, timestamp: new Date().toISOString() }]);
  };

  const testGetAllProviders = async () => {
    setIsLoading(true);
    try {
      const result = await DirectoryService.getPublicProviders();
      addResult('Get All Public Providers', result);
      toast.success('Test completed - check results below');
    } catch (error) {
      addResult('Get All Public Providers', { success: false, error: error.message });
      toast.error('Test failed');
    }
    setIsLoading(false);
  };

  const testGetByCategory = async () => {
    setIsLoading(true);
    try {
      const result = await DirectoryService.getProvidersByCategory('Pest Control');
      addResult('Get Providers by Category (Pest Control)', result);
      toast.success('Test completed');
    } catch (error) {
      addResult('Get Providers by Category', { success: false, error: error.message });
      toast.error('Test failed');
    }
    setIsLoading(false);
  };

  const testGetByZip = async () => {
    setIsLoading(true);
    try {
      const result = await DirectoryService.getProvidersByZip('93309');
      addResult('Get Providers by ZIP (93309)', result);
      toast.success('Test completed');
    } catch (error) {
      addResult('Get Providers by ZIP', { success: false, error: error.message });
      toast.error('Test failed');
    }
    setIsLoading(false);
  };

  const testGetProviderProfile = async () => {
    const companyId = getEffectiveCompanyId();
    if (!companyId) {
      toast.error('No company ID found');
      return;
    }

    setIsLoading(true);
    try {
      const result = await DirectoryService.getProviderProfile(companyId);
      addResult('Get Provider Profile', result);
      toast.success('Test completed');
    } catch (error) {
      addResult('Get Provider Profile', { success: false, error: error.message });
      toast.error('Test failed');
    }
    setIsLoading(false);
  };

  const testValidateData = async () => {
    // Test valid data
    const validData = {
      displayInDirectory: true,
      category: 'Pest Control',
      regionsServed: ['Bakersfield'],
      zipCodes: ['93309'],
      latitude: 35.3733,
      longitude: -119.0187
    };

    const validResult = DirectoryService.validateDirectoryData(validData);
    addResult('Validate Data (Valid)', validResult);

    // Test invalid data
    const invalidData = {
      displayInDirectory: true,
      category: 'Invalid Category',
      regionsServed: [],
      zipCodes: ['invalid']
    };

    const invalidResult = DirectoryService.validateDirectoryData(invalidData);
    addResult('Validate Data (Invalid)', invalidResult);

    toast.success('Validation tests completed');
  };

  const testUpdateCompany = async () => {
    const companyId = getEffectiveCompanyId();
    if (!companyId) {
      toast.error('No company ID found');
      return;
    }

    setIsLoading(true);
    try {
      const updates = {
        displayInDirectory: true,
        category: 'Pest Control',
        regionsServed: ['Bakersfield', 'Fresno'],
        zipCodes: ['93309', '93310', '93720'],
        latitude: 35.3733,
        longitude: -119.0187,
        websiteUrl: 'https://example.com'
      };

      const result = await CompanyService.updateCompany(companyId, updates);
      addResult('Update Company with Directory Fields', result);
      
      if (result.success) {
        toast.success('Company updated successfully!');
      } else {
        toast.error(`Update failed: ${result.error}`);
      }
    } catch (error) {
      addResult('Update Company', { success: false, error: error.message });
      toast.error('Test failed');
    }
    setIsLoading(false);
  };

  const testUpdateCompanyInvalid = async () => {
    const companyId = getEffectiveCompanyId();
    if (!companyId) {
      toast.error('No company ID found');
      return;
    }

    setIsLoading(true);
    try {
      const invalidUpdates = {
        displayInDirectory: true,
        category: 'Invalid Category',
        regionsServed: [],
        zipCodes: ['invalid-zip']
      };

      const result = await CompanyService.updateCompany(companyId, invalidUpdates);
      addResult('Update Company (Invalid Data)', result);
      
      if (!result.success) {
        toast.success('Validation correctly caught invalid data');
      } else {
        toast.error('Validation should have failed!');
      }
    } catch (error) {
      addResult('Update Company (Invalid)', { success: false, error: error.message });
      toast.error('Test failed');
    }
    setIsLoading(false);
  };

  const clearResults = () => {
    setTestResults([]);
    toast.success('Results cleared');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Phase 1 Directory Testing
          </h1>
          <p className="text-gray-600">
            Test DirectoryService and CompanyService directory functionality
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">DirectoryService Tests</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <button
              onClick={testGetAllProviders}
              disabled={isLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              Get All Providers
            </button>
            <button
              onClick={testGetByCategory}
              disabled={isLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              Get by Category
            </button>
            <button
              onClick={testGetByZip}
              disabled={isLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              Get by ZIP Code
            </button>
            <button
              onClick={testGetProviderProfile}
              disabled={isLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              Get Provider Profile
            </button>
            <button
              onClick={testValidateData}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Test Validation
            </button>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">CompanyService Tests</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={testUpdateCompany}
              disabled={isLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              Update Company (Valid)
            </button>
            <button
              onClick={testUpdateCompanyInvalid}
              disabled={isLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              Update Company (Invalid)
            </button>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Test Results</h2>
            <button
              onClick={clearResults}
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Clear Results
            </button>
          </div>
          
          {testResults.length === 0 ? (
            <p className="text-gray-500">No test results yet. Run a test above.</p>
          ) : (
            <div className="space-y-4">
              {testResults.map((test, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-gray-900">{test.testName}</h3>
                    <span className="text-xs text-gray-500">
                      {new Date(test.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto max-h-96">
                    {JSON.stringify(test.result, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TestDirectoryPage;

