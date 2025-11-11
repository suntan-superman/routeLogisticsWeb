import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import RecurringJobService from '../services/recurringJobService';
import CustomerService from '../services/customerService';
import CompanyService from '../services/companyService';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { SERVICE_CATEGORIES } from '../constants/serviceCategories';
import { 
  ArrowPathIcon, 
  PlusIcon,
  PencilIcon,
  TrashIcon,
  PlayIcon,
  StopIcon,
  CalendarIcon,
  ClockIcon,
  UserIcon,
  CogIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import {
  GridComponent,
  ColumnsDirective,
  ColumnDirective,
  Page,
  Toolbar,
  Sort,
  Filter,
  ExcelExport,
  Selection,
  Search,
  Resize,
  Inject
} from '@syncfusion/ej2-react-grids';

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'bi-weekly', label: 'Bi-Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'bi-monthly', label: 'Bi-Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' }
];

const DAY_OF_WEEK_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' }
];

const RecurringJobsPage = () => {
  const { userProfile, isSuperAdmin } = useAuth();
  const { getEffectiveCompanyId } = useCompany();
  const [recurringJobs, setRecurringJobs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [companyServices, setCompanyServices] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRecurringJob, setSelectedRecurringJob] = useState(null);
  
  const [formData, setFormData] = useState({
    customerId: '',
    customerName: '',
    serviceType: '',
    frequency: 'weekly',
    dayOfWeek: null,
    time: '09:00 AM',
    duration: '',
    estimatedCost: '',
    notes: '',
    startDate: '',
    endDate: '',
    isActive: true
  });

  const recurringGridRef = useRef(null);
  const recurringToolbarOptions = useMemo(() => ['Search', 'ExcelExport'], []);
  const recurringPageSettings = useMemo(() => ({ pageSize: 25, pageSizes: [25, 50, 100, 200] }), []);
  const recurringFilterSettings = useMemo(() => ({ type: 'Excel' }), []);

  useEffect(() => {
    loadRecurringJobs();
    loadCustomers();
    loadCompanyServices();
  }, [userProfile]);

  const loadRecurringJobs = async () => {
    setIsLoading(true);
    try {
      const companyId = getEffectiveCompanyId();
      const result = await RecurringJobService.getRecurringJobs(userProfile, companyId);
      if (result.success) {
        setRecurringJobs(result.recurringJobs);
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error loading recurring jobs:', error);
      toast.error('Error loading recurring jobs');
    }
    setIsLoading(false);
  };

  const loadCustomers = async () => {
    try {
      const companyId = getEffectiveCompanyId();
      const result = await CustomerService.getCustomers(100, null, {}, userProfile, companyId);
      if (result.success) {
        setCustomers(result.customers);
      }
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCustomerSelect = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    setFormData(prev => ({
      ...prev,
      customerId: customerId || '',
      customerName: customer ? customer.name : ''
    }));
  };

  const handleCreateRecurringJob = async () => {
    if (!formData.customerId || !formData.serviceType) {
      toast.error('Please select a customer and service type');
      return;
    }

    setIsLoading(true);
    try {
      const recurringJobData = {
        ...formData,
        startDate: formData.startDate ? new Date(formData.startDate).toISOString() : null,
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : null,
        dayOfWeek: formData.dayOfWeek !== null && formData.dayOfWeek !== '' ? parseInt(formData.dayOfWeek) : null
      };

      const result = await RecurringJobService.createRecurringJob(recurringJobData);
      
      if (result.success) {
        setShowCreateModal(false);
        resetForm();
        loadRecurringJobs();
        toast.success('Recurring job created successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error creating recurring job:', error);
      toast.error('Error creating recurring job');
    }
    setIsLoading(false);
  };

  const handleUpdateRecurringJob = async () => {
    if (!selectedRecurringJob) return;

    setIsLoading(true);
    try {
      const updates = {
        ...formData,
        startDate: formData.startDate ? new Date(formData.startDate).toISOString() : null,
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : null,
        dayOfWeek: formData.dayOfWeek !== null && formData.dayOfWeek !== '' ? parseInt(formData.dayOfWeek) : null
      };

      const result = await RecurringJobService.updateRecurringJob(selectedRecurringJob.id, updates);
      
      if (result.success) {
        setShowEditModal(false);
        setSelectedRecurringJob(null);
        resetForm();
        loadRecurringJobs();
        toast.success('Recurring job updated successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error updating recurring job:', error);
      toast.error('Error updating recurring job');
    }
    setIsLoading(false);
  };

  const handleDeleteRecurringJob = async (recurringJobId) => {
    if (!window.confirm('Are you sure you want to delete this recurring job? This will not delete existing scheduled jobs.')) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await RecurringJobService.deleteRecurringJob(recurringJobId);
      
      if (result.success) {
        loadRecurringJobs();
        toast.success('Recurring job deleted successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error deleting recurring job:', error);
      toast.error('Error deleting recurring job');
    }
    setIsLoading(false);
  };

  const handleToggleActive = async (recurringJobId, currentStatus) => {
    setIsLoading(true);
    try {
      const result = await RecurringJobService.toggleRecurringJobActive(recurringJobId, !currentStatus);
      
      if (result.success) {
        loadRecurringJobs();
        toast.success(`Recurring job ${!currentStatus ? 'activated' : 'deactivated'} successfully!`);
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error toggling recurring job status:', error);
      toast.error('Error updating recurring job status');
    }
    setIsLoading(false);
  };

  const openEditModal = (recurringJob) => {
    setSelectedRecurringJob(recurringJob);
    setFormData({
      customerId: recurringJob.customerId || '',
      customerName: recurringJob.customerName || '',
      serviceType: recurringJob.serviceType || '',
      frequency: recurringJob.frequency || 'weekly',
      dayOfWeek: recurringJob.dayOfWeek !== undefined ? recurringJob.dayOfWeek.toString() : '',
      time: recurringJob.time || '09:00 AM',
      duration: recurringJob.duration || '',
      estimatedCost: recurringJob.estimatedCost || '',
      notes: recurringJob.notes || '',
      startDate: recurringJob.startDate 
        ? (recurringJob.startDate.toDate ? recurringJob.startDate.toDate().toISOString().split('T')[0] : recurringJob.startDate.split('T')[0])
        : '',
      endDate: recurringJob.endDate 
        ? (recurringJob.endDate.toDate ? recurringJob.endDate.toDate().toISOString().split('T')[0] : recurringJob.endDate.split('T')[0])
        : '',
      isActive: recurringJob.isActive !== undefined ? recurringJob.isActive : true
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      customerId: '',
      customerName: '',
      serviceType: '',
      frequency: 'weekly',
      dayOfWeek: null,
      time: '09:00 AM',
      duration: '',
      estimatedCost: '',
      notes: '',
      startDate: '',
      endDate: '',
      isActive: true
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = dateString.toDate ? dateString.toDate() : new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      return dateString;
    }
  };

  const getFrequencyLabel = (frequency) => {
    const option = FREQUENCY_OPTIONS.find(opt => opt.value === frequency);
    return option ? option.label : frequency;
  };

  const handleRecurringToolbarClick = useCallback((args) => {
    if (!recurringGridRef.current) return;
    const id = args.item?.id || '';
    if (id.includes('_excelexport')) {
      recurringGridRef.current.excelExport({
        fileName: `recurring-jobs-${new Date().toISOString().split('T')[0]}.xlsx`
      });
    }
  }, []);

  const recurringCustomerTemplate = (props) => (
    <div className="flex items-center">
      <UserIcon className="h-5 w-5 text-gray-400 mr-2" />
      <div className="text-sm font-medium text-gray-900">{props.customerName || 'Unknown'}</div>
    </div>
  );

  const recurringServiceTemplate = (props) => (
    <div className="flex items-center">
      <CogIcon className="h-5 w-5 text-gray-400 mr-2" />
      <div className="text-sm text-gray-900">{props.serviceType || 'Service'}</div>
    </div>
  );

  const recurringFrequencyTemplate = (props) => {
    const frequencyLabel = getFrequencyLabel(props.frequency);
    const dayOfWeekLabel =
      props.dayOfWeek !== null && props.dayOfWeek !== undefined
        ? DAY_OF_WEEK_OPTIONS.find((d) => d.value === props.dayOfWeek)?.label
        : null;
    return (
      <div className="text-sm text-gray-800">
        {frequencyLabel}
        {dayOfWeekLabel && <span className="ml-1 text-xs text-gray-500">({dayOfWeekLabel})</span>}
      </div>
    );
  };

  const recurringScheduleTemplate = (props) => (
    <div className="text-sm text-gray-800">
      <div className="flex items-center">
        <ClockIcon className="h-4 w-4 mr-1" />
        {props.time || 'N/A'}
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {props.startDate ? `Starts: ${formatDate(props.startDate)}` : ''}
        {props.endDate ? ` | Ends: ${formatDate(props.endDate)}` : ''}
      </div>
    </div>
  );

  const recurringStatusTemplate = (props) => (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
        props.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
      }`}
    >
      {props.isActive ? 'Active' : 'Inactive'}
    </span>
  );

  const recurringActionsTemplate = (props) => (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => handleToggleActive(props.id, props.isActive)}
        className={props.isActive ? 'text-yellow-600 hover:text-yellow-900' : 'text-green-600 hover:text-green-900'}
        title={props.isActive ? 'Deactivate' : 'Activate'}
      >
        {props.isActive ? <StopIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
      </button>
      <button
        type="button"
        onClick={() => openEditModal(props)}
        className="text-primary-600 hover:text-primary-900"
        title="Edit"
      >
        <PencilIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => handleDeleteRecurringJob(props.id)}
        className="text-red-600 hover:text-red-900"
        title="Delete"
      >
        <TrashIcon className="h-5 w-5" />
      </button>
    </div>
  );

  const recurringNoRecordsTemplate = () => (
    <div className="p-8 text-center space-y-3">
      <ArrowPathIcon className="h-12 w-12 text-gray-400 mx-auto" />
      <p className="text-gray-500">No recurring jobs found</p>
      <button
        type="button"
        onClick={() => {
          resetForm();
          setShowCreateModal(true);
        }}
        className="mt-2 text-primary-600 hover:text-primary-700 font-medium"
      >
        Create your first recurring job
      </button>
    </div>
  );

  const loadCompanyServices = async () => {
    try {
      // Super admin can see all services
      if (isSuperAdmin) {
        setCompanyServices(SERVICE_CATEGORIES.flatMap(category => category.services));
        return;
      }

      // Get company services
      if (userProfile?.companyId) {
        const companyResult = await CompanyService.getCompany(userProfile.companyId);
        if (companyResult.success && !companyResult.company.isAdminCompany && !companyResult.company.isProtected) {
          if (companyResult.company.services) {
            setCompanyServices(companyResult.company.services);
          } else {
            // Fallback to all services if company has none set
            setCompanyServices(SERVICE_CATEGORIES.flatMap(category => category.services));
          }
        } else {
          // Admin company or no company - show empty
          setCompanyServices([]);
        }
      } else {
        // No company, show empty
        setCompanyServices([]);
      }
    } catch (error) {
      console.error('Error loading company services:', error);
      // Fallback to all services on error
      setCompanyServices(SERVICE_CATEGORIES.flatMap(category => category.services));
    }
  };

  const getAvailableServices = () => {
    // If company services are loaded, use them; otherwise fallback to all
    if (companyServices.length > 0) {
      return companyServices;
    }
    // Fallback for backwards compatibility
    return SERVICE_CATEGORIES.flatMap(category => category.services);
  };

  const renderModal = (isEdit = false) => {
    const availableServices = getAvailableServices();

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
          <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={() => {
            if (isEdit) {
              setShowEditModal(false);
              setSelectedRecurringJob(null);
            } else {
              setShowCreateModal(false);
            }
            resetForm();
          }}></div>
          
          <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {isEdit ? 'Edit Recurring Job' : 'Create Recurring Job'}
                </h3>
                <button
                  onClick={() => {
                    if (isEdit) {
                      setShowEditModal(false);
                      setSelectedRecurringJob(null);
                    } else {
                      setShowCreateModal(false);
                    }
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Customer *</label>
                  <select
                    value={formData.customerId}
                    onChange={(e) => handleCustomerSelect(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  >
                    <option value="">-- Select Customer --</option>
                    {customers.map(customer => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Service Type *</label>
                  <select
                    value={formData.serviceType}
                    onChange={(e) => handleInputChange('serviceType', e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  >
                    <option value="">-- Select Service --</option>
                    {availableServices.length > 0 ? (
                      availableServices.map((service, idx) => (
                        <option key={idx} value={service}>{service}</option>
                      ))
                    ) : (
                      <option disabled>No services configured. Please set up company services first.</option>
                    )}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Frequency *</label>
                    <select
                      value={formData.frequency}
                      onChange={(e) => handleInputChange('frequency', e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    >
                      {FREQUENCY_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  {formData.frequency !== 'daily' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Day of Week</label>
                      <select
                        value={formData.dayOfWeek || ''}
                        onChange={(e) => handleInputChange('dayOfWeek', e.target.value || null)}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      >
                        <option value="">Any Day</option>
                        {DAY_OF_WEEK_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                    <input
                      type="text"
                      value={formData.time}
                      onChange={(e) => handleInputChange('time', e.target.value)}
                      placeholder="09:00 AM"
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Duration (hours)</label>
                    <input
                      type="text"
                      value={formData.duration}
                      onChange={(e) => handleInputChange('duration', e.target.value)}
                      placeholder="2"
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => handleInputChange('startDate', e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">End Date (optional)</label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => handleInputChange('endDate', e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Estimated Cost (optional)</label>
                  <input
                    type="text"
                    value={formData.estimatedCost}
                    onChange={(e) => handleInputChange('estimatedCost', e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    rows={3}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="Additional notes for recurring jobs..."
                  />
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                onClick={isEdit ? handleUpdateRecurringJob : handleCreateRecurringJob}
                disabled={!formData.customerId || !formData.serviceType || isLoading}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Saving...' : (isEdit ? 'Update Recurring Job' : 'Create Recurring Job')}
              </button>
              <button
                onClick={() => {
                  if (isEdit) {
                    setShowEditModal(false);
                    setSelectedRecurringJob(null);
                  } else {
                    setShowCreateModal(false);
                  }
                  resetForm();
                }}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <ArrowPathIcon className="h-8 w-8 text-primary-500 mr-3" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Recurring Jobs</h1>
            <p className="text-gray-600">Manage automated job scheduling</p>
          </div>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Create Recurring Job
        </button>
      </div>

      {/* Recurring Jobs List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {isLoading && recurringJobs.length === 0 ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Loading recurring jobs...</p>
          </div>
        ) : (
          <div className="px-3 pb-4">
            <GridComponent
              id="recurringJobsGrid"
              dataSource={recurringJobs}
              allowPaging
              allowSorting
              allowFiltering
              allowSelection
              allowExcelExport
              filterSettings={recurringFilterSettings}
              toolbar={recurringToolbarOptions}
              toolbarClick={handleRecurringToolbarClick}
              selectionSettings={{ type: 'Single' }}
              pageSettings={recurringPageSettings}
              height="520"
              ref={recurringGridRef}
              noRecordsTemplate={recurringNoRecordsTemplate}
            >
              <ColumnsDirective>
                <ColumnDirective
                  field="customerName"
                  headerText="Customer"
                  width="220"
                  template={recurringCustomerTemplate}
                />
                <ColumnDirective
                  field="serviceType"
                  headerText="Service"
                  width="200"
                  template={recurringServiceTemplate}
                />
                <ColumnDirective
                  field="frequency"
                  headerText="Frequency"
                  width="160"
                  template={recurringFrequencyTemplate}
                />
                <ColumnDirective
                  field="time"
                  headerText="Schedule"
                  width="200"
                  template={recurringScheduleTemplate}
                />
                <ColumnDirective
                  field="isActive"
                  headerText="Status"
                  width="120"
                  template={recurringStatusTemplate}
                  allowFiltering={false}
                />
                <ColumnDirective
                  headerText="Actions"
                  width="180"
                  template={recurringActionsTemplate}
                  allowFiltering={false}
                  allowSorting={false}
                />
              </ColumnsDirective>
              <Inject services={[Page, Toolbar, Sort, Filter, ExcelExport, Selection, Search, Resize]} />
            </GridComponent>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && renderModal(false)}

      {/* Edit Modal */}
      {showEditModal && renderModal(true)}
    </div>
  );
};

export default RecurringJobsPage;

