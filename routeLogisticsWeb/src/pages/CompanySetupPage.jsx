import React, { useState, useEffect } from 'react';
import { motion as Motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import CompanyService from '../services/companyService';
import { getClaims } from '../services/tenancy';
import { 
  BuildingOfficeIcon, 
  CheckCircleIcon,
  UserGroupIcon,
  CogIcon,
  DocumentTextIcon,
  PhotoIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';
import { useConfirm } from '../components/ConfirmProvider';

const CompanySetupPage = () => {
  const { currentUser, updateUserProfile, refreshSession } = useAuth();
  const confirm = useConfirm();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [company, setCompany] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteDelivery, setInviteDelivery] = useState('');
  const [newOwnerId, setNewOwnerId] = useState('');

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
    logo: '',
    primaryColor: '#10b981',
    secondaryColor: '#6b7280',
    invoiceRemindersEnabled: false
  });

  const [serviceCategories, setServiceCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('technician');

  const steps = [
    { id: 1, name: 'Basic Info', icon: BuildingOfficeIcon },
    { id: 2, name: 'Services', icon: CogIcon },
    { id: 3, name: 'Team', icon: UserGroupIcon },
    { id: 4, name: 'Branding', icon: PhotoIcon },
    { id: 5, name: 'Templates', icon: DocumentTextIcon }
  ];

  const companyId = getClaims()?.companyId;
  const isOwner = !companyId || company?.ownerId === currentUser?.uid;

  useEffect(() => {
    loadCompanyData();
  }, [companyId]);

  const loadCompanyData = async () => {
    if (!companyId) return;
    
    setIsLoading(true);
    try {
      const result = await CompanyService.getCompany(companyId);
      if (result.success) {
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
          logo: result.company.logo || '',
          primaryColor: result.company.primaryColor || '#10b981',
          secondaryColor: result.company.secondaryColor || '#6b7280',
          invoiceRemindersEnabled: result.company.invoiceRemindersEnabled === true
        });
        setServiceCategories(result.company.serviceCategories || []);
        
        // Load team members
        const teamResult = await CompanyService.getTeamMembers(companyId);
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
      
      if (company) {
        // Update existing company
        result = await CompanyService.updateCompany(company.id, companyData);
      } else {
        // Create new company
        result = await CompanyService.createCompany(companyData);
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

  const handleAddServiceCategory = () => {
    if (newCategory.trim()) {
      setServiceCategories(prev => [...prev, newCategory.trim()]);
      setNewCategory('');
    }
  };

  const handleRemoveServiceCategory = (index) => {
    setServiceCategories(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddTeamMember = async () => {
    if (!newMemberEmail.trim() || !company) return;
    
    setIsLoading(true);
    try {
      const result = await CompanyService.addTeamMember(company.id, newMemberEmail, newMemberRole);
      if (result.success) {
        setTeamMembers(prev => [...prev.filter((m) => m.id !== result.teamMemberId), result.teamMember]);
        setInviteLink(result.inviteUrl);
        setInviteDelivery(result.deliveryStatus);
        setNewMemberEmail('');
        toast.success(result.deliveryStatus === 'queued' ? 'Invitation created and email queued. You can also copy the link.' : 'Invitation created. Copy the link to share it directly.');
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

  const updateMember = async (member, patch) => {
    setIsLoading(true);
    const result = await CompanyService.updateTeamMember(member.id, { role: member.role, status: member.status, ...patch });
    if (result.success) await loadCompanyData();
    else toast.error(result.error);
    setIsLoading(false);
  };
  const resendInvite = async (member) => {
    setIsLoading(true);
    const result = await CompanyService.addTeamMember(company.id, member.email, member.role);
    if (result.success) {
      setInviteLink(result.inviteUrl);
      setInviteDelivery(result.deliveryStatus);
      toast.success('New invitation created. The previous link has expired.');
      await loadCompanyData();
    } else toast.error(result.error);
    setIsLoading(false);
  };
  const transferOwnership = async () => {
    const member = teamMembers.find((m) => m.id === newOwnerId);
    if (!member || !(await confirm({ title: 'Transfer company ownership?', message: `${member.email} will own the company. You will remain an administrator.`, confirmText: 'Transfer ownership' }))) return;
    setIsLoading(true);
    try {
      await httpsCallable(functions, 'transferCompanyOwnership')({ companyId: company.id, memberId: newOwnerId });
      await refreshSession(); await loadCompanyData(); toast.success('Ownership transferred');
    } catch (error) { toast.error(error.message); }
    finally { setIsLoading(false); }
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
                Define the types of services your company offers. These will be used in estimates and job scheduling.
              </p>
              
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  placeholder="Add a service category (e.g., Pool Maintenance)"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddServiceCategory()}
                />
                <button
                  type="button"
                  onClick={handleAddServiceCategory}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  Add
                </button>
              </div>

              <div className="space-y-2">
                {serviceCategories.map((category, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-md">
                    <span className="text-sm text-gray-900">{category}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveServiceCategory(index)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                
                {serviceCategories.length === 0 && (
                  <p className="text-sm text-gray-500 italic">No service categories added yet</p>
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
              {isOwner && <div className="mb-5 rounded border p-3"><label className="block text-sm">Transfer ownership to an active administrator<select className="mt-2 block w-full rounded border-gray-300" value={newOwnerId} onChange={(e) => setNewOwnerId(e.target.value)}><option value="">Select administrator</option>{teamMembers.filter((m) => m.status === 'active' && m.role === 'admin').map((m) => <option key={m.id} value={m.id}>{m.email}</option>)}</select></label><button type="button" disabled={!newOwnerId || isLoading} onClick={transferOwnership} className="mt-2 text-sm text-primary-700 underline disabled:opacity-50">Transfer ownership</button></div>}
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
                        <select aria-label={`Role for ${member.email}`} value={member.role} disabled={isLoading || !isOwner} onChange={(e) => updateMember(member, { role: e.target.value })} className="mt-1 rounded border-gray-300 text-sm">
                          <option value="technician">Technician</option><option value="manager">Manager</option><option value="admin">Admin</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {isOwner && member.status !== 'active' && <button disabled={isLoading} type="button" className="text-primary-700 text-sm" onClick={() => resendInvite(member)}>Send new invite</button>}
                      {isOwner && member.status !== 'inactive' && <button disabled={isLoading} type="button" className="text-amber-700 text-sm" onClick={() => updateMember(member, { status: 'inactive' })}>Deactivate</button>}
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
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    {companyData.logo ? (
                      <img className="h-16 w-16 rounded-lg object-cover" src={companyData.logo} alt="Logo" />
                    ) : (
                      <div className="h-16 w-16 bg-gray-200 rounded-lg flex items-center justify-center">
                        <PhotoIcon className="h-8 w-8 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div>
                    <input
                      type="url"
                      value={companyData.logo}
                      onChange={(e) => handleInputChange('logo', e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      placeholder="Enter logo URL"
                    />
                    <p className="text-xs text-gray-500 mt-1">Enter a URL to your company logo</p>
                  </div>
                </div>
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

  if (company && !isOwner) return <div className="rounded-lg border bg-white p-6"><h1 className="text-2xl font-bold">{company.name}</h1><p className="mt-3">Company settings and invitations are managed by the owner.</p></div>;

  return (
    <Motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {company && isOwner && <label className="flex gap-3 rounded-lg border bg-white p-4"><input type="checkbox" checked={companyData.invoiceRemindersEnabled} onChange={(e) => handleInputChange('invoiceRemindersEnabled', e.target.checked)} />Send weekly overdue reminders to customers who have consented to invoice emails. Save company settings to apply.</label>}
      {/* Header */}
      {inviteLink && <div className="rounded-lg border border-green-200 bg-green-50 p-4"><p className="mb-2">{inviteDelivery === 'queued' ? 'Invitation email queued. You can also share this link directly:' : 'Email delivery is disabled. Copy this invitation link to share it directly:'}</p><input aria-label="Invitation link" readOnly value={inviteLink} onFocus={(e) => e.target.select()} className="w-full rounded border-gray-300" /><button type="button" className="mt-2 underline" onClick={async () => { try { await navigator.clipboard.writeText(inviteLink); toast.success('Link copied'); } catch { toast.error('Select and copy the link above.'); } }}>Copy invitation link</button></div>}
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
    </Motion.div>
  );
};

export default CompanySetupPage;
