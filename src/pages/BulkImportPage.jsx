import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import CompanyService from '../services/companyService';
import InvitationService from '../services/invitationService';
import CustomerService from '../services/customerService';
import { useDropzone } from 'react-dropzone';
import { auth } from '../services/firebase';
import { 
  DocumentArrowUpIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowDownTrayIcon,
  UsersIcon,
  BuildingStorefrontIcon,
  WrenchScrewdriverIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { SERVICE_CATEGORIES } from '../constants/serviceCategories';

const ROLE_OPTIONS = {
  'admin': 'admin',
  'administrator': 'admin',
  'supervisor': 'supervisor',
  'manager': 'supervisor',
  'technician': 'field_tech',
  'field technician': 'field_tech',
  'field tech': 'field_tech',
  'tech': 'field_tech'
};

const BulkImportPage = () => {
  const { userProfile } = useAuth();
  const { getEffectiveCompanyId } = useCompany();
  const [activeTab, setActiveTab] = useState('users'); // 'users', 'customers', 'services'
  const [isLoading, setIsLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [results, setResults] = useState(null);

  const onDrop = React.useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      
      // Read and preview file
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          
          // Preview first 5 rows
          setPreview({
            headers: Object.keys(jsonData[0] || {}),
            rows: jsonData.slice(0, 5),
            totalRows: jsonData.length
          });
        } catch (error) {
          toast.error('Failed to read file. Please ensure it\'s a valid Excel or CSV file.');
        }
      };
      reader.readAsArrayBuffer(selectedFile);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    },
    multiple: false
  });

  const normalizeRole = (roleString) => {
    if (!roleString) return 'field_tech';
    const normalized = roleString.toLowerCase().trim();
    return ROLE_OPTIONS[normalized] || 'field_tech';
  };

  const normalizeHeader = (header, expectedHeaders) => {
    const normalized = header?.toLowerCase().trim();
    // Try exact match first
    if (expectedHeaders.includes(normalized)) {
      return normalized;
    }
    // Try case-insensitive match
    const match = expectedHeaders.find(h => h.toLowerCase() === normalized);
    return match || header;
  };

  // Download template based on active tab
  const downloadTemplate = () => {
    let template = [];
    let filename = '';
    let sheetName = '';

    switch (activeTab) {
      case 'users':
        template = [
          { email: 'john.doe@example.com', name: 'John Doe', role: 'field_tech', phone: '555-0100', notes: '' }
        ];
        filename = 'user_import_template.xlsx';
        sheetName = 'Users';
        break;
      case 'customers':
        template = [
          { 
            name: 'Acme Corporation', 
            email: 'contact@acme.com', 
            phone: '555-1000', 
            address: '123 Main St', 
            city: 'Los Angeles', 
            state: 'CA', 
            zipCode: '90001',
            notes: 'Preferred contact method: Email',
            emailConsent: 'true'
          }
        ];
        filename = 'customer_import_template.xlsx';
        sheetName = 'Customers';
        break;
      case 'services':
        template = [
          { 
            service: 'Outlet and switch replacement', 
            category: 'Electrical & Lighting', 
            description: 'Standard outlet/switch replacement', 
            basePrice: '75.00' 
          }
        ];
        filename = 'services_import_template.xlsx';
        sheetName = 'Services';
        break;
    }

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
    toast.success(`Template downloaded: ${filename}`);
  };

  // Process Users Import
  const processUsersImport = async (jsonData) => {
    const importResults = {
      total: jsonData.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const rowNumber = i + 2; // +2 for 1-indexed and header row
      
      // Normalize headers
      const email = row.email || row.Email || row.EMAIL || '';
      const name = row.name || row.Name || row.NAME || '';
      const role = normalizeRole(row.role || row.Role || row.ROLE || 'field_tech');
      const phone = row.phone || row.Phone || row.PHONE || '';
      const notes = row.notes || row.Notes || row.NOTES || '';

      // Validation
      if (!email || !email.includes('@')) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: email || '(missing email)',
          error: 'Invalid or missing email address'
        });
        continue;
      }

      if (!name) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: email,
          error: 'Missing name'
        });
        continue;
      }

      try {
        const result = await InvitationService.createInvitation(
          userProfile.companyId,
          email,
          role,
          userProfile.id
        );

        if (result.success) {
          importResults.successful++;
          
          // Try to send email (don't fail if email fails)
          try {
            await sendInvitationEmail(result.invitation);
          } catch (emailError) {
            console.error('Email send failed for', email, emailError);
          }
        } else {
          importResults.failed++;
          importResults.errors.push({
            row: rowNumber,
            identifier: email,
            error: result.error || 'Failed to create invitation'
          });
        }
      } catch (error) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: email,
          error: error.message || 'Unknown error'
        });
      }

      // Small delay to avoid rate limiting
      if (i % 10 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return importResults;
  };

  // Process Customers Import
  const processCustomersImport = async (jsonData) => {
    const importResults = {
      total: jsonData.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const rowNumber = i + 2; // +2 for 1-indexed and header row
      
      // Normalize headers (case-insensitive)
      const name = row.name || row.Name || row.NAME || '';
      const email = row.email || row.Email || row.EMAIL || '';
      const phone = row.phone || row.Phone || row.PHONE || '';
      const address = row.address || row.Address || row.ADDRESS || '';
      const city = row.city || row.City || row.CITY || '';
      const state = row.state || row.State || row.STATE || '';
      const zipCode = row.zipCode || row.zipcode || row['zip code'] || row['ZIP Code'] || row['ZIP CODE'] || '';
      const notes = row.notes || row.Notes || row.NOTES || '';
      const emailConsent = row.emailConsent || row['email consent'] || row['Email Consent'] || 'false';

      // Validation: name is required
      if (!name || !name.trim()) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: email || phone || '(no identifier)',
          error: 'Missing customer name'
        });
        continue;
      }

      // At least one of email or phone is required
      if (!email && !phone) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: name,
          error: 'At least one of email or phone is required'
        });
        continue;
      }

      // Email validation if provided
      if (email && !email.includes('@')) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: name,
          error: 'Invalid email format'
        });
        continue;
      }

      try {
        const customerData = {
          name: name.trim(),
          email: email?.trim() || '',
          phone: phone?.trim() || '',
          address: address?.trim() || '',
          city: city?.trim() || '',
          state: state?.trim() || '',
          zipCode: zipCode?.trim() || '',
          notes: notes?.trim() || '',
          emailConsent: emailConsent === 'true' || emailConsent === true
        };

        const result = await CustomerService.createCustomer(customerData, userProfile);

        if (result.success) {
          importResults.successful++;
          
          // Show different message if pending
          if (result.customer.status === 'pending') {
            // Count pending in results (will show in summary)
          }
        } else {
          importResults.failed++;
          importResults.errors.push({
            row: rowNumber,
            identifier: name,
            error: result.error || 'Failed to create customer'
          });
        }
      } catch (error) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: name,
          error: error.message || 'Unknown error'
        });
      }

      // Small delay to avoid rate limiting
      if (i % 10 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return importResults;
  };

  // Process Services Import
  const processServicesImport = async (jsonData) => {
    const importResults = {
      total: jsonData.length,
      successful: 0,
      failed: 0,
      errors: [],
      duplicates: 0
    };

    // Get all valid service names
    const allServices = SERVICE_CATEGORIES.flatMap(cat => cat.services);
    const companyId = getEffectiveCompanyId() || userProfile?.companyId;
    
    // Get current company services to check for duplicates
    let existingServices = [];
    if (!companyId) {
      return {
        total: jsonData.length,
        successful: 0,
        failed: jsonData.length,
        errors: [{
          row: 0,
          identifier: 'Company',
          error: 'No company found. Please set up your company first.'
        }],
        duplicates: 0
      };
    }
    
    try {
      const companyResult = await CompanyService.getCompany(companyId);
      if (companyResult.success) {
        existingServices = companyResult.company.services || [];
      }
    } catch (error) {
      console.error('Error loading company services:', error);
      return {
        total: jsonData.length,
        successful: 0,
        failed: jsonData.length,
        errors: [{
          row: 0,
          identifier: 'Company',
          error: 'Failed to load company services: ' + error.message
        }],
        duplicates: 0
      };
    }

    const servicesToAdd = new Set(); // Track services to add

    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const rowNumber = i + 2; // +2 for 1-indexed and header row
      
      const service = row.service || row.Service || row.SERVICE || '';
      const category = row.category || row.Category || row.CATEGORY || '';
      const description = row.description || row.Description || row.DESCRIPTION || '';
      const basePrice = row.basePrice || row['base price'] || row['Base Price'] || row['BASE PRICE'] || '';

      if (!service || !service.trim()) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: '(missing service name)',
          error: 'Missing service name'
        });
        continue;
      }

      const serviceName = service.trim();

      // Check if service exists in predefined list
      if (!allServices.includes(serviceName)) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: serviceName,
          error: `Service "${serviceName}" not found in available services list`
        });
        continue;
      }

      // Check for duplicates (already in company or already added in this import)
      if (existingServices.includes(serviceName) || servicesToAdd.has(serviceName)) {
        importResults.duplicates++;
        continue; // Skip but don't count as error
      }

      servicesToAdd.add(serviceName);
    }

    // Add all services to company in one update
    if (servicesToAdd.size > 0) {
      try {
        const newServices = [...existingServices, ...Array.from(servicesToAdd)];
        // Sort alphabetically for consistency
        newServices.sort();
        
        const updateResult = await CompanyService.updateCompany(companyId, {
          services: newServices
        });

        if (updateResult.success) {
          importResults.successful = servicesToAdd.size;
        } else {
          importResults.failed = servicesToAdd.size;
          importResults.errors.push({
            row: 0,
            identifier: 'Company update',
            error: updateResult.error || 'Failed to update company services'
          });
        }
      } catch (error) {
        importResults.failed = servicesToAdd.size;
        importResults.errors.push({
          row: 0,
          identifier: 'Company update',
          error: error.message || 'Unknown error'
        });
      }
    } else {
      // No new services to add
      if (importResults.errors.length === 0 && importResults.duplicates === jsonData.length) {
        // All were duplicates - add informational message
        importResults.errors.push({
          row: 0,
          identifier: 'Import',
          error: 'No new services to add. All services in the file already exist in your company.'
        });
      } else if (importResults.errors.length === 0 && jsonData.length > 0) {
        importResults.errors.push({
          row: 0,
          identifier: 'Import',
          error: 'No valid services to add (all were duplicates or invalid)'
        });
      }
    }

    return importResults;
  };

  const processFile = async () => {
    if (!file || !userProfile?.companyId) {
      toast.error('Please select a file and ensure you have a company');
      return;
    }

    setIsLoading(true);
    setResults(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);

          if (jsonData.length === 0) {
            toast.error('File is empty or has no data rows');
            setIsLoading(false);
            return;
          }

          let importResults;

          switch (activeTab) {
            case 'users':
              importResults = await processUsersImport(jsonData);
              break;
            case 'customers':
              importResults = await processCustomersImport(jsonData);
              break;
            case 'services':
              importResults = await processServicesImport(jsonData);
              break;
            default:
              toast.error('Invalid import type');
              setIsLoading(false);
              return;
          }

          setResults(importResults);
          
          if (importResults.failed === 0 && importResults.errors.length === 0) {
            toast.success(`Import complete: ${importResults.successful} ${activeTab} imported successfully!`);
          } else {
            toast.success(`Import complete: ${importResults.successful} successful, ${importResults.failed} failed. Check errors below.`);
          }
        } catch (error) {
          console.error('Error processing file:', error);
          toast.error('Failed to process file: ' + error.message);
        } finally {
          setIsLoading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('Error reading file:', error);
      toast.error('Failed to read file');
      setIsLoading(false);
    }
  };

  const sendInvitationEmail = async (invitation) => {
    try {
      const projectId = 'mi-factotum-field-service';
      const sendInviteEmailUrl = `https://us-central1-${projectId}.cloudfunctions.net/sendInvitationEmail`;
      
      const token = await auth.currentUser?.getIdToken();
      
      await fetch(sendInviteEmailUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          invitationId: invitation.id,
          email: invitation.email,
          companyName: invitation.companyName,
          invitationCode: invitation.invitationCode,
          role: invitation.role,
          expiresAt: invitation.expiresAt
        })
      });
    } catch (error) {
      console.error('Error sending invitation email:', error);
    }
  };

  const getTabInstructions = () => {
    switch (activeTab) {
      case 'users':
        return {
          title: 'User Import Format',
          required: ['email', 'name'],
          optional: ['role', 'phone', 'notes'],
          notes: [
            'Users will receive invitation emails automatically',
            'Duplicate emails will be skipped',
            'Invalid role values default to field_tech',
            'Role options: admin, supervisor, field_tech, technician'
          ]
        };
      case 'customers':
        return {
          title: 'Customer Import Format',
          required: ['name', 'email OR phone (at least one required)'],
          optional: ['address', 'city', 'state', 'zipCode', 'notes', 'emailConsent'],
          notes: [
            'Customers created by field technicians require admin approval',
            'Customers created by admins/supervisors are automatically approved',
            'At least one of email or phone is required',
            'emailConsent should be "true" or "false"'
          ]
        };
      case 'services':
        return {
          title: 'Services Import Format',
          required: ['service'],
          optional: ['category', 'description', 'basePrice'],
          notes: [
            'Service names must match exactly from the predefined list',
            'Invalid service names will be skipped with error messages',
            'Duplicate services (already in company) will be skipped',
            'View available services in Company Setup page'
          ]
        };
      default:
        return null;
    }
  };

  const resetImport = () => {
    setFile(null);
    setPreview(null);
    setResults(null);
  };

  if (!userProfile?.companyId) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <p className="text-gray-500">Please set up your company first.</p>
        </div>
      </div>
    );
  }

  const instructions = getTabInstructions();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Bulk Import</h1>
        <p className="mt-1 text-sm text-gray-500">
          Import users, customers, or services from Excel or CSV files
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white shadow rounded-lg mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex" aria-label="Tabs">
            <button
              onClick={() => {
                setActiveTab('users');
                resetImport();
              }}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'users'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <UsersIcon className="w-5 h-5" />
              Users
            </button>
            <button
              onClick={() => {
                setActiveTab('customers');
                resetImport();
              }}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'customers'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <BuildingStorefrontIcon className="w-5 h-5" />
              Customers
            </button>
            <button
              onClick={() => {
                setActiveTab('services');
                resetImport();
              }}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'services'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <WrenchScrewdriverIcon className="w-5 h-5" />
              Services
            </button>
          </nav>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">Upload File</h2>
            <button
              onClick={downloadTemplate}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
              Download Template
            </button>
          </div>
          
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-primary-500 bg-primary-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input {...getInputProps()} />
            <DocumentArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-600">
              {isDragActive ? 'Drop the file here' : 'Drag and drop a file here, or click to select'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Supports .xlsx, .xls, and .csv files
            </p>
          </div>

          {file && (
            <div className="mt-4 p-3 bg-gray-50 rounded-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <button
                  onClick={resetImport}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {preview && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Preview (Row 1-5 of {preview.totalRows} total):
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs border border-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1 border border-gray-200 text-left bg-gray-100 font-semibold">Row #</th>
                      {preview.headers.map((header, idx) => (
                        <th key={idx} className="px-2 py-1 border border-gray-200 text-left">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, rowIdx) => (
                      <tr key={rowIdx}>
                        <td className="px-2 py-1 border border-gray-200 bg-gray-50 font-semibold">{rowIdx + 2}</td>
                        {preview.headers.map((header, colIdx) => (
                          <td key={colIdx} className="px-2 py-1 border border-gray-200">
                            {row[header] || ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button
            onClick={processFile}
            disabled={!file || isLoading}
            className="mt-6 w-full px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Processing...' : `Import ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`}
          </button>
        </div>

        {/* Instructions & Results */}
        <div className="space-y-6">
          {/* Instructions */}
          {instructions && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">{instructions.title}</h2>
              <div className="space-y-3 text-sm text-gray-600">
                <div>
                  <p className="font-medium text-gray-900 mb-1">Required Columns:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    {instructions.required.map((req, idx) => (
                      <li key={idx}>{req}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-gray-900 mb-1">Optional Columns:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    {instructions.optional.map((opt, idx) => (
                      <li key={idx}>{opt}</li>
                    ))}
                  </ul>
                </div>
                <div className="mt-4 p-3 bg-blue-50 rounded-md">
                  {instructions.notes.map((note, idx) => (
                    <p key={idx} className="text-xs text-blue-800 mb-1">
                      • {note}
                    </p>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <a
                    href="/docs/IMPORT_FORMAT_GUIDE.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary-600 hover:text-primary-700 underline"
                  >
                    View complete format guide →
                  </a>
                  <a
                    href={`/import-templates/${activeTab}_import_template.csv`}
                    download
                    className="text-sm text-gray-600 hover:text-gray-700 underline"
                  >
                    Download CSV template →
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Import Results</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Total rows processed:</span>
                  <span className="text-sm font-medium">{results.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 flex items-center">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 mr-2" />
                    Successful:
                  </span>
                  <span className="text-sm font-medium text-green-600">{results.successful}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 flex items-center">
                    <XCircleIcon className="w-5 h-5 text-red-500 mr-2" />
                    Failed:
                  </span>
                  <span className="text-sm font-medium text-red-600">{results.failed}</span>
                </div>
                {results.duplicates !== undefined && results.duplicates > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 flex items-center">
                      <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500 mr-2" />
                      Skipped (duplicates):
                    </span>
                    <span className="text-sm font-medium text-yellow-600">{results.duplicates}</span>
                  </div>
                )}
                
                {results.errors.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Errors ({results.errors.length}):
                    </p>
                    <div className="max-h-64 overflow-y-auto space-y-1 border border-gray-200 rounded-md p-2">
                      {results.errors.map((error, idx) => (
                        <div key={idx} className="text-xs text-red-700 bg-red-50 p-2 rounded border border-red-200">
                          <div className="font-semibold">Row {error.row}: {error.identifier}</div>
                          <div className="text-red-600 mt-1">{error.error}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkImportPage;
