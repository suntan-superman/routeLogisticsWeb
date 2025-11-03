import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import CompanyService from '../services/companyService';
import StorageService from '../services/storageService';
import { useDropzone } from 'react-dropzone';
import { SERVICE_CATEGORIES } from '../constants/serviceCategories';
import { 
  BuildingOfficeIcon, 
  CheckCircleIcon,
  UserGroupIcon,
  CogIcon,
  DocumentTextIcon,
  PhotoIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const CompanySetupPage = () => {
  const { userProfile, updateUserProfile } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [company, setCompany] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);

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

  const steps = [
    { id: 1, name: 'Basic Info', icon: BuildingOfficeIcon },
    { id: 2, name: 'Services', icon: CogIcon },
    { id: 3, name: 'Team', icon: UserGroupIcon },
    { id: 4, name: 'Branding', icon: PhotoIcon },
    { id: 5, name: 'Templates', icon: DocumentTextIcon }
  ];

  useEffect(() => {
    loadCompanyData();
  }, []);

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
        setCompany(result.company);
        toast.success(company ? 'Company updated successfully!' : 'Company created successfully!');
      } else {
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
        toast.success('Team member invited successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error adding team member:', error);
      toast.error('Error adding team member');
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

  const nextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
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
                  <label className="block text-sm font-medium text-gray-700">Company Name *</label>
                  <input
                    type="text"
                    value={companyData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="Enter company name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone Number</label>
                  <input
                    type="tel"
                    value={companyData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={companyData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="Brief description of your company and services"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    value={companyData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="company@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Website</label>
                  <input
                    type="url"
                    value={companyData.website}
                    onChange={(e) => handleInputChange('website', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="https://www.example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
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
              <h4 className="text-md font-medium text-gray-900 mb-4">Address</h4>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Street Address</label>
                  <input
                    type="text"
                    value={companyData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="123 Main Street"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">City</label>
                  <input
                    type="text"
                    value={companyData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="Bakersfield"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">State</label>
                  <input
                    type="text"
                    value={companyData.state}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="CA"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">ZIP Code</label>
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
              <h3 className="text-lg font-medium text-gray-900 mb-4">Service Categories</h3>
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
                        <p className="text-sm text-gray-500 capitalize">{member.role}</p>
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

      case 4:
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

      case 5:
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
        <div className="flex items-center">
          <BuildingOfficeIcon className="h-8 w-8 text-primary-500 mr-3" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Company Setup</h1>
            <p className="text-gray-600">
              {company ? 'Manage your company settings' : 'Set up your company profile'}
            </p>
          </div>
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
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  isCompleted 
                    ? 'bg-primary-500 border-primary-500 text-white' 
                    : isActive 
                    ? 'border-primary-500 text-primary-500' 
                    : 'border-gray-300 text-gray-400'
                }`}>
                  {isCompleted ? (
                    <CheckCircleIcon className="w-6 h-6" />
                  ) : (
                    <Icon className="w-6 h-6" />
                  )}
                </div>
                <div className="ml-3">
                  <p className={`text-sm font-medium ${
                    isActive ? 'text-primary-600' : isCompleted ? 'text-gray-900' : 'text-gray-500'
                  }`}>
                    {step.name}
                  </p>
                </div>
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
