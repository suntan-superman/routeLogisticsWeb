import SelectControl from '../components/SelectControl';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion as Motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import CompanyService from '../services/companyService';
import { getClaims } from '../services/tenancy';
import { 
  BuildingOfficeIcon, 
  UserGroupIcon,
  CogIcon,
  PhotoIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';
import { useConfirm } from '../components/ConfirmProvider';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import ServiceAreasSettings from '../components/ServiceAreasSettings';
import BillingSettingsPanel from '../components/BillingSettingsPanel';
import CompanyLogoField from '../components/CompanyLogoField';
import { useWorkspaceQuery } from '../hooks/useWorkspaceQuery';
import { workspaceAccessError } from '../services/workspaceQueryPolicy';
import { formatPhone, displayPhone } from '../utils/format';

const companyForm = (company = {}) => ({
  name: company.name || '', description: company.description || '', address: company.address || '', city: company.city || '', state: company.state || '', zipCode: company.zipCode || '',
  phone: displayPhone(company.phone), email: company.email || '', website: company.website || '', logo: company.logo || '', primaryColor: company.primaryColor || '#10b981', secondaryColor: company.secondaryColor || '#6b7280', invoiceRemindersEnabled: company.invoiceRemindersEnabled === true
});
const companySnapshot = (data, categories) => { const { logo, ...settings } = data; void logo; return JSON.stringify({ ...settings, serviceCategories: categories }); };

const CompanySetupPage = () => {
  const { currentUser, role } = useAuth();
  return <CompanySetupForm key={`${currentUser?.uid}:${getClaims()?.companyId}:${role}`} />;
};
const CompanySetupForm = () => {
  const { currentUser, updateUserProfile, refreshSession, role } = useAuth();
  const confirm = useConfirm();
  const [currentStep, setCurrentStep] = useState(() => {
    const tab = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('settings');
    return ({ company: 1, services: 2, team: 3, branding: 4, 'service-areas': 5, billing: 6 })[tab] || 1;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [company, setCompany] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteDelivery, setInviteDelivery] = useState('');
  const [newOwnerId, setNewOwnerId] = useState('');
  const [loadError, setLoadError] = useState('');
  const [savedCompany, setSavedCompany] = useState(() => companySnapshot(companyForm(), []));
  const alive = useRef(false), saving = useRef(false), dirtyRef = useRef(false), sectionRef = useRef(null), stickyHeaderRef = useRef(null), sectionFocusPending = useRef(false);

  // Form states
  const [companyData, setCompanyData] = useState(companyForm);

  const [serviceCategories, setServiceCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('technician');

  const steps = [
    { id: 1, name: 'Company', key: 'company', icon: BuildingOfficeIcon },
    { id: 2, name: 'Services', key: 'services', icon: CogIcon },
    { id: 3, name: 'Team', key: 'team', icon: UserGroupIcon },
    { id: 4, name: 'Branding', key: 'branding', icon: PhotoIcon },
    { id: 5, name: 'Service Areas', key: 'service-areas', icon: BuildingOfficeIcon },
    { id: 6, name: 'Billing & Reports', key: 'billing', icon: CogIcon }
  ];

  const companyId = getClaims()?.companyId;
  const isOwner = !companyId || company?.ownerId === currentUser?.uid;
  const companyDirty = companySnapshot(companyData, serviceCategories) !== savedCompany;
  dirtyRef.current = companyDirty;
  useUnsavedChanges(isOwner && (companyDirty || !!newCategory.trim()), { message: 'You have unsaved company settings. Leave without saving them?' });

  const companyQuery = useWorkspaceQuery(['company-settings', companyId], () => CompanyService.getCompany(companyId), { enabled: !!companyId, intervalMs: 60_000 });
  const teamQuery = useWorkspaceQuery(['team', 'settings'], () => CompanyService.getTeamMembers(companyId), { enabled: !!companyId && role === 'owner' });
  const refetchCompany = companyQuery.refetch, refetchTeam = teamQuery.refetch;
  const loadCompanyData = useCallback(async () => { await Promise.all([refetchCompany(), ...(role === 'owner' ? [refetchTeam()] : [])]); }, [refetchCompany, refetchTeam, role]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    if (!companyQuery.data) return;
    const next = companyQuery.data.company, values = companyForm(next), categories = next.serviceCategories || [];
    setCompany(next);
    // A background refresh must not move the baseline beneath an open editor.
    if (!dirtyRef.current) { setCompanyData(values); setServiceCategories(categories); setSavedCompany(companySnapshot(values, categories)); }
  }, [companyQuery.data]);
  useEffect(() => { if (teamQuery.data) setTeamMembers(teamQuery.data.teamMembers); }, [teamQuery.data]);
  useEffect(() => { setLoadError(companyQuery.error?.message || teamQuery.error?.message || ''); }, [companyQuery.error, teamQuery.error]);

  const handleInputChange = (field, value) => {
    setCompanyData(prev => ({
      ...prev,
      [field]: field === 'phone' ? formatPhone(value) : value
    }));
  };

  const handleSaveCompany = async () => {
    if (isLoading || saving.current || !companyDirty || !isOwner) return;
    saving.current = true;
    setIsLoading(true);
    const submitted = { ...companyData, serviceCategories: [...serviceCategories] };
    if (company) delete submitted.logo; // The logo has its own authorized save path.
    try {
      let result;
      
      if (company) {
        // Update existing company
        result = await CompanyService.updateCompany(company.id, submitted);
      } else {
        // Create new company
        result = await CompanyService.createCompany(submitted);
        if (result.success) {
          await updateUserProfile({ companyId: result.companyId });
        }
      }

      if (!alive.current) return;
      if (result.success) {
        setCompany(result.company);
        setSavedCompany(companySnapshot(companyForm(result.company || submitted), result.company?.serviceCategories || submitted.serviceCategories));
        if (companyId) companyQuery.setData({ success: true, company: result.company || { ...company, ...submitted } });
        toast.success(company ? 'Company updated successfully!' : 'Company created successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      if (alive.current) toast.error(error.message || 'Unable to save company settings. Your changes are still available to retry.');
    }
    finally { saving.current = false; if (alive.current) setIsLoading(false); }
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
        await loadCompanyData();
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
    if (isLoading || !(await confirm({ title: 'Remove team member?', message: 'This removes the member from the team and revokes company access. Their history is retained. Deactivate instead to keep a visible inactive entry.', confirmText: 'Remove member', danger: true }))) return;
    setIsLoading(true);
    try {
      const result = await CompanyService.removeTeamMember(memberId);
      if (result.success) {
        setTeamMembers(prev => prev.filter(member => member.id !== memberId));
        toast.success('Member removed; company access revoked.');
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

  const selectStep = step => {
    if (step < 1 || step > steps.length || step === currentStep) return;
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('settings', steps[step - 1].key);
      window.history.pushState({ ...window.history.state, companySettingsTab: step }, '', url);
    }
    setCurrentStep(step);
  };
  const nextStep = () => { sectionFocusPending.current = true; selectStep(currentStep + 1); };
  const prevStep = () => { sectionFocusPending.current = true; selectStep(currentStep - 1); };
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHistory = () => {
      const tab = new URLSearchParams(window.location.search).get('settings');
      sectionFocusPending.current = true;
      setCurrentStep(steps.find(step => step.key === tab)?.id || 1);
    };
    window.addEventListener('popstate', onHistory);
    return () => window.removeEventListener('popstate', onHistory);
  // Tab names are static for the lifetime of the page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (typeof requestAnimationFrame !== 'function') return;
    const frame = requestAnimationFrame(() => {
      const section = sectionRef.current;
      if (!section) return;
      section.scrollIntoView?.({ block: 'start', behavior: 'instant' });
      const headerBottom = stickyHeaderRef.current?.getBoundingClientRect?.().bottom;
      const sectionTop = section.getBoundingClientRect?.().top;
      if (Number.isFinite(headerBottom) && Number.isFinite(sectionTop) && typeof window !== 'undefined' && typeof window.scrollBy === 'function') {
        window.scrollBy({ top: sectionTop - headerBottom - 12, behavior: 'instant' });
      }
      if (sectionFocusPending.current) section.focus?.({ preventScroll: true });
      sectionFocusPending.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [currentStep]);
  const stepStatus = step => {
    const saved = JSON.parse(savedCompany);
    const changed = fields => fields.some(field => JSON.stringify(companyData[field]) !== JSON.stringify(saved[field]));
    if (step.id === 1 && changed(['name', 'description', 'address', 'city', 'state', 'zipCode', 'phone', 'email', 'website'])) return 'Unsaved changes';
    if (step.id === 2 && (newCategory.trim() || JSON.stringify(serviceCategories) !== JSON.stringify(saved.serviceCategories || []))) return 'Unsaved changes';
    if (step.id === 4 && changed(['primaryColor', 'secondaryColor'])) return 'Unsaved changes';
    if (step.id === 6 && changed(['invoiceRemindersEnabled'])) return 'Unsaved changes';
    if (step.id === 1) return companyData.name.trim() ? 'Complete' : 'Needs attention';
    if (step.id === 2) return serviceCategories.length ? 'Complete' : 'Needs attention';
    if (step.id === 3) return teamMembers.length ? `${teamMembers.length} members` : 'Optional';
    if (step.id === 4) return companyData.logo || company?.logo ? 'Complete' : 'Optional';
    return 'Optional';
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

              <p className="mb-3 text-sm text-gray-600">{teamMembers.length} team members · {teamMembers.filter((member) => member.status === 'pending').length} pending invitations</p>
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
              {isOwner && <div className="mb-5 rounded border p-3"><label className="block text-sm">Transfer ownership to an active administrator<SelectControl className="mt-2 block w-full rounded border-gray-300" value={newOwnerId} onChange={(e) => setNewOwnerId(e.target.value)}><option value="">Select administrator</option>{teamMembers.filter((m) => m.status === 'active' && m.role === 'admin').map((m) => <option key={m.id} value={m.id}>{m.email}</option>)}</SelectControl></label><button type="button" disabled={!newOwnerId || isLoading} onClick={transferOwnership} className="mt-2 text-sm text-primary-700 underline disabled:opacity-50">Transfer ownership</button></div>}
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
                  <SelectControl
                    aria-label="Invitation role"
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                    className="rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  >
                    <option value="technician">Technician</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </SelectControl>
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
                            {member.email?.charAt(0).toUpperCase() || '?'}
                          </span>
                        </div>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">{member.email}</p>
                        <SelectControl aria-label={`Role for ${member.email}`} value={member.role} disabled={isLoading || !isOwner} onChange={(e) => updateMember(member, { role: e.target.value })} className="mt-1 rounded border-gray-300 text-sm">
                          {!['technician', 'manager', 'admin'].includes(member.role) && <option value={member.role}>Select an RL role</option>}
                          <option value="technician">Technician</option><option value="manager">Manager</option><option value="admin">Admin</option>
                        </SelectControl>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {isOwner && member.status !== 'active' && <button disabled={isLoading || !['technician', 'manager', 'admin'].includes(member.role)} type="button" className="text-primary-700 text-sm disabled:opacity-50" onClick={() => resendInvite(member)}>Send new invite</button>}
                      {isOwner && member.status !== 'inactive' && <button disabled={isLoading} type="button" className="text-amber-700 text-sm" onClick={() => updateMember(member, { status: 'inactive' })}>Deactivate</button>}
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        member.status === 'active' ? 'bg-green-100 text-green-800' :
                        member.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {member.status === 'inactive' ? 'deactivated' : member.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTeamMember(member.id)}
                        disabled={isLoading || !isOwner}
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
                {company?.id ? <CompanyLogoField companyId={company.id} currentLogo={company.logo} onSaved={logo => setCompany(old => ({ ...old, logo }))} /> : <p className="text-sm text-gray-600">Save the company first, then upload its logo.</p>}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (workspaceAccessError(companyQuery.error) || workspaceAccessError(teamQuery.error)) return <p role="alert">{loadError || 'Your company access changed. Refresh access before continuing.'}</p>;
  if ((isLoading || (companyId && companyQuery.isPending && !companyQuery.error)) && !company) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (companyId && !company && loadError) return <section className="rounded border bg-white p-6"><p role="alert">{loadError}</p><button type="button" className="btn-secondary mt-3" onClick={loadCompanyData}>Retry company settings</button></section>;

  if (company && !isOwner) return <div className="space-y-6"><div className="rounded-lg border bg-white p-6"><h1 className="text-2xl font-bold">{company.businessName || company.name}</h1><p className="mt-3">{role === 'admin' ? 'Administrators can review validated company setup sections. Team invitations and ownership remain owner-managed.' : 'Company settings and invitations are managed by the owner.'}</p>{role === 'admin' && <a className="btn-primary mt-4 inline-flex" href="/company-setup/review">Review Company Setup</a>}</div>{['admin', 'manager'].includes(role) && <ServiceAreasSettings company={company} />}</div>;

  return (
    <Motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6 pb-24"
    >
      {/* Header */}
      {inviteLink && <div className="rounded-lg border border-green-200 bg-green-50 p-4"><p className="mb-2">{inviteDelivery === 'queued' ? 'Invitation email queued. You can also share this link directly:' : 'Email delivery is disabled. Copy this invitation link to share it directly:'}</p><input aria-label="Invitation link" readOnly value={inviteLink} onFocus={(e) => e.target.select()} className="w-full rounded border-gray-300" /><button type="button" className="mt-2 underline" onClick={async () => { try { await navigator.clipboard.writeText(inviteLink); toast.success('Link copied'); } catch { toast.error('Select and copy the link above.'); } }}>Copy invitation link</button></div>}
      <div ref={stickyHeaderRef} data-testid="company-settings-sticky-header" className="sticky top-16 z-30 space-y-2 bg-gray-50 pb-2">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center">
          <BuildingOfficeIcon className="h-8 w-8 text-primary-500 mr-3" />
          <div>
             <h1 className="text-2xl font-bold text-gray-900">Company Settings</h1>
            <p className="text-gray-600">
              {company ? 'Manage your company settings' : 'Set up your company profile'}
            </p>
          </div>
          </div>
          {company && <a className="btn-secondary" href="/company-setup/review">Review Company Setup</a>}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <nav aria-label="Company settings sections" className="flex flex-wrap gap-2" role="tablist">
          {steps.map((step) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            return (
              <button type="button" role="tab" id={`company-settings-tab-${step.key}`} key={step.id} aria-selected={isActive} aria-controls="company-settings-panel" tabIndex={isActive ? 0 : -1} onClick={() => selectStep(step.id)} onKeyDown={event => { const next = event.key === 'ArrowRight' ? step.id % steps.length + 1 : event.key === 'ArrowLeft' ? (step.id + steps.length - 2) % steps.length + 1 : event.key === 'Home' ? 1 : event.key === 'End' ? steps.length : null; if (next) { event.preventDefault(); selectStep(next); event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[next - 1]?.focus(); } }} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 ${isActive ? 'bg-primary-700 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
                <Icon className="h-4 w-4" /><span>{step.name}<small className="block font-normal opacity-80">{stepStatus(step)}</small></span>
              </button>
            );
          })}
        </nav>
      </div>
      </div>

      <div id="company-settings-panel" role="tabpanel" aria-labelledby={`company-settings-tab-${steps[currentStep - 1].key}`} ref={sectionRef} tabIndex={-1} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm focus:outline-none sm:p-6">
        {currentStep <= 4 && renderStepContent()}
        {company && isOwner && <div hidden={currentStep !== 5}><ServiceAreasSettings company={company} /></div>}
        {company && isOwner && <div hidden={currentStep !== 6} className="space-y-4"><label className="flex gap-3 rounded-lg border bg-white p-4"><input type="checkbox" checked={companyData.invoiceRemindersEnabled} onChange={(e) => handleInputChange('invoiceRemindersEnabled', e.target.checked)} />Send weekly overdue reminders to customers who have consented to invoice emails. Save company settings to apply.</label><BillingSettingsPanel /></div>}
        {!company && currentStep > 4 && <p>Save the company before configuring this section.</p>}
      </div>

      {/* Navigation */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={prevStep}
            disabled={currentStep === 1}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSaveCompany}
              disabled={isLoading || !companyDirty}
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
