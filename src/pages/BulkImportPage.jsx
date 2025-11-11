import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import CompanyService from '../services/companyService';
import InvitationService from '../services/invitationService';
import CustomerService from '../services/customerService';
import MaterialsService from '../services/materialsService';
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
  const [importProgress, setImportProgress] = useState(null);
  const [hasImportedCurrentFile, setHasImportedCurrentFile] = useState(false);
  const previewGridRef = useRef(null);
  const previewToolbarOptions = useMemo(() => ['Search', 'ExcelExport'], []);
  const previewPageSettings = useMemo(() => ({ pageSize: 5, pageSizes: [5, 10, 25] }), []);
  const previewFilterSettings = useMemo(() => ({ type: 'Excel' }), []);

  const onDrop = React.useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      setHasImportedCurrentFile(false);
      setImportProgress(null);
      setResults(null);
      
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
          setTimeout(() => {
            if (previewGridRef.current) {
              previewGridRef.current.refresh();
            }
          }, 0);
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
            'Service Name': 'Monthly Exterior Pest Prevention', 
            'Category': 'Pest Control', 
            'Description': 'Exterior spray, web removal, perimeter baiting', 
            'Base Price': '89.00' 
          }
        ];
        filename = 'services_import_template.xlsx';
        sheetName = 'Services';
        break;
      case 'materials':
        template = [
          {
            'Material Name': 'Termidor SC (78 oz)',
            'Service Description': 'Termiticide & ant control concentrate',
            'Category Name': 'Chemicals',
            Subcategory: 'Termiticides',
            Unit: 'bottle (78 oz)',
            'Cost Per Unit': '145.00',
            'Retail Price': '229.00',
            Supplier: 'Univar Solutions',
            'Supplier SKU': 'TERM-SC-78',
            'Reorder Threshold': '4',
            'Quantity In Stock': '12',
            'Storage Location': 'Warehouse A - Shelf C',
            Active: 'true',
            'Internal Notes': 'Dilute 0.8 oz/gallon; PPE required'
          }
        ];
        filename = 'materials_import_template.xlsx';
        sheetName = 'Materials';
        break;
    }

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
    toast.success(`Template downloaded: ${filename}`);
  };

  // Process Users Import
  const processUsersImport = async (jsonData, onProgress = () => {}) => {
    const importResults = {
      total: jsonData.length,
      successful: 0,
      failed: 0,
      duplicates: 0,
      errors: []
    };
    const seenEmails = new Set();

    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const rowNumber = i + 2; // +2 for 1-indexed and header row
      const processedCount = i + 1;
      
      // Normalize headers
      const email = row.email || row.Email || row.EMAIL || '';
      const name = row.name || row.Name || row.NAME || '';
      const role = normalizeRole(row.role || row.Role || row.ROLE || 'field_tech');
      const phone = row.phone || row.Phone || row.PHONE || '';
      const notes = row.notes || row.Notes || row.NOTES || '';
      const normalizedEmail = email?.toString().trim().toLowerCase();

      // Validation
      if (!email || !email.includes('@')) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: email || '(missing email)',
          error: 'Invalid or missing email address'
        });
        onProgress(processedCount);
        continue;
      }

      if (!name) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: email,
          error: 'Missing name'
        });
        onProgress(processedCount);
        continue;
      }

      if (normalizedEmail && seenEmails.has(normalizedEmail)) {
        importResults.duplicates++;
        importResults.errors.push({
          row: rowNumber,
          identifier: email,
          error: 'Duplicate email within file - skipped'
        });
        onProgress(processedCount);
        continue;
      }
      
      if (normalizedEmail) {
        seenEmails.add(normalizedEmail);
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
          // Treat known duplicate errors as duplicates rather than failures
          if (result.error && /already exists/i.test(result.error)) {
            importResults.failed = Math.max(importResults.failed - 1, 0);
            importResults.duplicates++;
            importResults.errors[importResults.errors.length - 1].error = 'Duplicate email - invitation already exists';
          }
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

      onProgress(processedCount);
    }

    return importResults;
  };

  // Process Customers Import
  const processCustomersImport = async (jsonData, onProgress = () => {}) => {
    const importResults = {
      total: jsonData.length,
      successful: 0,
      failed: 0,
      duplicates: 0,
      errors: []
    };

    const duplicateMaps = await CustomerService.getCustomerDuplicateMaps(userProfile);
    const emailKeys = new Set(duplicateMaps.emailKeys);
    const nameZipKeys = new Set(duplicateMaps.nameZipKeys);
    const companyId = userProfile?.companyId || null;

    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const rowNumber = i + 2; // +2 for 1-indexed and header row
      const processedCount = i + 1;
      
      // Normalize headers (case-insensitive)
      const name = row.name || row.Name || row.NAME || row['Customer Name'] || row['customer name'] || '';
      const email = row.email || row.Email || row.EMAIL || row['Customer Email'] || row['customer email'] || '';
      const phone = row.phone || row.Phone || row.PHONE || row['Phone Number'] || row['phone number'] || '';
      const address = row.address || row.Address || row.ADDRESS || row['Street Address'] || row['street address'] || '';
      const city = row.city || row.City || row.CITY || row['City/Town'] || row['city/town'] || '';
      const state = row.state || row.State || row.STATE || row['State/Province'] || row['state/province'] || '';
      const zipCode = row.zipCode || row.zipcode || row['zip code'] || row['ZIP Code'] || row['ZIP CODE'] || row['Postal Code'] || row['postal code'] || '';
      const notes = row.notes || row.Notes || row.NOTES || row['Service Notes'] || row['service notes'] || '';
      const emailConsent = row.emailConsent || row['email consent'] || row['Email Consent'] || 'false';

      const trimmedName = name?.toString().trim() || '';
      const trimmedEmail = email?.toString().trim() || '';
      const trimmedPhone = phone?.toString().trim() || '';
      const trimmedAddress = address?.toString().trim() || '';
      const trimmedCity = city?.toString().trim() || '';
      const trimmedState = state?.toString().trim() || '';
      const trimmedZip = zipCode?.toString().trim() || '';
      const trimmedNotes = notes?.toString().trim() || '';

      const nameKey = trimmedName.toLowerCase();
      const emailKey = trimmedEmail.toLowerCase();
      const zipKey = trimmedZip.toLowerCase();
      const emailCompanyKey = companyId && emailKey ? `${companyId}__${emailKey}` : null;
      const nameZipCompanyKey = companyId && nameKey && zipKey ? `${companyId}__${nameKey}__${zipKey}` : null;

      // Validation: name is required
      if (!trimmedName) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: trimmedEmail || trimmedPhone || '(no identifier)',
          error: 'Missing customer name'
        });
        onProgress(processedCount);
        continue;
      }

      // At least one of email or phone is required
      if (!trimmedEmail && !trimmedPhone) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: trimmedName,
          error: 'At least one of email or phone is required'
        });
        onProgress(processedCount);
        continue;
      }

      // Email validation if provided
      if (trimmedEmail && !trimmedEmail.includes('@')) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: trimmedName,
          error: 'Invalid email format'
        });
        onProgress(processedCount);
        continue;
      }

      // Duplicate checks (existing records or within current import)
      if (emailCompanyKey && emailKeys.has(emailCompanyKey)) {
        importResults.duplicates++;
        importResults.errors.push({
          row: rowNumber,
          identifier: trimmedEmail || trimmedName,
          error: 'Duplicate customer (email already exists) - skipped'
        });
        onProgress(processedCount);
        continue;
      }

      if (nameZipCompanyKey && nameZipKeys.has(nameZipCompanyKey)) {
        importResults.duplicates++;
        importResults.errors.push({
          row: rowNumber,
          identifier: trimmedName,
          error: 'Duplicate customer (name + ZIP already exists) - skipped'
        });
        onProgress(processedCount);
        continue;
      }

      try {
        const customerData = {
          name: trimmedName,
          email: trimmedEmail || '',
          phone: trimmedPhone || '',
          address: trimmedAddress || '',
          city: trimmedCity || '',
          state: trimmedState || '',
          zipCode: trimmedZip || '',
          notes: trimmedNotes || '',
          emailConsent: emailConsent === 'true' || emailConsent === true
        };

        const result = await CustomerService.createCustomer(customerData, userProfile);

        if (result.success) {
          importResults.successful++;
          if (emailCompanyKey) {
            emailKeys.add(emailCompanyKey);
          }
          if (nameZipCompanyKey) {
            nameZipKeys.add(nameZipCompanyKey);
          }
          
          // Show different message if pending
          if (result.customer.status === 'pending') {
            // Count pending in results (will show in summary)
          }
        } else {
          importResults.failed++;
          importResults.errors.push({
            row: rowNumber,
            identifier: trimmedName,
            error: result.error || 'Failed to create customer'
          });
          if (result.error && /duplicate/i.test(result.error)) {
            importResults.failed = Math.max(importResults.failed - 1, 0);
            importResults.duplicates++;
            importResults.errors[importResults.errors.length - 1].error = result.error;
          }
        }
      } catch (error) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: trimmedName,
          error: error.message || 'Unknown error'
        });
      }

      // Small delay to avoid rate limiting
      if (i % 10 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      onProgress(processedCount);
    }

    return importResults;
  };

  // Process Services Import
  const processServicesImport = async (jsonData, onProgress = () => {}) => {
    const importResults = {
      total: jsonData.length,
      successful: 0,
      failed: 0,
      errors: [],
      duplicates: 0
    };

    const companyId = getEffectiveCompanyId() || userProfile?.companyId;
    
    // Get current company services to check for duplicates
    let existingServices = [];
    let existingCategories = [];
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
        existingCategories = companyResult.company.serviceCategories || [];
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
    const categoriesToAdd = new Set();

    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const rowNumber = i + 2; // +2 for 1-indexed and header row
      const processedCount = i + 1;
      
      const service = row.service || row.Service || row.SERVICE || row['Service Name'] || row['service name'] || '';
      const category = row.category || row.Category || row.CATEGORY || row['Category Name'] || row['category name'] || '';
      const description = row.description || row.Description || row.DESCRIPTION || row['Service Description'] || row['service description'] || '';
      const basePrice =
        row.basePrice ||
        row['base price'] ||
        row['Base Price'] ||
        row['BASE PRICE'] ||
        row['Base Rate'] ||
        row['base rate'] ||
        '';

      if (!service || !service.trim()) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: '(missing service name)',
          error: 'Missing service name'
        });
        onProgress(processedCount);
        continue;
      }

      const serviceName = service.trim();
      const categoryName = category?.trim() || '';

      // Check for duplicates (already in company or already added in this import)
      if (existingServices.includes(serviceName) || servicesToAdd.has(serviceName)) {
        importResults.duplicates++;
        onProgress(processedCount);
        continue; // Skip but don't count as error
      }

      servicesToAdd.add(serviceName);
      if (categoryName && !existingCategories.includes(categoryName) && !categoriesToAdd.has(categoryName)) {
        categoriesToAdd.add(categoryName);
      }

      onProgress(processedCount);
    }

    // Add all services to company in one update
    if (servicesToAdd.size > 0) {
      try {
        const updates = {};
        if (servicesToAdd.size > 0) {
          const newServices = [...existingServices, ...Array.from(servicesToAdd)];
          newServices.sort();
          updates.services = newServices;
        }
        if (categoriesToAdd.size > 0) {
          const newCategories = [...existingCategories, ...Array.from(categoriesToAdd)];
          newCategories.sort();
          updates.serviceCategories = newCategories;
        }
        
        const updateResult = await CompanyService.updateCompany(companyId, updates);

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

  // Process Materials Import
  const processMaterialsImport = async (jsonData, onProgress = () => {}) => {
    const importResults = {
      total: jsonData.length,
      successful: 0,
      failed: 0,
      duplicates: 0,
      errors: []
    };

    const companyId = getEffectiveCompanyId() || userProfile?.companyId;

    if (!companyId) {
      return {
        total: jsonData.length,
        successful: 0,
        failed: jsonData.length,
        duplicates: 0,
        errors: [{
          row: 0,
          identifier: 'Company',
          error: 'No company found. Please set up your company first.'
        }]
      };
    }

    let existingNames = new Set();
    try {
      const existing = await MaterialsService.getMaterials(companyId, userProfile);
      if (existing.success && existing.materials?.length) {
        existingNames = new Set(
          existing.materials.map((m) => (m.name || '').toLowerCase().trim()).filter(Boolean)
        );
      }
    } catch (error) {
      console.error('Error loading existing materials:', error);
      return {
        total: jsonData.length,
        successful: 0,
        failed: jsonData.length,
        duplicates: 0,
        errors: [{
          row: 0,
          identifier: 'Company',
          error: 'Failed to load existing materials: ' + (error.message || 'Unknown error')
        }]
      };
    }

    const seenNames = new Set();

    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const rowNumber = i + 2;
      const processedCount = i + 1;

      const rawName = row.name || row.Name || row.NAME || row['Material Name'] || row['material name'] || '';
      const rawDescription = row.description || row.Description || row.DESCRIPTION || row['Service Description'] || row['service description'] || '';
      const rawCategory = row.category || row.Category || row.CATEGORY || row['Category Name'] || row['category name'] || '';
      const rawSubcategory = row.subcategory || row.Subcategory || row.SUBCATEGORY || row['Subcategory'] || row['subcategory'] || '';
      const rawUnit = row.unit || row.Unit || row.UNIT || '';
      const rawCost = row.costPerUnit || row['Cost Per Unit'] || row['cost per unit'] || row.cost || row.Cost || '';
      const rawPrice = row.retailPrice || row['Retail Price'] || row['retail price'] || row.price || row.Price || '';
      const rawSupplier = row.supplier || row.Supplier || '';
      const rawSupplierSku = row.supplierSku || row['Supplier SKU'] || row['supplier sku'] || '';
      const rawReorderThreshold = row.reorderThreshold || row['Reorder Threshold'] || row['reorder threshold'] || '';
      const rawQuantity = row.quantityInStock || row['Quantity In Stock'] || row['quantity in stock'] || '';
      const rawStorageLocation = row.storageLocation || row['Storage Location'] || row['storage location'] || '';
      const rawActive = row.active ?? row.Active ?? row['Is Active'] ?? row['is active'] ?? '';
      const rawInternalNotes = row.internalNotes || row['Internal Notes'] || row['internal notes'] || '';
      const rawTaxable = row.taxable ?? row.Taxable ?? row['Is Taxable'] ?? row['is taxable'] ?? '';
      const rawDefaultMarkup = row.defaultMarkupPercent || row['Default Markup %'] || row['default markup %'] || row['Markup Percent'] || row['markup percent'] || '';

      const name = rawName?.toString().trim() || '';
      const description = rawDescription?.toString().trim() || '';
      const category = rawCategory?.toString().trim() || '';
      const subcategory = rawSubcategory?.toString().trim() || '';
      const unit = rawUnit?.toString().trim() || '';
      const supplier = rawSupplier?.toString().trim() || '';
      const supplierSku = rawSupplierSku?.toString().trim() || '';
      const storageLocation = rawStorageLocation?.toString().trim() || '';
      const internalNotes = rawInternalNotes?.toString().trim() || '';

      const costPerUnit = rawCost !== '' && rawCost !== null && rawCost !== undefined ? parseFloat(rawCost) : 0;
      const retailPrice = rawPrice !== '' && rawPrice !== null && rawPrice !== undefined ? parseFloat(rawPrice) : NaN;
      const reorderThreshold = rawReorderThreshold !== '' && rawReorderThreshold !== null && rawReorderThreshold !== undefined ? parseFloat(rawReorderThreshold) : 0;
      const quantityInStock = rawQuantity !== '' && rawQuantity !== null && rawQuantity !== undefined ? parseFloat(rawQuantity) : 0;
      const defaultMarkupPercent = rawDefaultMarkup !== '' && rawDefaultMarkup !== null && rawDefaultMarkup !== undefined ? parseFloat(rawDefaultMarkup) : 0;

      const active = (() => {
        if (typeof rawActive === 'boolean') return rawActive;
        const normalized = rawActive?.toString().trim().toLowerCase();
        if (!normalized) return true;
        return ['true', 'yes', '1', 'active'].includes(normalized);
      })();

      const taxable = (() => {
        if (typeof rawTaxable === 'boolean') return rawTaxable;
        const normalized = rawTaxable?.toString().trim().toLowerCase();
        if (!normalized) return false;
        return ['true', 'yes', '1', 'taxable'].includes(normalized);
      })();

      if (!name) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: '(missing material name)',
          error: 'Missing material name'
        });
        onProgress(processedCount);
        continue;
      }

      if (!category) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: name,
          error: 'Missing category'
        });
        onProgress(processedCount);
        continue;
      }

      if (!unit) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: name,
          error: 'Missing unit'
        });
        onProgress(processedCount);
        continue;
      }

      if (Number.isNaN(retailPrice)) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: name,
          error: 'Retail price is required and must be numeric'
        });
        onProgress(processedCount);
        continue;
      }

      const nameKey = name.toLowerCase();
      if (existingNames.has(nameKey) || seenNames.has(nameKey)) {
        importResults.duplicates++;
        importResults.errors.push({
          row: rowNumber,
          identifier: name,
          error: 'Duplicate material name - skipped'
        });
        onProgress(processedCount);
        continue;
      }

      try {
        const materialData = {
          name,
          description,
          category,
          subcategory,
          unit,
          costPerUnit: Number.isNaN(costPerUnit) ? 0 : costPerUnit,
          retailPrice: retailPrice,
          supplier,
          supplierSku,
          reorderThreshold: Number.isNaN(reorderThreshold) ? 0 : reorderThreshold,
          quantityInStock: Number.isNaN(quantityInStock) ? 0 : quantityInStock,
          storageLocation,
          active,
          internalNotes,
          taxable,
          defaultMarkupPercent: Number.isNaN(defaultMarkupPercent) ? 0 : defaultMarkupPercent
        };

        const result = await MaterialsService.createMaterial(materialData, companyId);

        if (result.success) {
          importResults.successful++;
          seenNames.add(nameKey);
        } else {
          importResults.failed++;
          importResults.errors.push({
            row: rowNumber,
            identifier: name,
            error: result.error || 'Failed to create material'
          });

          if (result.error && /duplicate/i.test(result.error)) {
            importResults.failed = Math.max(importResults.failed - 1, 0);
            importResults.duplicates++;
            importResults.errors[importResults.errors.length - 1].error = result.error;
          }
        }
      } catch (error) {
        importResults.failed++;
        importResults.errors.push({
          row: rowNumber,
          identifier: name,
          error: error.message || 'Unknown error'
        });
      }

      if (i % 10 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      onProgress(processedCount);
    }

    return importResults;
  };

  const importLabels = {
    users: 'team members',
    customers: 'customers',
    services: 'services',
    materials: 'materials'
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
            setImportProgress(null);
            setIsLoading(false);
            return;
          }

          const totalRows = jsonData.length;
          setImportProgress({
            current: 0,
            total: totalRows,
            percent: 0,
            label: `Importing ${importLabels[activeTab] || 'records'}`
          });
          const updateProgress = (processed) => {
            setImportProgress(prev => {
              if (!prev) return prev;
              const percent = prev.total === 0 ? 0 : Math.min(100, Math.round((processed / prev.total) * 100));
              return {
                ...prev,
                current: Math.min(processed, prev.total),
                percent
              };
            });
          };

          let importResults;

          switch (activeTab) {
            case 'users':
              importResults = await processUsersImport(jsonData, updateProgress);
              break;
            case 'customers':
              importResults = await processCustomersImport(jsonData, updateProgress);
              break;
            case 'services':
              importResults = await processServicesImport(jsonData, updateProgress);
              break;
            case 'materials':
              importResults = await processMaterialsImport(jsonData, updateProgress);
              break;
            default:
              toast.error('Invalid import type');
              setIsLoading(false);
              setImportProgress(null);
              return;
          }

          updateProgress(totalRows);

          setResults(importResults);
          
          if (importResults.failed === 0 && importResults.errors.length === 0) {
            toast.success(`Import complete: ${importResults.successful} ${activeTab} imported successfully!`);
          } else {
            toast.success(`Import complete: ${importResults.successful} successful, ${importResults.failed} failed. Check errors below.`);
          }
          setHasImportedCurrentFile(true);
        } catch (error) {
          console.error('Error processing file:', error);
          toast.error('Failed to process file: ' + error.message);
        } finally {
          setIsLoading(false);
          setHasImportedCurrentFile(true);
          setTimeout(() => setImportProgress(null), 600);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('Error reading file:', error);
      toast.error('Failed to read file');
      setIsLoading(false);
      setImportProgress(null);
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
            'Invalid role values default to field_tech',
            'Role options: admin, supervisor, field_tech, technician',
            'Duplicate emails in the file or existing invitations are skipped automatically'
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
            'emailConsent should be "true" or "false"',
            'Duplicate customers (email or name + ZIP) are skipped automatically'
          ]
        };
      case 'services':
        return {
          title: 'Services Import Format',
          required: ['Service Name'],
          optional: ['Category', 'Description', 'Base Price'],
          notes: [
            'Service names must be unique per company; duplicates are skipped automatically',
            'Category values are optional but will be added to your company’s service categories when provided',
            'Base price is stored for reference but can be adjusted later in company settings'
          ]
        };
      case 'materials':
        return {
          title: 'Materials Import Format',
          required: ['Material Name', 'Category Name', 'Unit', 'Retail Price'],
          optional: [
            'Service Description',
            'Subcategory',
            'Cost Per Unit',
            'Supplier',
            'Supplier SKU',
            'Reorder Threshold',
            'Quantity In Stock',
            'Storage Location',
            'Active',
            'Taxable',
            'Internal Notes',
            'Default Markup %'
          ],
          notes: [
            'Material names must be unique per company; duplicates are skipped automatically',
            'Numerical fields such as cost, price, reorder threshold, and quantity are parsed as numbers',
            'Active column accepts true/false, yes/no, or 1/0',
            'Taxable column accepts true/false, yes/no, or 1/0',
            'Custom fields like Supplier SKU, Internal Notes, and Default Markup % are optional but stored when provided'
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
    setImportProgress(null);
    setHasImportedCurrentFile(false);
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
            <button
              onClick={() => {
                setActiveTab('materials');
                resetImport();
              }}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'materials'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <WrenchScrewdriverIcon className="w-5 h-5" />
              Materials
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
              <GridComponent
                id="bulkPreviewGrid"
                dataSource={preview.rows.map((row, index) => ({
                  rowNumber: index + 2,
                  ...row
                }))}
                allowPaging
                allowSorting
                allowFiltering
                allowSelection
                allowExcelExport
                filterSettings={previewFilterSettings}
                toolbar={previewToolbarOptions}
                toolbarClick={(args) => {
                  if (!previewGridRef.current) return;
                  if ((args.item?.id || '').includes('_excelexport')) {
                    previewGridRef.current.excelExport({
                      fileName: `import-preview-${activeTab}-${new Date().toISOString().split('T')[0]}.xlsx`
                    });
                  }
                }}
                selectionSettings={{ type: 'Single' }}
                pageSettings={previewPageSettings}
                height="280"
                ref={previewGridRef}
                noRecordsTemplate={() => (
                  <div className="py-6 text-center text-xs text-gray-500">
                    No preview data available.
                  </div>
                )}
              >
                <ColumnsDirective>
                  <ColumnDirective field="rowNumber" headerText="Row #" width="90" />
                  {preview.headers.map((header) => (
                    <ColumnDirective key={header} field={header} headerText={header} width="160" />
                  ))}
                </ColumnsDirective>
                <Inject services={[Page, Toolbar, Sort, Filter, ExcelExport, Selection, Search, Resize]} />
              </GridComponent>
            </div>
          )}

          {importProgress && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                <span>{importProgress.label}</span>
                <span>{importProgress.percent ?? 0}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 transition-all duration-200"
                  style={{ width: `${importProgress.percent ?? 0}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {importProgress.current ?? 0} of {importProgress.total ?? 0} rows processed
              </p>
            </div>
          )}

          <button
            onClick={processFile}
            disabled={!file || isLoading || hasImportedCurrentFile}
            className="mt-6 w-full px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Processing...' : `Import ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`}
          </button>
          {hasImportedCurrentFile && (
            <p className="mt-2 text-xs text-gray-500 text-center">
              Select a new file to run another import.
            </p>
          )}
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
