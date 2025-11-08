import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import CompanyService from '../services/companyService';
import MaterialsService from '../services/materialsService';
import StorageService from '../services/storageService';
import { useDropzone } from 'react-dropzone';
import { SERVICE_CATEGORIES } from '../constants/serviceCategories';
import { getDefaultMaterialsForCategories } from '../constants/defaultMaterials';
import * as XLSX from 'xlsx';
import { 
  BuildingOfficeIcon, 
  CheckCircleIcon,
  UserGroupIcon,
  CogIcon,
  DocumentTextIcon,
  PhotoIcon,
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  XCircleIcon,
  EyeIcon,
  ExclamationTriangleIcon,
  WrenchScrewdriverIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  MagnifyingGlassIcon,
  PencilIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const CompanySetupPage = () => {
  const { userProfile, updateUserProfile, isSuperAdmin, currentUser } = useAuth();
  const { getEffectiveCompanyId } = useCompany();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [company, setCompany] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  
  // Super admin company management states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showCompanyList, setShowCompanyList] = useState(false);
  const [allCompanies, setAllCompanies] = useState([]);
  const [newCompanyData, setNewCompanyData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    ownerEmail: '',
    description: '',
    serviceCategories: [],
    services: []
  });

  // Form states
  const [companyData, setCompanyData] = useState({
    name: '',
    description: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    phone: '',
    email: '',
    website: '',
    contactLink: '',
    logo: '',
    primaryColor: '#10b981',
    secondaryColor: '#6b7280'
  });

  const [serviceCategories, setServiceCategories] = useState([]); // For category selection
  const [selectedServices, setSelectedServices] = useState([]); // For individual service selection (matches mobile app)
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('technician');
  const [logoUploading, setLogoUploading] = useState(false);
  
  // Materials state
  const [materials, setMaterials] = useState([]);
  const [filteredMaterials, setFilteredMaterials] = useState([]);
  const [materialsSearchTerm, setMaterialsSearchTerm] = useState('');
  const [materialsCategoryFilter, setMaterialsCategoryFilter] = useState('all');
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showMaterialImportModal, setShowMaterialImportModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [materialData, setMaterialData] = useState({
    name: '',
    description: '',
    category: '',
    subcategory: '',
    unit: '',
    costPerUnit: 0,
    retailPrice: 0,
    supplier: '',
    reorderThreshold: 0,
    quantityInStock: 0,
    storageLocation: '',
    imageUrl: '',
    barcode: '',
    expirationDate: null,
    active: true
  });

  const steps = [
    { id: 1, name: 'Basic Info', icon: BuildingOfficeIcon },
    { id: 2, name: 'Services', icon: CogIcon },
    { id: 3, name: 'Materials', icon: WrenchScrewdriverIcon },
    { id: 4, name: 'Team', icon: UserGroupIcon },
    { id: 5, name: 'Branding', icon: PhotoIcon },
    { id: 6, name: 'Templates', icon: DocumentTextIcon }
  ];

  const getRoleLabel = useCallback((role, roleDisplay) => {
    if (roleDisplay) {
      return roleDisplay;
    }

    const labels = {
      admin: 'Admin',
      supervisor: 'Supervisor',
      field_tech: 'Field Technician',
      technician: 'Technician',
      manager: 'Manager'
    };

    return labels[role] || role;
  }, []);

  useEffect(() => {
    // IMPORTANT: Only load company data if user is verified
    // This prevents unverified users from accessing company setup
    if (!currentUser) return;
    
    // Check if user is verified (super admin bypasses check)
    const isSuperAdminUser = currentUser?.email === 'sroy@worksidesoftware.com';
    if (!isSuperAdminUser && !currentUser.emailVerified) {
      // User is not verified, don't load company data
      return;
    }
    
    loadCompanyData();
    
    // Check for pending company data from signup
    const pendingCompanyData = localStorage.getItem('pendingCompanyData');
    if (pendingCompanyData && !company?.id) {
      try {
        const companyData = JSON.parse(pendingCompanyData);
        // Pre-fill company data from signup
        setCompanyData(prev => ({
          ...prev,
          name: companyData.name || prev.name,
          phone: companyData.phone || prev.phone,
          address: companyData.address || prev.address,
          city: companyData.city || prev.city,
          state: companyData.state || prev.state,
          zipCode: companyData.zipCode || prev.zipCode,
          email: companyData.email || prev.email
        }));
        
        // Clear the pending data after using it
        localStorage.removeItem('pendingCompanyData');
      } catch (error) {
        console.error('Error parsing pending company data:', error);
      }
    }
  }, [currentUser, isSuperAdmin]);

  // Load materials when on materials step
  useEffect(() => {
    if (currentStep === 3) {
      loadMaterials();
    }
  }, [currentStep, company?.id, getEffectiveCompanyId]);

  // Filter materials
  useEffect(() => {
    if (currentStep === 3) {
      filterMaterials();
    }
  }, [materials, materialsSearchTerm, materialsCategoryFilter]);

  const resetNewCompanyForm = () => {
    setNewCompanyData({
      name: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      ownerEmail: '',
      description: '',
      serviceCategories: [],
      services: []
    });
    setCurrentStep(1);
  };

  const loadAllCompanies = async () => {
    setIsLoading(true);
    try {
      const result = await CompanyService.getAllCompanies();
      if (result.success) {
        setAllCompanies(result.companies || []);
        if (result.companies && result.companies.length === 0) {
          // Only log if actually no companies found
          console.log('No companies found');
        }
      } else {
        console.error('Error loading companies:', result.error);
        toast.error(result.error || 'Failed to load companies');
        setAllCompanies([]);
      }
    } catch (error) {
      console.error('Error loading companies:', error);
      toast.error('Failed to load companies: ' + error.message);
      setAllCompanies([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCompanyConfirm = async () => {
    if (!newCompanyData.name || !newCompanyData.ownerEmail) {
      toast.error('Please fill in company name and owner email');
      return;
    }

    setIsLoading(true);
    try {
      const result = await CompanyService.createCompanyForUser(
        {
          name: newCompanyData.name,
          description: newCompanyData.description,
          address: newCompanyData.address,
          city: newCompanyData.city,
          state: newCompanyData.state,
          zipCode: newCompanyData.zipCode,
          phone: newCompanyData.phone,
          email: newCompanyData.email,
          serviceCategories: newCompanyData.serviceCategories,
          services: newCompanyData.services,
        },
        newCompanyData.ownerEmail
      );

      if (result.success) {
        toast.success(`Company created successfully! Company code: ${result.companyCode}`);
        setShowCreateModal(false);
        setShowConfirmModal(false);
        resetNewCompanyForm();
        loadAllCompanies();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error creating company:', error);
      toast.error('Failed to create company');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCompany = async (companyId) => {
    if (!window.confirm('Are you sure you want to delete this company? This action cannot be undone.')) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await CompanyService.deleteCompany(companyId);
      if (result.success) {
        toast.success(result.message);
        loadAllCompanies();
        if (company && company.id === companyId) {
          // If deleting current company, reload
          window.location.reload();
        }
      } else {
        if (result.history) {
          toast.error(`${result.error} History: ${result.history.customers} customers, ${result.history.jobs} jobs, ${result.history.estimates} estimates, ${result.history.invoices} invoices`);
          toast.info('Use "Deactivate" instead to disable the company while preserving data');
        } else {
          toast.error(result.error);
        }
      }
    } catch (error) {
      console.error('Error deleting company:', error);
      toast.error('Failed to delete company');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeactivateCompany = async (companyId, isActive) => {
    const action = isActive ? 'activate' : 'deactivate';
    if (!window.confirm(`Are you sure you want to ${action} this company?`)) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await CompanyService.deactivateCompany(companyId, isActive);
      if (result.success) {
        toast.success(result.message);
        loadAllCompanies();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error deactivating company:', error);
      toast.error('Failed to deactivate company');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCompanyData = async () => {
    if (!userProfile?.companyId) return;
    
    setIsLoading(true);
    try {
      const result = await CompanyService.getCompany(userProfile.companyId);
      if (result.success && !result.company.isAdminCompany && !result.company.isProtected) {
        setCompany(result.company);
        setCompanyData({
          name: result.company.name || '',
          description: result.company.description || '',
          address: result.company.address || '',
          city: result.company.city || '',
          state: result.company.state || '',
          zipCode: result.company.zipCode || '',
          phone: result.company.phone || '',
          email: result.company.email || '',
          website: result.company.website || '',
          contactLink: result.company.contactLink || '',
          logo: result.company.logo || '',
          primaryColor: result.company.primaryColor || '#10b981',
          secondaryColor: result.company.secondaryColor || '#6b7280'
        });
        setServiceCategories(result.company.serviceCategories || []);
        // Load individual services from company (matches mobile app structure)
        // Mobile app stores services as an array of service strings
        // Also check user profile services (mobile app stores them there)
        const userServices = userProfile?.services || [];
        const companyServices = result.company.services || [];
        setSelectedServices(companyServices.length > 0 ? companyServices : userServices);
        
        // Load team members
        const teamResult = await CompanyService.getTeamMembers(userProfile.companyId);
        if (teamResult.success) {
          setTeamMembers(teamResult.teamMembers);
        }
      }
    } catch (error) {
      console.error('Error loading company data:', error);
    }
    setIsLoading(false);
  };

  const handleInputChange = (field, value) => {
    setCompanyData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSaveCompany = async () => {
    setIsLoading(true);
    try {
      let result;
      const dataToSave = {
        ...companyData,
        serviceCategories: serviceCategories, // Category names for filtering/display
        services: selectedServices // Individual services (matches mobile app)
      };
      
      if (company) {
        // Update existing company
        result = await CompanyService.updateCompany(company.id, dataToSave);
      } else {
        // Create new company
        result = await CompanyService.createCompany(dataToSave);
        if (result.success) {
          await updateUserProfile({ companyId: result.companyId });
        }
      }

      if (result.success) {
        // Reload company to get the updated data with all fields
        const reloadResult = await CompanyService.getCompany(company ? company.id : result.companyId);
        if (reloadResult.success) {
          setCompany(reloadResult.company);
          // Update selectedServices from the reloaded company data
          setSelectedServices(reloadResult.company.services || []);
        } else {
          setCompany(result.company);
        }
        toast.success(company ? 'Company updated successfully!' : 'Company created successfully!');
      } else {
        console.error('Save failed:', result.error);
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error saving company:', error);
      toast.error('Error saving company');
    }
    setIsLoading(false);
  };


  const handleAddTeamMember = async () => {
    if (!newMemberEmail.trim() || !company) return;
    
    setIsLoading(true);
    try {
      const result = await CompanyService.addTeamMember(company.id, newMemberEmail, newMemberRole);
      if (result.success) {
        setTeamMembers(prev => [...prev, result.teamMember]);
        setNewMemberEmail('');
        if (result.emailSent) {
          toast.success('Team member invited and email sent successfully!');
        } else {
          toast.success('Team member invited, but email could not be sent. Share the invitation code manually.');
        }
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error adding team member:', error);
      toast.error('Error adding team member');
    }
    setIsLoading(false);
  };

  const handleResendTeamMemberInvite = async (memberId) => {
    setIsLoading(true);
    try {
      const result = await CompanyService.resendTeamMemberInvite(memberId);
      if (result.success) {
        setTeamMembers(prev => prev.map(member => (
          member.id === memberId ? { ...member, ...result.teamMember } : member
        )));

        if (result.emailSent) {
          toast.success('Invitation email resent successfully!');
        } else {
          toast.success('Invitation refreshed. Share the code manually if needed.');
        }
      } else {
        toast.error(result.error || 'Failed to resend invitation');
      }
    } catch (error) {
      console.error('Error resending team member invite:', error);
      toast.error('Error resending invitation');
    }
    setIsLoading(false);
  };

  const handleRemoveTeamMember = async (memberId) => {
    setIsLoading(true);
    try {
      const result = await CompanyService.removeTeamMember(memberId);
      if (result.success) {
        setTeamMembers(prev => prev.filter(member => member.id !== memberId));
        toast.success('Team member removed successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error removing team member:', error);
      toast.error('Error removing team member');
    }
    setIsLoading(false);
  };

  const nextStep = async () => {
    // Auto-save services when leaving the Services step (step 2)
    if (currentStep === 2 && company) {
      try {
        const result = await CompanyService.updateCompany(company.id, {
          services: selectedServices,
          serviceCategories: serviceCategories
        });
        if (result.success) {
          toast.success('Services saved automatically');
        } else {
          console.error('Auto-save failed:', result.error);
          toast.error('Failed to save services: ' + result.error);
        }
      } catch (error) {
        console.error('Error auto-saving services:', error);
        toast.error('Error saving services: ' + error.message);
        // Don't block navigation if auto-save fails
      }
    }
    
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = async () => {
    // Auto-save services when leaving the Services step (step 2)
    if (currentStep === 2 && company) {
      try {
        const result = await CompanyService.updateCompany(company.id, {
          services: selectedServices,
          serviceCategories: serviceCategories
        });
        if (result.success) {
          toast.success('Services saved automatically');
        } else {
          console.error('Auto-save failed:', result.error);
          toast.error('Failed to save services: ' + result.error);
        }
      } catch (error) {
        console.error('Error auto-saving services:', error);
        toast.error('Error saving services: ' + error.message);
        // Don't block navigation if auto-save fails
      }
    }
    
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Materials functions
  const loadMaterials = async () => {
    const companyId = company?.id || getEffectiveCompanyId();
    if (!companyId) {
      setMaterials([]);
      return;
    }

    setIsLoading(true);
    try {
      const result = await MaterialsService.getMaterials(companyId, userProfile);
      if (result.success) {
        setMaterials(result.materials || []);
      } else {
        toast.error(result.error || 'Failed to load materials');
        setMaterials([]);
      }
    } catch (error) {
      console.error('Error loading materials:', error);
      toast.error('Error loading materials');
      setMaterials([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filterMaterials = () => {
    let filtered = [...materials];

    // Apply search filter
    if (materialsSearchTerm) {
      const searchLower = materialsSearchTerm.toLowerCase();
      filtered = filtered.filter(m => 
        m.name?.toLowerCase().includes(searchLower) ||
        m.description?.toLowerCase().includes(searchLower) ||
        m.category?.toLowerCase().includes(searchLower) ||
        m.supplier?.toLowerCase().includes(searchLower)
      );
    }

    // Apply category filter
    if (materialsCategoryFilter !== 'all') {
      filtered = filtered.filter(m => m.category === materialsCategoryFilter);
    }

    setFilteredMaterials(filtered);
  };

  const resetMaterialForm = () => {
    setMaterialData({
      name: '',
      description: '',
      category: '',
      subcategory: '',
      unit: '',
      costPerUnit: 0,
      retailPrice: 0,
      supplier: '',
      reorderThreshold: 0,
      quantityInStock: 0,
      storageLocation: '',
      imageUrl: '',
      barcode: '',
      expirationDate: null,
      active: true
    });
    setSelectedMaterial(null);
  };

  const handleMaterialInputChange = (field, value) => {
    setMaterialData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleOpenMaterialModal = (material = null) => {
    if (material) {
      setSelectedMaterial(material);
      setMaterialData({
        name: material.name || '',
        description: material.description || '',
        category: material.category || '',
        subcategory: material.subcategory || '',
        unit: material.unit || '',
        costPerUnit: material.costPerUnit || 0,
        retailPrice: material.retailPrice || 0,
        supplier: material.supplier || '',
        reorderThreshold: material.reorderThreshold || 0,
        quantityInStock: material.quantityInStock || 0,
        storageLocation: material.storageLocation || '',
        imageUrl: material.imageUrl || '',
        barcode: material.barcode || '',
        expirationDate: material.expirationDate || null,
        active: material.active !== undefined ? material.active : true
      });
    } else {
      resetMaterialForm();
    }
    setShowMaterialModal(true);
  };

  const handleSaveMaterial = async () => {
    // Validate required fields
    if (!materialData.name || !materialData.category || !materialData.unit || !materialData.retailPrice) {
      toast.error('Please fill in all required fields (Name, Category, Unit, Retail Price)');
      return;
    }

    const companyId = company?.id || getEffectiveCompanyId();
    if (!companyId) {
      toast.error('Company ID is required');
      return;
    }

    setIsLoading(true);
    try {
      let result;
      if (selectedMaterial) {
        result = await MaterialsService.updateMaterial(selectedMaterial.id, materialData);
      } else {
        result = await MaterialsService.createMaterial(materialData, companyId);
      }

      if (result.success) {
        toast.success(selectedMaterial ? 'Material updated successfully!' : 'Material created successfully!');
        setShowMaterialModal(false);
        resetMaterialForm();
        loadMaterials();
      } else {
        toast.error(result.error || 'Failed to save material');
      }
    } catch (error) {
      console.error('Error saving material:', error);
      toast.error('Error saving material');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMaterial = async (materialId) => {
    if (!window.confirm('Are you sure you want to delete this material? It cannot be deleted if it has been used in jobs.')) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await MaterialsService.deleteMaterial(materialId);
      if (result.success) {
        toast.success('Material deleted successfully!');
        loadMaterials();
      } else {
        toast.error(result.error || 'Failed to delete material');
      }
    } catch (error) {
      console.error('Error deleting material:', error);
      toast.error('Error deleting material');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadMaterialTemplate = () => {
    const template = [
      {
        'Name': 'Chlorine Tablets',
        'Description': '3-inch stabilized chlorine tablets',
        'Category': 'Pool Chemicals',
        'Subcategory': '',
        'Unit': 'bucket (50 lbs)',
        'CostPerUnit': 85.00,
        'RetailPrice': 125.00,
        'Supplier': 'PoolSupplyCo',
        'Active': true
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Materials');
    XLSX.writeFile(wb, 'materials_import_template.xlsx');
    toast.success('Template downloaded successfully!');
  };

  const handleMaterialImport = async (file) => {
    // Implementation will be added in next step
    toast.info('Material import functionality coming soon');
  };

  const handleImportDefaultMaterials = async () => {
    const companyId = company?.id || getEffectiveCompanyId();
    if (!companyId) {
      toast.error('Company ID is required');
      return;
    }

    if (!serviceCategories || serviceCategories.length === 0) {
      toast.error('Please select service categories first before importing default materials');
      return;
    }

    // Check if materials already exist
    if (materials.length > 0) {
      const confirmImport = window.confirm(
        `You already have ${materials.length} materials. Importing default materials will add new ones but won't duplicate existing materials by name. Continue?`
      );
      if (!confirmImport) {
        return;
      }
    }

    setIsLoading(true);
    try {
      // Get default materials for selected service categories
      const defaultMaterials = getDefaultMaterialsForCategories(serviceCategories);
      
      if (defaultMaterials.length === 0) {
        toast.info('No default materials found for your selected service categories');
        setIsLoading(false);
        return;
      }

      // Get existing material names to avoid duplicates
      const existingNames = new Set(materials.map(m => m.name.toLowerCase().trim()));

      // Import materials that don't already exist
      let importedCount = 0;
      let skippedCount = 0;

      for (const material of defaultMaterials) {
        // Check if material with same name already exists
        if (existingNames.has(material.name.toLowerCase().trim())) {
          skippedCount++;
          continue;
        }

        const result = await MaterialsService.createMaterial(material, companyId);
        if (result.success) {
          importedCount++;
        } else {
          console.warn(`Failed to import ${material.name}:`, result.error);
        }
      }

      // Reload materials
      await loadMaterials();

      if (importedCount > 0) {
        toast.success(`Successfully imported ${importedCount} default materials${skippedCount > 0 ? ` (${skippedCount} skipped - already exist)` : ''}`);
      } else if (skippedCount > 0) {
        toast.info(`All ${skippedCount} default materials already exist in your materials list`);
      } else {
        toast.error('Failed to import materials');
      }
    } catch (error) {
      console.error('Error importing default materials:', error);
      toast.error('Error importing default materials');
    } finally {
      setIsLoading(false);
    }
  };

  // Get unique categories from materials
  const getMaterialCategories = () => {
    const categories = new Set();
    materials.forEach(m => {
      if (m.category) {
        categories.add(m.category);
      }
    });
    return Array.from(categories).sort();
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Company Information</h3>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-bold text-gray-700">Company Name *</label>
                  <input
                    type="text"
                    value={companyData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="Enter company name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700">Phone Number</label>
                  <input
                    type="tel"
                    value={companyData.phone}
                    onChange={(e) => {
                      const formatted = formatPhoneNumber(e.target.value);
                      handleInputChange('phone', formatted);
                    }}
                    maxLength={14}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-bold text-gray-700">Description</label>
                  <textarea
                    value={companyData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="Brief description of your company and services"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700">Email</label>
                  <input
                    type="email"
                    value={companyData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="company@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700">Website</label>
                  <input
                    type="url"
                    value={companyData.website}
                    onChange={(e) => handleInputChange('website', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="https://www.example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700">
                    Contact Link
                    <span className="ml-2 text-xs text-gray-500 font-normal">
                      (Link shown in invoice emails)
                    </span>
                  </label>
                  <input
                    type="url"
                    value={companyData.contactLink}
                    onChange={(e) => handleInputChange('contactLink', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="https://www.example.com/contact or mailto:contact@example.com"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    This link will be prominently displayed in invoice emails. Use your contact page URL or a mailto link.
                  </p>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-bold text-gray-900 mb-4">Address</h4>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-bold text-gray-700">Street Address</label>
                  <input
                    type="text"
                    value={companyData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="123 Main Street"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700">City</label>
                  <input
                    type="text"
                    value={companyData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="Bakersfield"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700">State</label>
                  <input
                    type="text"
                    value={companyData.state}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="CA"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700">ZIP Code</label>
                  <input
                    type="text"
                    value={companyData.zipCode}
                    onChange={(e) => handleInputChange('zipCode', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="93311"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">Service Categories</h3>
              <p className="text-sm text-gray-600 mb-4">
                Select the service categories your company offers. These match the options available in the mobile app and will be used in estimates and job scheduling.
              </p>
              
              <div className="space-y-4">
                {SERVICE_CATEGORIES.map((category) => {
                  // Check if any services in this category are selected
                  const categoryServices = category.services;
                  const selectedServicesInCategory = categoryServices.filter(service => 
                    selectedServices.includes(service)
                  );
                  const isCategorySelected = selectedServicesInCategory.length > 0;
                  const allServicesSelected = selectedServicesInCategory.length === categoryServices.length;
                  
                  return (
                    <div key={category.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between bg-gray-50 px-4 py-3">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id={`category-${category.id}`}
                            checked={isCategorySelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                // Select all services in this category
                                setSelectedServices(prev => {
                                  const newServices = [...prev];
                                  categoryServices.forEach(service => {
                                    if (!newServices.includes(service)) {
                                      newServices.push(service);
                                    }
                                  });
                                  return newServices;
                                });
                                // Also update category list
                                if (!serviceCategories.includes(category.name)) {
                                  setServiceCategories(prev => [...prev, category.name]);
                                }
                              } else {
                                // Deselect all services in this category
                                setSelectedServices(prev => prev.filter(service => !categoryServices.includes(service)));
                                // Remove category from list
                                setServiceCategories(prev => prev.filter(cat => cat !== category.name));
                              }
                            }}
                            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                          />
                          <label
                            htmlFor={`category-${category.id}`}
                            className="ml-3 text-sm font-medium text-gray-900 cursor-pointer"
                          >
                            {category.name}
                          </label>
                        </div>
                        <span className="text-xs text-gray-500">
                          {selectedServicesInCategory.length > 0 
                            ? `${selectedServicesInCategory.length} of ${category.services.length} selected`
                            : `${category.services.length} services`
                          }
                        </span>
                      </div>
                      
                      {isCategorySelected && (
                        <div className="bg-white px-4 py-3 border-t border-gray-200">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {category.services.map((service, idx) => {
                              const isServiceSelected = selectedServices.includes(service);
                              return (
                                <div key={idx} className="flex items-center">
                                  <input
                                    type="checkbox"
                                    id={`service-${category.id}-${idx}`}
                                    checked={isServiceSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        // Add service
                                        setSelectedServices(prev => 
                                          prev.includes(service) ? prev : [...prev, service]
                                        );
                                        // Add category if not already added
                                        if (!serviceCategories.includes(category.name)) {
                                          setServiceCategories(prev => [...prev, category.name]);
                                        }
                                      } else {
                                        // Remove service
                                        setSelectedServices(prev => {
                                          const updated = prev.filter(s => s !== service);
                                          // Check if we should remove category
                                          const remainingServicesInCategory = updated.filter(s => 
                                            categoryServices.includes(s)
                                          );
                                          if (remainingServicesInCategory.length === 0) {
                                            setServiceCategories(prev => prev.filter(cat => cat !== category.name));
                                          }
                                          return updated;
                                        });
                                      }
                                    }}
                                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                  />
                                  <label
                                    htmlFor={`service-${category.id}-${idx}`}
                                    className="ml-2 text-sm text-gray-700 cursor-pointer"
                                  >
                                    {service}
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {serviceCategories.length === 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">
                      <strong>No service categories selected.</strong> Select at least one category to continue.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Materials Management</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Manage materials and products used by your technicians. These will be available for selection on jobs.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadMaterialTemplate}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 flex items-center gap-2"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    Template
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMaterialImportModal(true)}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 flex items-center gap-2"
                  >
                    <ArrowUpTrayIcon className="h-4 w-4" />
                    Import
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenMaterialModal()}
                    className="px-4 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center gap-2"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add Material
                  </button>
                </div>
              </div>

              {/* Import Default Materials Banner */}
              {materials.length === 0 && serviceCategories.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-blue-900 mb-1">
                        Quick Start: Import Default Materials
                      </h4>
                      <p className="text-sm text-blue-700 mb-3">
                        Based on your selected service categories ({serviceCategories.join(', ')}), we can automatically import a starter set of common materials. You can edit or remove them later.
                      </p>
                      <button
                        type="button"
                        onClick={handleImportDefaultMaterials}
                        disabled={isLoading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isLoading ? 'Importing...' : `Import Default Materials (${getDefaultMaterialsForCategories(serviceCategories).length} items)`}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Import Default Materials Button (when materials exist) */}
              {materials.length > 0 && serviceCategories.length > 0 && (
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={handleImportDefaultMaterials}
                    disabled={isLoading}
                    className="px-3 py-2 text-sm border border-primary-300 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowUpTrayIcon className="h-4 w-4" />
                    {isLoading ? 'Importing...' : `Import More Default Materials (${getDefaultMaterialsForCategories(serviceCategories).length} available)`}
                  </button>
                </div>
              )}

              {/* Search and Filter */}
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={materialsSearchTerm}
                      onChange={(e) => setMaterialsSearchTerm(e.target.value)}
                      placeholder="Search materials..."
                      className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    />
                  </div>
                </div>
                <select
                  value={materialsCategoryFilter}
                  onChange={(e) => setMaterialsCategoryFilter(e.target.value)}
                  className="rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                >
                  <option value="all">All Categories</option>
                  {getMaterialCategories().map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Materials Table */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cost/Unit</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Price/Unit</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {isLoading ? (
                        <tr>
                          <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                            <div className="flex justify-center">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
                            </div>
                          </td>
                        </tr>
                      ) : filteredMaterials.length === 0 ? (
                        <tr>
                          <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                            {materials.length === 0 ? 'No materials added yet. Click "Add Material" to get started.' : 'No materials match your search criteria.'}
                          </td>
                        </tr>
                      ) : (
                        filteredMaterials.map((material) => (
                          <tr key={material.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{material.name}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{material.category || '-'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{material.unit || '-'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">${(material.costPerUnit || 0).toFixed(2)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 text-right">${(material.retailPrice || 0).toFixed(2)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{material.supplier || '-'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-center">
                              {material.active ? (
                                <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Active</span>
                              ) : (
                                <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">Inactive</span>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                              <button
                                onClick={() => handleOpenMaterialModal(material)}
                                className="text-primary-600 hover:text-primary-900 mr-3"
                              >
                                <PencilIcon className="h-4 w-4 inline" />
                              </button>
                              <button
                                onClick={() => handleDeleteMaterial(material.id)}
                                className="text-red-600 hover:text-red-900"
                              >
                                <TrashIcon className="h-4 w-4 inline" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Team Members</h3>
              <p className="text-sm text-gray-600 mb-4">
                Invite team members to join your company. They'll be able to access jobs and customers.
              </p>
              
              <div className="bg-gray-50 p-4 rounded-lg mb-6">
                <div className="flex gap-2 mb-3">
                  <input
                    type="email"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="Enter email address"
                  />
                  <select
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                    className="rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  >
                    <option value="technician">Technician</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddTeamMember}
                    disabled={!newMemberEmail.trim() || isLoading}
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Invite
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {teamMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between bg-white border border-gray-200 px-4 py-3 rounded-md">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="h-8 w-8 bg-gray-300 rounded-full flex items-center justify-center">
                          <span className="text-gray-600 text-sm font-medium">
                            {member.email.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">{member.email}</p>
                        <p className="text-sm text-gray-500">{getRoleLabel(member.role, member.roleDisplay)}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        member.status === 'active' ? 'bg-green-100 text-green-800' :
                        member.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {member.status}
                      </span>
                      {member.invitationCode && (
                        <span className="px-2 py-1 text-xs font-medium text-gray-500 bg-gray-100 rounded-full">
                          Code: {member.invitationCode}
                        </span>
                      )}
                      {member.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => handleResendTeamMemberInvite(member.id)}
                          className="text-primary-600 hover:text-primary-800 text-sm"
                          disabled={isLoading}
                        >
                          Resend
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveTeamMember(member.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                
                {teamMembers.length === 0 && (
                  <p className="text-sm text-gray-500 italic">No team members added yet</p>
                )}
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Branding & Colors</h3>
              <p className="text-sm text-gray-600 mb-4">
                Customize your company's visual identity. These colors will be used in estimates and customer communications.
              </p>
              
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Primary Color</label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={companyData.primaryColor}
                      onChange={(e) => handleInputChange('primaryColor', e.target.value)}
                      className="h-10 w-20 rounded border-gray-300"
                    />
                    <input
                      type="text"
                      value={companyData.primaryColor}
                      onChange={(e) => handleInputChange('primaryColor', e.target.value)}
                      className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Secondary Color</label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={companyData.secondaryColor}
                      onChange={(e) => handleInputChange('secondaryColor', e.target.value)}
                      className="h-10 w-20 rounded border-gray-300"
                    />
                    <input
                      type="text"
                      value={companyData.secondaryColor}
                      onChange={(e) => handleInputChange('secondaryColor', e.target.value)}
                      className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Company Logo</label>
                <LogoUpload
                  logoUrl={companyData.logo}
                  onLogoUploaded={(url) => handleInputChange('logo', url)}
                  companyId={company?.id || userProfile?.companyId}
                  isUploading={logoUploading}
                  onUploadingChange={setLogoUploading}
                />
              </div>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Estimate Templates</h3>
              <p className="text-sm text-gray-600 mb-4">
                Configure default settings for your estimates and invoices.
              </p>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h4 className="text-sm font-medium text-yellow-800">
                      Coming Soon
                    </h4>
                    <div className="mt-2 text-sm text-yellow-700">
                      <p>
                        Estimate template configuration will include:
                      </p>
                      <ul className="mt-2 list-disc list-inside space-y-1">
                        <li>Default labor rates</li>
                        <li>Material markup percentages</li>
                        <li>Estimate validity periods</li>
                        <li>Terms and conditions</li>
                        <li>Payment terms</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (isLoading && !company) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <BuildingOfficeIcon className="h-8 w-8 text-primary-500 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Company Setup</h1>
              <p className="text-gray-600">
                {company ? 'Manage your company settings' : 'Set up your company profile'}
              </p>
            </div>
          </div>
          {isSuperAdmin && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowCompanyList(true);
                  loadAllCompanies();
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <EyeIcon className="w-4 h-4 inline mr-2" />
                View All Companies
              </button>
              <button
                onClick={() => {
                  resetNewCompanyForm();
                  setShowCreateModal(true);
                }}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
              >
                <PlusIcon className="w-4 h-4 inline mr-2" />
                Create New Company
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            
            return (
              <div key={step.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => setCurrentStep(step.id)}
                  className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
                    isCompleted 
                      ? 'bg-primary-500 border-primary-500 text-white hover:bg-primary-600' 
                      : isActive 
                      ? 'border-primary-500 text-primary-500 hover:bg-primary-50' 
                      : 'border-gray-300 text-gray-400 hover:border-gray-400'
                  }`}
                  title={`Go to ${step.name}`}
                >
                  {isCompleted ? (
                    <CheckCircleIcon className="w-6 h-6" />
                  ) : (
                    <Icon className="w-6 h-6" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(step.id)}
                  className={`ml-3 text-left ${
                    isActive ? 'text-primary-600' : isCompleted ? 'text-gray-900 hover:text-primary-600' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <p className={`text-sm font-medium transition-colors`}>
                    {step.name}
                  </p>
                </button>
                {index < steps.length - 1 && (
                  <div className={`ml-8 w-16 h-0.5 ${
                    isCompleted ? 'bg-primary-500' : 'bg-gray-300'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {renderStepContent()}
      </div>

      {/* Navigation */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between">
          <button
            type="button"
            onClick={prevStep}
            disabled={currentStep === 1}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={handleSaveCompany}
              disabled={isLoading}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
            
            {currentStep < steps.length && (
              <button
                type="button"
                onClick={nextStep}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Create New Company Modal (Super Admin) */}
      {showCreateModal && isSuperAdmin && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => {
              setShowCreateModal(false);
              setShowConfirmModal(false);
            }} />
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Create New Company</h3>
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setShowConfirmModal(false);
                    }}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>

                {!showConfirmModal ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Owner Email *</label>
                        <input
                          type="email"
                          value={newCompanyData.ownerEmail}
                          onChange={(e) => setNewCompanyData(prev => ({ ...prev, ownerEmail: e.target.value }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                          placeholder="owner@example.com"
                        />
                        <p className="mt-1 text-xs text-gray-500">User must already have an account</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Company Name *</label>
                        <input
                          type="text"
                          value={newCompanyData.name}
                          onChange={(e) => setNewCompanyData(prev => ({ ...prev, name: e.target.value }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                          placeholder="Company Name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Phone</label>
                        <input
                          type="tel"
                          value={newCompanyData.phone}
                          onChange={(e) => {
                            const formatted = formatPhoneNumber(e.target.value);
                            setNewCompanyData(prev => ({ ...prev, phone: formatted }));
                          }}
                          maxLength={14}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                          placeholder="(555) 123-4567"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <input
                          type="email"
                          value={newCompanyData.email}
                          onChange={(e) => setNewCompanyData(prev => ({ ...prev, email: e.target.value }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                          placeholder="company@example.com"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Description</label>
                        <textarea
                          value={newCompanyData.description}
                          onChange={(e) => setNewCompanyData(prev => ({ ...prev, description: e.target.value }))}
                          rows={2}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                          placeholder="Brief company description"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Street Address</label>
                        <input
                          type="text"
                          value={newCompanyData.address}
                          onChange={(e) => setNewCompanyData(prev => ({ ...prev, address: e.target.value }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                          placeholder="123 Main Street"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">City</label>
                        <input
                          type="text"
                          value={newCompanyData.city}
                          onChange={(e) => setNewCompanyData(prev => ({ ...prev, city: e.target.value }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                          placeholder="Bakersfield"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">State</label>
                        <input
                          type="text"
                          value={newCompanyData.state}
                          onChange={(e) => setNewCompanyData(prev => ({ ...prev, state: e.target.value }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                          placeholder="CA"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">ZIP Code</label>
                        <input
                          type="text"
                          value={newCompanyData.zipCode}
                          onChange={(e) => setNewCompanyData(prev => ({ ...prev, zipCode: e.target.value }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                          placeholder="93311"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-blue-900 mb-3">Company Summary</h4>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600">Company Name:</span>
                          <p className="font-medium text-gray-900">{newCompanyData.name}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Owner Email:</span>
                          <p className="font-medium text-gray-900">{newCompanyData.ownerEmail}</p>
                        </div>
                        {newCompanyData.phone && (
                          <div>
                            <span className="text-gray-600">Phone:</span>
                            <p className="font-medium text-gray-900">{newCompanyData.phone}</p>
                          </div>
                        )}
                        {newCompanyData.email && (
                          <div>
                            <span className="text-gray-600">Email:</span>
                            <p className="font-medium text-gray-900">{newCompanyData.email}</p>
                          </div>
                        )}
                        {newCompanyData.address && (
                          <div className="col-span-2">
                            <span className="text-gray-600">Address:</span>
                            <p className="font-medium text-gray-900">
                              {newCompanyData.address}, {newCompanyData.city}, {newCompanyData.state} {newCompanyData.zipCode}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">
                      This will create a new company and assign it to <strong>{newCompanyData.ownerEmail}</strong>. 
                      The owner will be set as admin and receive a company code to share with team members.
                    </p>
                  </div>
                )}

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setShowConfirmModal(false);
                      resetNewCompanyForm();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  {!showConfirmModal ? (
                    <button
                      onClick={() => {
                        if (!newCompanyData.name || !newCompanyData.ownerEmail) {
                          toast.error('Please fill in company name and owner email');
                          return;
                        }
                        setShowConfirmModal(true);
                      }}
                      className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
                    >
                      Continue to Review
                    </button>
                  ) : (
                    <button
                      onClick={handleCreateCompanyConfirm}
                      disabled={isLoading}
                      className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
                    >
                      {isLoading ? 'Creating...' : 'Create Company'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Company List Modal (Super Admin) */}
      {showCompanyList && isSuperAdmin && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowCompanyList(false)} />
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-6xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">All Companies</h3>
                  <button
                    onClick={() => setShowCompanyList(false)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>

                <div className="mt-4">
                  {allCompanies.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No companies found</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {allCompanies.map((comp) => (
                            <tr key={comp.id}>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-medium text-gray-900">{comp.name}</div>
                                  {(comp.isAdminCompany || comp.isProtected) && (
                                    <span 
                                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800"
                                      title="Protected administrative company - cannot be deleted or deactivated"
                                    >
                                      Protected
                                    </span>
                                  )}
                                </div>
                                {comp.email && (
                                  <div className="text-sm text-gray-500">{comp.email}</div>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{comp.ownerName || 'N/A'}</div>
                                <div className="text-sm text-gray-500">{comp.ownerEmail || ''}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">{comp.code}</code>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  comp.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  {comp.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {comp.createdAt ? new Date(comp.createdAt).toLocaleDateString() : 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex justify-end gap-2">
                                  {/* Deactivate/Activate button - disabled for protected companies */}
                                  {!(comp.isAdminCompany || comp.isProtected) ? (
                                    <button
                                      onClick={() => handleDeactivateCompany(comp.id, !comp.isActive)}
                                      className={`${
                                        comp.isActive 
                                          ? 'text-yellow-600 hover:text-yellow-900' 
                                          : 'text-green-600 hover:text-green-900'
                                      }`}
                                      title={comp.isActive ? 'Deactivate' : 'Activate'}
                                    >
                                      <XCircleIcon className="w-5 h-5" />
                                    </button>
                                  ) : (
                                    <span 
                                      className="text-gray-400 cursor-not-allowed" 
                                      title="Protected company - cannot be deactivated"
                                    >
                                      <XCircleIcon className="w-5 h-5" />
                                    </span>
                                  )}
                                  {/* Delete button - hidden for protected companies */}
                                  {!(comp.isAdminCompany || comp.isProtected) ? (
                                    <button
                                      onClick={() => handleDeleteCompany(comp.id)}
                                      className="text-red-600 hover:text-red-900"
                                      title="Delete"
                                    >
                                      <TrashIcon className="w-5 h-5" />
                                    </button>
                                  ) : (
                                    <span 
                                      className="text-gray-400 cursor-not-allowed" 
                                      title="Protected company - cannot be deleted"
                                    >
                                      <TrashIcon className="w-5 h-5" />
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Material Add/Edit Modal */}
      {showMaterialModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => {
              setShowMaterialModal(false);
              resetMaterialForm();
            }} />
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    {selectedMaterial ? 'Edit Material' : 'Add New Material'}
                  </h3>
                  <button
                    onClick={() => {
                      setShowMaterialModal(false);
                      resetMaterialForm();
                    }}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700">Name *</label>
                      <input
                        type="text"
                        value={materialData.name}
                        onChange={(e) => handleMaterialInputChange('name', e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="e.g., Chlorine Tablets"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700">Description</label>
                      <textarea
                        value={materialData.description}
                        onChange={(e) => handleMaterialInputChange('description', e.target.value)}
                        rows={2}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="Detailed notes for internal use"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Category *</label>
                      <input
                        type="text"
                        value={materialData.category}
                        onChange={(e) => handleMaterialInputChange('category', e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="e.g., Pool Chemicals"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Subcategory</label>
                      <input
                        type="text"
                        value={materialData.subcategory}
                        onChange={(e) => handleMaterialInputChange('subcategory', e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="e.g., Liquid"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Unit *</label>
                      <input
                        type="text"
                        value={materialData.unit}
                        onChange={(e) => handleMaterialInputChange('unit', e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="e.g., bucket (50 lbs)"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Retail Price per Unit *</label>
                      <input
                        type="number"
                        step="0.01"
                        value={materialData.retailPrice}
                        onChange={(e) => handleMaterialInputChange('retailPrice', parseFloat(e.target.value) || 0)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Cost per Unit</label>
                      <input
                        type="number"
                        step="0.01"
                        value={materialData.costPerUnit}
                        onChange={(e) => handleMaterialInputChange('costPerUnit', parseFloat(e.target.value) || 0)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Supplier</label>
                      <input
                        type="text"
                        value={materialData.supplier}
                        onChange={(e) => handleMaterialInputChange('supplier', e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="Preferred supplier/vendor"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Storage Location</label>
                      <input
                        type="text"
                        value={materialData.storageLocation}
                        onChange={(e) => handleMaterialInputChange('storageLocation', e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="Truck, warehouse, etc."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Barcode</label>
                      <input
                        type="text"
                        value={materialData.barcode}
                        onChange={(e) => handleMaterialInputChange('barcode', e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="Optional"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={materialData.active}
                          onChange={(e) => handleMaterialInputChange('active', e.target.checked)}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">Active (available for selection)</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMaterialModal(false);
                      resetMaterialForm();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveMaterial}
                    disabled={isLoading}
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? 'Saving...' : selectedMaterial ? 'Update' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

// Logo Upload Component
const LogoUpload = ({ logoUrl, onLogoUploaded, companyId, isUploading, onUploadingChange }) => {
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (logoUrl) {
      setPreview(logoUrl);
    }
  }, [logoUrl]);

  const onDrop = async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target.result);
    };
    reader.readAsDataURL(file);

    // Upload to Firebase Storage
    if (!companyId) {
      toast.error('Please save company information first');
      return;
    }

    onUploadingChange(true);
    try {
      const result = await StorageService.uploadCompanyLogo(file, companyId);
      if (result.success) {
        onLogoUploaded(result.url);
        toast.success('Logo uploaded successfully!');
      } else {
        toast.error(result.error || 'Failed to upload logo');
        setPreview(logoUrl); // Revert preview
      }
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Failed to upload logo');
      setPreview(logoUrl); // Revert preview
    } finally {
      onUploadingChange(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    },
    maxFiles: 1,
    disabled: isUploading || !companyId
  });

  const handleRemoveLogo = () => {
    setPreview(null);
    onLogoUploaded('');
    toast.success('Logo removed');
  };

  return (
    <div className="space-y-3">
      {/* Preview */}
      {(preview || logoUrl) && (
        <div className="flex items-center space-x-4">
          <div className="flex-shrink-0">
            <img 
              className="h-24 w-24 rounded-lg object-contain border border-gray-200 bg-white p-2" 
              src={preview || logoUrl} 
              alt="Company logo" 
            />
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-600">Current logo</p>
            {logoUrl && (
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="mt-2 text-sm text-red-600 hover:text-red-800 flex items-center gap-1"
              >
                <XMarkIcon className="h-4 w-4" />
                Remove logo
              </button>
            )}
          </div>
        </div>
      )}

      {/* Upload Area */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100'
        } ${isUploading || !companyId ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} />
        {isUploading ? (
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-2"></div>
            <p className="text-sm text-gray-600">Uploading logo...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <PhotoIcon className="h-10 w-10 text-gray-400 mb-2" />
            {isDragActive ? (
              <p className="text-sm text-primary-600 font-medium">Drop the image here</p>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  <span className="text-primary-600 font-medium">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  PNG, JPG, GIF, or WebP (max 5MB)
                </p>
              </>
            )}
          </div>
        )}
      </div>
      {!companyId && (
        <p className="text-xs text-amber-600">
          Please save basic company information first before uploading a logo.
        </p>
      )}
    </div>
  );
};

export default CompanySetupPage;
