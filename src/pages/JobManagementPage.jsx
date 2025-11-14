import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import JobManagementService from '../services/jobManagementService';
import CompanyService from '../services/companyService';
import JobPhotoService from '../services/jobPhotoService';
import CustomerService from '../services/customerService';
import PhotoService from '../services/photoService';
import PhotoGallery from '../components/PhotoGallery';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { canReassignJobs } from '../utils/permissions';
import { parseDate, formatDate as formatDateHelper } from '../utils/dateHelpers';
import { 
  ClipboardDocumentListIcon, 
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  FunnelIcon,
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  UserIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon
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

const JobManagementPage = () => {
  const { userProfile } = useAuth();
  const { getEffectiveCompanyId, refreshKey } = useCompany();
  const canTransferJobs = canReassignJobs(userProfile);
  const companyIdForJobs = useMemo(
    () => (typeof getEffectiveCompanyId === 'function' ? getEffectiveCompanyId() : null),
    [getEffectiveCompanyId, refreshKey, userProfile?.companyId]
  );

  const [jobs, setJobs] = useState([]);
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showViewModal, setShowViewModal] = useState(false);
  const [showJobModal, setShowJobModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobPhotos, setJobPhotos] = useState([]);
  const [jobPhotosLoading, setJobPhotosLoading] = useState(false);
  const [jobCustomers, setJobCustomers] = useState([]);
  const [jobCustomersLoading, setJobCustomersLoading] = useState(false);
  const [isEditingJob, setIsEditingJob] = useState(false);
  const [isSavingJob, setIsSavingJob] = useState(false);
  const [jobFormErrors, setJobFormErrors] = useState({});
  const [stats, setStats] = useState({
    totalJobs: 0,
    scheduledJobs: 0,
    inProgressJobs: 0,
    completedJobs: 0,
    cancelledJobs: 0,
    totalRevenue: 0,
    thisWeekJobs: 0,
    thisMonthJobs: 0
  });

  // Filter states
  const [activeFilter, setActiveFilter] = useState('all'); // all, scheduled, in-progress, completed, cancelled
  const [dateFilter, setDateFilter] = useState('all'); // all, today, week, month
  const [sortBy, setSortBy] = useState('date'); // date, status, customer, cost

  // Status update form
  const [statusData, setStatusData] = useState({
    status: '',
    actualWorkDone: '',
    actualHours: '',
    completionNotes: '',
    cancellationReason: ''
  });

  const [teamMembers, setTeamMembers] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [serviceOptions, setServiceOptions] = useState([]);
  const defaultJobForm = useMemo(
    () => ({
      customerId: '',
      customerName: '',
      customerPhone: '',
      address: '',
      serviceType: '',
      status: 'scheduled',
      date: new Date().toISOString().split('T')[0],
      time: '09:00',
      duration: '',
      estimatedCost: '',
      notes: '',
      assignedTechnicianId: '',
      assignedTechnicianName: '',
    }),
    []
  );
  const [jobFormData, setJobFormData] = useState(defaultJobForm);

  const activeTeamMembers = useMemo(
    () =>
      teamMembers.filter((member) => {
        const status = (member.status || '').toLowerCase();
        return status === '' || status === 'active';
      }),
    [teamMembers]
  );
  const isAssignedTechnicianMissing = useMemo(
    () =>
      Boolean(
        jobFormData.assignedTechnicianId &&
          !activeTeamMembers.some((member) => member.id === jobFormData.assignedTechnicianId)
      ),
    [jobFormData.assignedTechnicianId, activeTeamMembers]
  );

  const jobsGridRef = useRef(null);
  const jobsToolbarOptions = useMemo(() => ['Search', 'ExcelExport'], []);
  const jobsPageSettings = useMemo(() => ({ pageSize: 25, pageSizes: [25, 50, 100, 200] }), []);
  const jobsFilterSettings = useMemo(() => ({ type: 'Excel' }), []);

  const loadJobPhotos = useCallback(
    async (job) => {
      if (!job) {
        setJobPhotos([]);
        return;
      }

      const companyId = job.companyId || companyIdForJobs || userProfile?.companyId;
      if (!companyId) {
        setJobPhotos([]);
        return;
      }

      setJobPhotosLoading(true);
      try {
        const result = await JobPhotoService.getJobPhotos(companyId, job.id);
        if (result.success) {
          // Transform photos to match PhotoGallery component format
          const transformedPhotos = (result.photos || []).map(photo => ({
            id: photo.id,
            url: photo.downloadURL || photo.url,
            fileName: photo.fileName || `photo-${photo.id}.jpg`,
            capturedAt: photo.capturedAt,
            uploadedAt: photo.uploadedAt || photo.createdAt,
            latitude: photo.latitude,
            longitude: photo.longitude,
            locationAccuracy: photo.locationAccuracy,
            notes: photo.note || photo.notes,
            storagePath: photo.storagePath
          }));
          setJobPhotos(transformedPhotos);
        } else {
          setJobPhotos([]);
          if (result.error) {
            console.warn('Failed to load job photos:', result.error);
          }
        }
      } catch (error) {
        console.error('Error loading job photos:', error);
        setJobPhotos([]);
      } finally {
        setJobPhotosLoading(false);
      }
    },
    [companyIdForJobs, userProfile?.companyId]
  );

  // Validate job form - check if all required fields are filled and date/time is in future
  const isJobFormValid = useCallback(() => {
    // Check required fields
    if (!(jobFormData.customerName || jobFormData.customerId)) {
      return false;
    }
    if (!jobFormData.serviceType || !jobFormData.serviceType.trim()) {
      return false;
    }
    if (!jobFormData.date) {
      return false;
    }
    if (!jobFormData.time) {
      return false;
    }

    // When creating new job (not editing), ensure date/time is in the future
    if (!isEditingJob) {
      const selectedDateTime = new Date(`${jobFormData.date}T${jobFormData.time}`);
      const now = new Date();
      
      if (selectedDateTime < now) {
        return false;
      }
    }

    return true;
  }, [jobFormData, isEditingJob]);

  const loadJobCustomers = useCallback(async () => {
    setJobCustomersLoading(true);
    try {
      const result = await CustomerService.getCustomers(1000, null, {}, userProfile, companyIdForJobs);
      if (result.success) {
        console.log('📋 Loaded customers:', result.customers?.length);
        
        // Sort customers alphabetically by name for better UX
        const sortedCustomers = (result.customers || []).sort((a, b) => {
          const nameA = (a.name || a.email || '').toLowerCase();
          const nameB = (b.name || b.email || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
        
        // Check for duplicate names
        const nameCount = {};
        sortedCustomers.forEach(c => {
          const name = c.name || 'Unnamed';
          nameCount[name] = (nameCount[name] || 0) + 1;
        });
        const duplicates = Object.entries(nameCount).filter(([name, count]) => count > 1);
        if (duplicates.length > 0) {
          console.log('🔁 Customers with duplicate names:', duplicates);
        }
        
        setJobCustomers(sortedCustomers);
      } else {
        setJobCustomers([]);
        if (result.error) {
          toast.error(result.error);
        }
      }
    } catch (error) {
      console.error('Error loading job customers:', error);
      setJobCustomers([]);
      toast.error('Failed to load customers');
    } finally {
      setJobCustomersLoading(false);
    }
  }, [companyIdForJobs, userProfile]);

  useEffect(() => {
    loadJobs();
    loadStats();
  }, [companyIdForJobs, userProfile]);

  useEffect(() => {
    filterAndSortJobs();
  }, [jobs, searchTerm, activeFilter, dateFilter, sortBy]);

  useEffect(() => {
    if (showJobModal) {
      loadJobCustomers();
      loadCompanyServices();
    }
  }, [showJobModal, loadJobCustomers]);

  useEffect(() => {
    if (showJobModal) {
      loadCompanyServices();
    }
  }, [companyIdForJobs]);

  useEffect(() => {
    if (!canTransferJobs) {
      setTeamMembers([]);
      return;
    }

    if (!companyIdForJobs) {
      setTeamMembers([]);
      return;
    }

    const fetchTeamMembers = async () => {
      try {
        const result = await CompanyService.getTeamMembers(companyIdForJobs);
        if (result.success) {
          setTeamMembers(result.teamMembers || []);
        } else if (result.permissionDenied) {
          setTeamMembers([]);
        } else if (result.error) {
          toast.error(result.error);
        }
      } catch (error) {
        if (error?.code === 'permission-denied') {
          setTeamMembers([]);
        } else {
          console.error('Error loading team members:', error);
          toast.error('Error loading team members');
        }
      }
    };

    fetchTeamMembers();
  }, [canTransferJobs, companyIdForJobs]);

  const loadJobs = async () => {
    setIsLoading(true);
    try {
      const result = await JobManagementService.getJobs(1000, null, {}, userProfile, companyIdForJobs);
      if (result.success) {
        setJobs(result.jobs);
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
      toast.error('Error loading jobs');
    }
    setIsLoading(false);
  };

  const loadStats = async () => {
    try {
      const result = await JobManagementService.getJobStats();
      if (result.success) {
        setStats(result.stats);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadCompanyServices = async () => {
    try {
      const effectiveCompanyId = companyIdForJobs || userProfile?.companyId;
      if (!effectiveCompanyId) {
        setServiceOptions([]);
        return;
      }

      const result = await CompanyService.getCompany(effectiveCompanyId);
      if (result.success && result.company && result.company.services) {
        // Sort services alphabetically
        const sorted = [...(result.company.services || [])].sort();
        setServiceOptions(sorted);
      } else {
        setServiceOptions([]);
      }
    } catch (error) {
      console.error('Error loading company services:', error);
      setServiceOptions([]);
    }
  };

  const filterAndSortJobs = () => {
    let filtered = [...jobs];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(job => {
        const searchLower = searchTerm.toLowerCase();
        return (
          job.customerName?.toLowerCase().includes(searchLower) ||
          job.serviceType?.toLowerCase().includes(searchLower) ||
          job.address?.toLowerCase().includes(searchLower) ||
          job.notes?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply status filter
    if (activeFilter !== 'all') {
      filtered = filtered.filter(job => job.status === activeFilter);
    }

    // Apply date filter
    if (dateFilter !== 'all') {
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      filtered = filtered.filter(job => {
        const jobDate = parseDate(job.date);
        
        switch (dateFilter) {
          case 'today':
            return jobDate.toDateString() === today.toDateString();
          case 'week':
            return jobDate >= startOfWeek;
          case 'month':
            return jobDate >= startOfMonth;
          default:
            return true;
        }
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          const dateA = parseDate(a.date);
          const dateB = parseDate(b.date);
          if (dateA.getTime() === dateB.getTime()) {
            return (a.time || '').localeCompare(b.time || '');
          }
          return dateB - dateA;
        case 'status':
          return (a.status || '').localeCompare(b.status || '');
        case 'customer':
          return (a.customerName || '').localeCompare(b.customerName || '');
        case 'cost':
          return (parseFloat(b.totalCost) || 0) - (parseFloat(a.totalCost) || 0);
        default:
          return 0;
      }
    });

    setFilteredJobs(filtered);
  };

  const handleStatusUpdate = async () => {
    if (!statusData.status) {
      toast.error('Please select a status');
      return;
    }

    setIsLoading(true);
    try {
      const result = await JobManagementService.updateJobStatus(selectedJob.id, statusData.status, statusData);
      if (result.success) {
        setJobs(prev => prev.map(job => 
          job.id === selectedJob.id ? result.job : job
        ));
        setShowStatusModal(false);
        setSelectedJob(null);
        setStatusData({
          status: '',
          actualWorkDone: '',
          actualHours: '',
          completionNotes: '',
          cancellationReason: ''
        });
        loadStats();
        toast.success('Job status updated successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error updating job status:', error);
      toast.error('Error updating job status');
    }
    setIsLoading(false);
  };

  const handleDeleteJob = async (jobId) => {
    if (!window.confirm('Are you sure you want to delete this job?')) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await JobManagementService.deleteJob(jobId);
      if (result.success) {
        setJobs(prev => prev.filter(job => job.id !== jobId));
        loadStats();
        toast.success('Job deleted successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error deleting job:', error);
      toast.error('Error deleting job');
    }
    setIsLoading(false);
  };

  const openViewModal = (job) => {
    setSelectedJob(job);
    setJobPhotos([]);
    setShowViewModal(true);
    loadJobPhotos(job);
  };

  const applyJobToForm = useCallback((job) => {
    if (!job) {
      setJobFormData({ ...defaultJobForm });
      return;
    }

    setJobFormData({
      customerId: job.customerId || '',
      customerName: job.customerName || '',
      customerPhone: job.customerPhone || '',
      address: job.address || '',
      serviceType: job.serviceType || '',
      status: job.status || 'scheduled',
      date: job.date || defaultJobForm.date,
      time: job.time || defaultJobForm.time,
      duration: job.duration || job.estimatedDuration || '',
      estimatedCost: job.estimatedCost || job.totalCost || '',
      notes: job.notes || '',
      assignedTechnicianId: job.assignedTo || '',
      assignedTechnicianName: job.assignedToName || '',
    });
  }, [defaultJobForm]);

  const openEditModal = (job) => {
    setSelectedJob(job);
    setIsEditingJob(true);
    applyJobToForm(job);
    setJobFormErrors({});
    setShowJobModal(true);
  };

  const openCreateModal = () => {
    setSelectedJob(null);
    setIsEditingJob(false);
    setJobFormErrors({});
    setJobFormData({
      ...defaultJobForm,
      date: new Date().toISOString().split('T')[0],
    });
    setShowJobModal(true);
  };

  const openStatusModal = (job) => {
    setSelectedJob(job);
    setStatusData({
      status: job.status,
      actualWorkDone: job.actualWorkDone || '',
      actualHours: job.actualHours || '',
      completionNotes: job.completionNotes || '',
      cancellationReason: job.cancellationReason || ''
    });
    setShowStatusModal(true);
  };

  const openAssignModal = (job) => {
    setSelectedJob(job);
    setSelectedAssigneeId(job.assignedTo || '');
    setShowAssignModal(true);
  };

  const handleCopyPhotoLink = useCallback(async (url) => {
    if (!url) {
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Photo link copied to clipboard');
    } catch (error) {
      console.error('Failed to copy photo link:', error);
      toast.error('Unable to copy link');
    }
  }, []);

  const handleAssignJob = async () => {
    if (!selectedJob) {
      return;
    }

    if (!selectedAssigneeId) {
      toast.error('Please select a team member');
      return;
    }

    const member = activeTeamMembers.find((m) => m.id === selectedAssigneeId);

    if (!member) {
      toast.error('Selected team member is no longer available');
      return;
    }

    const displayName =
      member.name ||
      member.fullName ||
      member.roleDisplay ||
      member.email ||
      'Team Member';

    setIsAssigning(true);
    try {
      const result = await JobManagementService.assignJob(
        selectedJob.id,
        member.id,
        displayName
      );

      if (result.success) {
        setJobs((prev) =>
          prev.map((job) =>
            job.id === selectedJob.id
              ? {
                  ...job,
                  assignedTo: member.id,
                  assignedToName:
                    result.job?.assignedToName || displayName,
                }
              : job
          )
        );
        setSelectedJob((prev) =>
          prev
            ? {
                ...prev,
                assignedTo: member.id,
                assignedToName:
                  result.job?.assignedToName || displayName,
              }
            : prev
        );
        toast.success(`Job reassigned to ${displayName}`);
        setShowAssignModal(false);
        setSelectedAssigneeId('');
      } else {
        toast.error(result.error || 'Failed to reassign job');
      }
    } catch (error) {
      console.error('Error assigning job:', error);
      toast.error('Error assigning job');
    } finally {
      setIsAssigning(false);
    }
  };

  const exportJobs = async () => {
    try {
      const filters = {
        status: activeFilter !== 'all' ? activeFilter : undefined,
        dateRange: dateFilter !== 'all' ? getDateRange(dateFilter) : undefined
      };
      
      const result = await JobManagementService.exportJobs(filters);
      if (result.success) {
        const blob = new Blob([result.csvData], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jobs-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        toast.success('Jobs exported successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error exporting jobs:', error);
      toast.error('Error exporting jobs');
    }
  };

  const getDateRange = (filter) => {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    switch (filter) {
      case 'today':
        return { startDate: today, endDate: today };
      case 'week':
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        return { startDate: startOfWeek, endDate: endOfWeek };
      case 'month':
        return { startDate: startOfMonth, endDate: endOfMonth };
      default:
        return null;
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return formatDateHelper(dateString);
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDateTime = (value) => {
    if (!value) {
      return '';
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'scheduled':
        return <CalendarIcon className="h-4 w-4" />;
      case 'in-progress':
        return <ClockIcon className="h-4 w-4" />;
      case 'completed':
        return <CheckCircleIcon className="h-4 w-4" />;
      case 'cancelled':
        return <XCircleIcon className="h-4 w-4" />;
      default:
        return <ExclamationTriangleIcon className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleJobsToolbarClick = useCallback((args) => {
    if (!jobsGridRef.current) return;
    const id = args.item?.id || '';
    if (id.includes('_excelexport')) {
      jobsGridRef.current.excelExport({
        fileName: `jobs-${new Date().toISOString().split('T')[0]}.xlsx`
      });
    }
  }, []);

  const jobDetailsTemplate = (props) => (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900">{props.serviceType || 'Service'}</span>
        {props.recurringJobId && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
            <ArrowPathIcon className="h-3 w-3 mr-1" />
            Recurring
          </span>
        )}
      </div>
      <div className="text-xs text-gray-500 flex items-center">
        <MapPinIcon className="h-3 w-3 mr-1" />
        {props.address || 'No address'}
      </div>
    </div>
  );

  const jobCustomerTemplate = (props) => (
    <div className="space-y-1">
      <div className="text-sm text-gray-900">{props.customerName || 'Unknown'}</div>
      {props.customerPhone && <div className="text-xs text-gray-500">{props.customerPhone}</div>}
    </div>
  );

  const jobScheduleTemplate = (props) => (
    <div className="space-y-1">
      <div className="text-sm text-gray-900">{formatDate(props.date)}</div>
      <div className="text-xs text-gray-500 flex items-center">
        <ClockIcon className="h-3 w-3 mr-1" />
        {formatTime(props.time) || '—'}
      </div>
    </div>
  );

  const jobStatusTemplate = (props) => (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(props.status)}`}>
      {getStatusIcon(props.status)}
      <span className="ml-1 capitalize">{props.status?.replace('-', ' ') || 'Unknown'}</span>
    </span>
  );

  const jobAssignedTemplate = (props) => (
    <span className="text-sm text-gray-900">{props.assignedToName || 'Unassigned'}</span>
  );

  const jobCostTemplate = (props) => (
    <span className="text-sm font-semibold text-gray-900">{formatCurrency(props.totalCost)}</span>
  );

  const jobActionsTemplate = (props) => (
    <div className="flex space-x-2">
      <button
        type="button"
        onClick={() => openViewModal(props)}
        className="text-primary-600 hover:text-primary-900"
        title="View Job"
      >
        <EyeIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => openEditModal(props)}
        className="text-gray-600 hover:text-gray-900"
        title="Edit Job"
      >
        <PencilIcon className="h-4 w-4" />
      </button>
      {canTransferJobs && (
        <button
          type="button"
          onClick={() => openAssignModal(props)}
          className="text-emerald-600 hover:text-emerald-900"
          title="Assign to team member"
        >
          <UserIcon className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() => openStatusModal(props)}
        className="text-blue-600 hover:text-blue-900"
        title="Update Status"
      >
        <CheckCircleIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => handleDeleteJob(props.id)}
        className="text-red-600 hover:text-red-900"
        title="Delete Job"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  );

  const renderNoJobsState = () => (
    <div className="text-center py-12 space-y-3">
      <ClipboardDocumentListIcon className="mx-auto h-12 w-12 text-gray-400" />
      <h3 className="text-sm font-medium text-gray-900">No jobs found</h3>
      <p className="text-sm text-gray-500">
        {searchTerm ? 'Try adjusting your filters or search terms.' : 'Create your first job to get started.'}
      </p>
      <button
        type="button"
        onClick={openCreateModal}
        className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
      >
        <PlusIcon className="h-4 w-4 mr-2" />
        Create Job
      </button>
    </div>
  );

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
            <ClipboardDocumentListIcon className="h-8 w-8 text-primary-500 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Job Management</h1>
              <p className="text-gray-600">Manage and track all your service jobs</p>
            </div>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={openCreateModal}
              className="flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Create Job
            </button>
            <button
              onClick={exportJobs}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ClipboardDocumentListIcon className="h-6 w-6 text-primary-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Jobs</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.totalJobs}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-6 w-6 bg-blue-500 rounded-full"></div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Scheduled</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.scheduledJobs}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-6 w-6 bg-green-500 rounded-full"></div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Completed</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.completedJobs}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-6 w-6 bg-green-600 rounded-full"></div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Revenue</dt>
                  <dd className="text-lg font-medium text-gray-900">{formatCurrency(stats.totalRevenue)}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-6 w-6 bg-yellow-500 rounded-full"></div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">In Progress</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.inProgressJobs}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-6 w-6 bg-purple-500 rounded-full"></div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">This Week</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.thisWeekJobs}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-6 w-6 bg-orange-500 rounded-full"></div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">This Month</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.thisMonthJobs}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search jobs by customer, service type, address, or notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="all">All Status</option>
              <option value="scheduled">Scheduled</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="date">Sort by Date</option>
              <option value="status">Sort by Status</option>
              <option value="customer">Sort by Customer</option>
              <option value="cost">Sort by Cost</option>
            </select>
          </div>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Jobs ({filteredJobs.length})
          </h3>
        </div>
        
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
          </div>
        ) : (
          <div className="px-3 pb-4">
            {filteredJobs.length === 0 ? (
              renderNoJobsState()
            ) : (
              <GridComponent
                id="jobsGrid"
                dataSource={filteredJobs}
                allowPaging
                allowSorting
                allowFiltering
                allowSelection
                allowExcelExport
                filterSettings={jobsFilterSettings}
                toolbar={jobsToolbarOptions}
                toolbarClick={handleJobsToolbarClick}
                selectionSettings={{ type: 'Single' }}
                pageSettings={jobsPageSettings}
                height="600"
                ref={jobsGridRef}
              >
                <ColumnsDirective>
                  <ColumnDirective
                    field="serviceType"
                    headerText="Job Details"
                    width="260"
                    template={jobDetailsTemplate}
                  />
                  <ColumnDirective
                    field="customerName"
                    headerText="Customer"
                    width="200"
                    template={jobCustomerTemplate}
                  />
                  <ColumnDirective
                    field="date"
                    headerText="Schedule"
                    width="170"
                    template={jobScheduleTemplate}
                  />
                  <ColumnDirective
                    field="status"
                    headerText="Status"
                    width="140"
                    template={jobStatusTemplate}
                    allowFiltering={false}
                  />
                  <ColumnDirective
                    field="assignedToName"
                    headerText="Assigned To"
                    width="160"
                    template={jobAssignedTemplate}
                  />
                  <ColumnDirective
                    field="totalCost"
                    headerText="Cost"
                    width="130"
                    template={jobCostTemplate}
                    textAlign="Right"
                  />
                  <ColumnDirective
                    headerText="Actions"
                    width="200"
                    template={jobActionsTemplate}
                    allowFiltering={false}
                    allowSorting={false}
                  />
                </ColumnsDirective>
                <Inject services={[Page, Toolbar, Sort, Filter, ExcelExport, Selection, Search, Resize]} />
              </GridComponent>
            )}
          </div>
        )}
      </div>

      {/* View Job Modal */}
      {showViewModal && selectedJob && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Job Details</h3>
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setSelectedJob(null);
                    setJobPhotos([]);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4 max-h-96 overflow-y-auto">
                <div className="border-b pb-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xl font-medium text-gray-900">{selectedJob.serviceType || 'Service'}</h4>
                    {selectedJob.recurringJobId && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        <ArrowPathIcon className="h-3 w-3 mr-1" />
                        Recurring Job
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(selectedJob.status)}`}>
                      {getStatusIcon(selectedJob.status)}
                      <span className="ml-1 capitalize">{selectedJob.status?.replace('-', ' ')}</span>
                    </span>
                    <span>Created {formatDate(selectedJob.createdAt)}</span>
                  </div>
                  {selectedJob.recurringJobId && (
                    <div className="mt-2 text-sm">
                      <Link
                        to="/recurring-jobs"
                        className="text-blue-600 hover:text-blue-800 underline inline-flex items-center"
                      >
                        <ArrowPathIcon className="h-4 w-4 mr-1" />
                        View Recurring Template
                      </Link>
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Customer</h5>
                    <p className="text-sm text-gray-900">{selectedJob.customerName || 'Not specified'}</p>
                    <p className="text-sm text-gray-500">{selectedJob.customerPhone || ''}</p>
                  </div>
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Assigned To</h5>
                    <p className="text-sm text-gray-900">{selectedJob.assignedToName || 'Unassigned'}</p>
                  </div>
                </div>
                
                <div>
                  <h5 className="text-sm font-medium text-gray-700">Address</h5>
                  <p className="text-sm text-gray-900">{selectedJob.address || 'Not specified'}</p>
                </div>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Date & Time</h5>
                    <p className="text-sm text-gray-900">{formatDate(selectedJob.date)} at {formatTime(selectedJob.time)}</p>
                  </div>
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Duration</h5>
                    <p className="text-sm text-gray-900">{selectedJob.estimatedDuration || 'Not specified'}</p>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-md">
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Total Cost</h5>
                  <p className="text-lg font-semibold text-gray-900">{formatCurrency(selectedJob.totalCost)}</p>
                </div>
                
                {selectedJob.notes && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Notes</h5>
                    <div className="text-sm text-gray-900 whitespace-pre-line">
                      {selectedJob.notes}
                    </div>
                  </div>
                )}
                
                <div className="border-t pt-4">
                  <PhotoGallery 
                    jobId={selectedJob.id}
                    photos={jobPhotos}
                    onDeletePhoto={async (photoId) => {
                      const result = await PhotoService.deletePhoto(photoId);
                      if (result.success) {
                        setJobPhotos(prev => prev.filter(p => p.id !== photoId));
                      } else {
                        throw new Error(result.error);
                      }
                    }}
                    isLoading={jobPhotosLoading}
                    readOnly={false}
                  />
                </div>
                
                {selectedJob.actualWorkDone && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Actual Work Done</h5>
                    <div className="text-sm text-gray-900 whitespace-pre-line">
                      {selectedJob.actualWorkDone}
                    </div>
                  </div>
                )}
                
                {selectedJob.completionNotes && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Completion Notes</h5>
                    <div className="text-sm text-gray-900 whitespace-pre-line">
                      {selectedJob.completionNotes}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setSelectedJob(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    openStatusModal(selectedJob);
                    setJobPhotos([]);
                  }}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  Update Status
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showJobModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {isEditingJob ? 'Edit Job' : 'Create Job'}
                </h3>
                <button
                  onClick={() => {
                    setShowJobModal(false);
                    setJobFormErrors({});
                    setJobFormData({ ...defaultJobForm });
                    if (!isEditingJob) {
                      setSelectedJob(null);
                    }
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Customer</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <select
                        value={jobFormData.customerId}
                        onChange={(event) => {
                          const value = event.target.value;
                          const selectedCustomer = jobCustomers.find((c) => c.id === value);
                          console.log('Selected customer:', selectedCustomer);
                          console.log('Customer phone:', selectedCustomer?.phone);
                          console.log('Customer address:', selectedCustomer?.address);
                          
                          // Build full address from customer data
                          let fullAddress = selectedCustomer?.address || '';
                          if (selectedCustomer?.city) {
                            fullAddress += (fullAddress ? ', ' : '') + selectedCustomer.city;
                          }
                          if (selectedCustomer?.state) {
                            fullAddress += (fullAddress ? ', ' : '') + selectedCustomer.state;
                          }
                          if (selectedCustomer?.zipCode) {
                            fullAddress += (fullAddress ? ' ' : '') + selectedCustomer.zipCode;
                          }
                          
                          console.log('Full address:', fullAddress);
                          
                          setJobFormData((prev) => ({
                            ...prev,
                            customerId: value,
                            customerName: selectedCustomer?.name || prev.customerName,
                            customerPhone: selectedCustomer?.phone || '',
                            address: fullAddress,
                          }));
                          setJobFormErrors((prev) => ({ ...prev, customerName: undefined }));
                        }}
                        className="block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm transition-colors"
                      >
                        <option value="">
                          {jobCustomersLoading ? 'Loading customers...' : 'Select existing customer'}
                        </option>
                        {jobCustomers.map((customer) => {
                          // Build display name with additional info to help identify duplicates
                          let displayName = customer.name || customer.email || 'Unnamed customer';
                          const additionalInfo = [];
                          
                          if (customer.phone) {
                            additionalInfo.push(customer.phone);
                          }
                          if (customer.address) {
                            additionalInfo.push(customer.address);
                          } else if (customer.city) {
                            additionalInfo.push(customer.city);
                          }
                          
                          if (additionalInfo.length > 0) {
                            displayName += ` - ${additionalInfo.join(' • ')}`;
                          }
                          
                          return (
                            <option key={customer.id} value={customer.id}>
                              {displayName}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <input
                        type="text"
                        value={jobFormData.customerName}
                        onChange={(event) => {
                          const value = event.target.value;
                          setJobFormData((prev) => ({
                            ...prev,
                            customerName: value,
                          }));
                          setJobFormErrors((prev) => ({ ...prev, customerName: undefined }));
                        }}
                        placeholder="Customer name"
                        className="block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm transition-colors"
                      />
                      {jobFormErrors.customerName && (
                        <p className="mt-1 text-xs text-red-600">{jobFormErrors.customerName}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Service Type *</label>
                  {serviceOptions.length > 0 ? (
                    <>
                      <select
                        value={jobFormData.serviceType === '__custom__' ? '__custom__' : jobFormData.serviceType}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value === '__custom__') {
                            // Show custom input prompt
                            const customService = prompt('Enter custom service type:');
                            if (customService && customService.trim()) {
                              setJobFormData((prev) => ({
                                ...prev,
                                serviceType: customService.trim(),
                              }));
                            }
                            // Reset select to empty
                            event.target.value = '';
                          } else {
                            setJobFormData((prev) => ({
                              ...prev,
                              serviceType: value,
                            }));
                          }
                          setJobFormErrors((prev) => ({ ...prev, serviceType: undefined }));
                        }}
                        className="block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm transition-colors bg-white"
                      >
                        <option value="">Select a service type...</option>
                        {serviceOptions.map((service) => (
                          <option key={service} value={service}>
                            {service}
                          </option>
                        ))}
                        <option disabled>──────────────</option>
                        <option value="__custom__">+ Enter Custom Service</option>
                      </select>
                      {jobFormData.serviceType && !serviceOptions.includes(jobFormData.serviceType) && (
                        <p className="mt-2 text-xs text-amber-600">
                          📝 Custom: "{jobFormData.serviceType}"
                        </p>
                      )}
                    </>
                  ) : (
                    <input
                      type="text"
                      value={jobFormData.serviceType}
                      onChange={(event) => {
                        const value = event.target.value;
                        setJobFormData((prev) => ({
                          ...prev,
                          serviceType: value,
                        }));
                        setJobFormErrors((prev) => ({ ...prev, serviceType: undefined }));
                      }}
                      placeholder="Enter service type (no services configured)"
                      className="block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm transition-colors"
                    />
                  )}
                  {jobFormErrors.serviceType && (
                    <p className="mt-1 text-xs text-red-600">{jobFormErrors.serviceType}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                    <select
                      value={jobFormData.status}
                      onChange={(event) =>
                        setJobFormData((prev) => ({
                          ...prev,
                          status: event.target.value || 'scheduled',
                        }))
                      }
                      className="block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm transition-colors bg-white"
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="in-progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Duration</label>
                    <input
                      type="text"
                      value={jobFormData.duration}
                      onChange={(event) =>
                        setJobFormData((prev) => ({
                          ...prev,
                          duration: event.target.value,
                        }))
                      }
                      placeholder="e.g., 2 hours"
                      className="block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Assign Technician
                  </label>
                  <select
                    value={jobFormData.assignedTechnicianId}
                    onChange={(event) => {
                      const value = event.target.value;
                      const member = activeTeamMembers.find((m) => m.id === value);
                      setJobFormData((prev) => ({
                        ...prev,
                        assignedTechnicianId: value,
                        assignedTechnicianName:
                          member?.name ||
                          member?.fullName ||
                          member?.roleDisplay ||
                          member?.email ||
                          '',
                      }));
                      setJobFormErrors((prev) => ({ ...prev, assignedTechnicianId: undefined }));
                    }}
                    disabled={activeTeamMembers.length === 0 && !jobFormData.assignedTechnicianId}
                    className="block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm transition-colors bg-white disabled:bg-gray-50 disabled:text-gray-500"
                  >
                    <option value="">Unassigned</option>
                    {isAssignedTechnicianMissing && (
                      <option value={jobFormData.assignedTechnicianId}>
                        {jobFormData.assignedTechnicianName || 'Assigned technician'}
                      </option>
                    )}
                    {activeTeamMembers.map((member) => {
                      const label =
                        member.name ||
                        member.fullName ||
                        member.roleDisplay ||
                        member.email ||
                        'Unnamed member';
                      return (
                        <option key={member.id} value={member.id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                  {activeTeamMembers.length === 0 && !jobFormData.assignedTechnicianId && (
                    <p className="mt-2 text-xs text-gray-500">
                      No active team members available for assignment yet.
                    </p>
                  )}
                  {jobFormErrors.assignedTechnicianId && (
                    <p className="mt-1 text-xs text-red-600">{jobFormErrors.assignedTechnicianId}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Date *</label>
                    <input
                      type="date"
                      value={jobFormData.date}
                      onChange={(event) => {
                        const value = event.target.value;
                        setJobFormData((prev) => ({ ...prev, date: value }));
                        setJobFormErrors((prev) => ({ ...prev, date: undefined }));
                      }}
                      className="block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm transition-colors"
                    />
                    {jobFormErrors.date && <p className="mt-1 text-xs text-red-600">{jobFormErrors.date}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Time *</label>
                    <input
                      type="time"
                      value={jobFormData.time}
                      onChange={(event) => {
                        const value = event.target.value;
                        setJobFormData((prev) => ({ ...prev, time: value }));
                        setJobFormErrors((prev) => ({ ...prev, time: undefined }));
                      }}
                      className="block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm transition-colors"
                    />
                    {jobFormErrors.time && <p className="mt-1 text-xs text-red-600">{jobFormErrors.time}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Estimated Cost</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={jobFormData.estimatedCost}
                        onChange={(event) =>
                          setJobFormData((prev) => ({
                            ...prev,
                            estimatedCost: event.target.value,
                          }))
                        }
                        placeholder="250.00"
                        className="block w-full pl-8 pr-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
                    <input
                      type="text"
                      value={jobFormData.notes}
                      onChange={(event) =>
                        setJobFormData((prev) => ({
                          ...prev,
                          notes: event.target.value,
                        }))
                      }
                      placeholder="Additional instructions"
                      className="block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowJobModal(false);
                    setJobFormErrors({});
                    setJobFormData({ ...defaultJobForm });
                    if (!isEditingJob) {
                      setSelectedJob(null);
                    }
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const errors = {};
                    if (!(jobFormData.customerName || jobFormData.customerId)) {
                      errors.customerName = 'Customer name is required.';
                    }
                    if (!jobFormData.serviceType || !jobFormData.serviceType.trim()) {
                      errors.serviceType = 'Service type is required.';
                    }
                    if (!jobFormData.date) {
                      errors.date = 'Date is required.';
                    }
                    if (!jobFormData.time) {
                      errors.time = 'Time is required.';
                    }
                    
                    // Check if date/time is in the past (only for new jobs)
                    if (!isEditingJob && jobFormData.date && jobFormData.time) {
                      const selectedDateTime = new Date(`${jobFormData.date}T${jobFormData.time}`);
                      const now = new Date();
                      
                      if (selectedDateTime < now) {
                        errors.date = 'Job date/time must be in the future. For backdated jobs, please contact an administrator.';
                        toast.warning('Job date/time must be in the future. For backdated jobs, please contact an administrator.');
                      }
                    }
                    
                    setJobFormErrors(errors);
                    if (Object.keys(errors).length > 0) {
                      return;
                    }

                    setIsSavingJob(true);
                    try {
                      let assignedMember = null;
                      // TEMPORARILY DISABLED - Technician availability check
                      // TODO: Re-enable after fixing Firestore permissions
                      if (false && jobFormData.assignedTechnicianId) {
                        assignedMember = activeTeamMembers.find(
                          (member) => member.id === jobFormData.assignedTechnicianId
                        );
                        if (!assignedMember && selectedJob?.assignedTo === jobFormData.assignedTechnicianId) {
                          assignedMember = {
                            id: selectedJob.assignedTo,
                            name:
                              selectedJob.assignedToName ||
                              jobFormData.assignedTechnicianName ||
                              'Assigned technician',
                          };
                        }

                        try {
                          const durationMinutes =
                            JobManagementService.parseDurationMinutes(jobFormData.duration, null) ||
                            JobManagementService.parseDurationMinutes(selectedJob?.duration, null) ||
                            JobManagementService.parseDurationMinutes(
                              selectedJob?.estimatedDuration || selectedJob?.actualHours,
                              null
                            ) ||
                            60;

                          const availability = await JobManagementService.checkTechnicianAvailability(
                            jobFormData.assignedTechnicianId,
                            jobFormData.date,
                            jobFormData.time,
                            durationMinutes,
                            isEditingJob ? selectedJob?.id || null : null
                          );

                          if (availability?.error) {
                            toast.error(availability.error);
                            setIsSavingJob(false);
                            return;
                          }

                          if (availability?.hasConflict) {
                            const conflictSummary = availability.conflicts
                              .map(
                                (conflict) =>
                                  `${conflict.date || jobFormData.date} at ${conflict.time || 'unspecified'} ` +
                                  `(${conflict.serviceType || 'Job'}${conflict.customerName ? ` for ${conflict.customerName}` : ''
                                  })`
                              )
                              .join('; ');
                            toast.error(
                              `Scheduling conflict detected for ${assignedMember?.name || 'technician'
                              }: ${conflictSummary}`
                            );
                            setJobFormErrors((prev) => ({
                              ...prev,
                              assignedTechnicianId: 'Technician is unavailable at this time.',
                            }));
                            setIsSavingJob(false);
                            return;
                          }
                        } catch (availabilityError) {
                          // Log permission error but don't block job creation
                          console.warn('⚠️ Could not check technician availability (permissions issue):', availabilityError.message);
                          // Continue with job creation - availability check is nice-to-have but not critical
                        }
                      }

                      console.log('=== JOB FORM DATA BEFORE PAYLOAD ===');
                      console.log('jobFormData:', jobFormData);
                      console.log('customerPhone:', jobFormData.customerPhone);
                      console.log('address:', jobFormData.address);
                      
                      const payload = {
                        customerId: jobFormData.customerId || null,
                        customerName: jobFormData.customerName || '',
                        customerPhone: jobFormData.customerPhone || '',
                        address: jobFormData.address || '',
                        serviceType: jobFormData.serviceType.trim(),
                        status: jobFormData.status || 'scheduled',
                        date: jobFormData.date,
                        time: jobFormData.time,
                        duration: jobFormData.duration || '',
                        estimatedCost: jobFormData.estimatedCost
                          ? Number.parseFloat(jobFormData.estimatedCost)
                          : null,
                        notes: jobFormData.notes || '',
                        companyId: companyIdForJobs || userProfile?.companyId || null,
                        assignedTo: jobFormData.assignedTechnicianId || null,
                        assignedToName:
                          assignedMember?.name ||
                          assignedMember?.fullName ||
                          assignedMember?.roleDisplay ||
                          assignedMember?.email ||
                          jobFormData.assignedTechnicianName ||
                          '',
                      };
                      
                      console.log('=== PAYLOAD BEING SENT ===');
                      console.log('payload:', payload);
                      console.log('payload.customerPhone:', payload.customerPhone);
                      console.log('payload.address:', payload.address);

                      let result;
                      if (isEditingJob && selectedJob?.id) {
                        result = await JobManagementService.updateJob(selectedJob.id, payload);
                      } else {
                        result = await JobManagementService.createJob(payload);
                      }

                      if (result.success) {
                        toast.success(isEditingJob ? 'Job updated successfully!' : 'Job created successfully!');
                        setShowJobModal(false);
                        setJobFormData({ ...defaultJobForm });
                        setJobFormErrors({});
                        setSelectedJob(null);
                        await loadJobs();
                        await loadStats(); // Recalculate stats after job creation/update
                      } else {
                        toast.error(result.error || 'Failed to save job');
                      }
                    } catch (error) {
                      console.error('Error saving job:', error);
                      toast.error('Failed to save job');
                    } finally {
                      setIsSavingJob(false);
                    }
                  }}
                  disabled={isSavingJob || !isJobFormValid()}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {isSavingJob ? 'Saving...' : isEditingJob ? 'Update Job' : 'Create Job'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {showStatusModal && selectedJob && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Update Job Status</h3>
                <button
                  onClick={() => {
                    setShowStatusModal(false);
                    setSelectedJob(null);
                    setStatusData({
                      status: '',
                      actualWorkDone: '',
                      actualHours: '',
                      completionNotes: '',
                      cancellationReason: ''
                    });
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status *</label>
                  <select
                    value={statusData.status}
                    onChange={(e) => setStatusData(prev => ({ ...prev, status: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  >
                    <option value="">Select Status</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="in-progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                
                {statusData.status === 'completed' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Actual Work Done</label>
                      <textarea
                        value={statusData.actualWorkDone}
                        onChange={(e) => setStatusData(prev => ({ ...prev, actualWorkDone: e.target.value }))}
                        rows={3}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="Describe what was actually completed..."
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Actual Hours</label>
                      <input
                        type="text"
                        value={statusData.actualHours}
                        onChange={(e) => setStatusData(prev => ({ ...prev, actualHours: e.target.value }))}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="e.g., 2.5 hours"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Completion Notes</label>
                      <textarea
                        value={statusData.completionNotes}
                        onChange={(e) => setStatusData(prev => ({ ...prev, completionNotes: e.target.value }))}
                        rows={3}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="Additional notes about the completion..."
                      />
                    </div>
                  </>
                )}
                
                {statusData.status === 'cancelled' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Cancellation Reason</label>
                    <textarea
                      value={statusData.cancellationReason}
                      onChange={(e) => setStatusData(prev => ({ ...prev, cancellationReason: e.target.value }))}
                      rows={3}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      placeholder="Reason for cancellation..."
                    />
                  </div>
                )}
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowStatusModal(false);
                    setSelectedJob(null);
                    setStatusData({
                      status: '',
                      actualWorkDone: '',
                      actualHours: '',
                      completionNotes: '',
                      cancellationReason: ''
                    });
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStatusUpdate}
                  disabled={isLoading}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Updating...' : 'Update Status'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showAssignModal && selectedJob && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Reassign Job</h3>
                <button
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedAssigneeId('');
                    setSelectedJob(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-md">
                  <p className="text-sm font-medium text-gray-700">Job</p>
                  <p className="text-base text-gray-900">{selectedJob.serviceType || 'Service'}</p>
                  <p className="text-sm text-gray-500">
                    {formatDate(selectedJob.date)} at {formatTime(selectedJob.time)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Assign to *</label>
                  <select
                    value={selectedAssigneeId}
                    onChange={(e) => setSelectedAssigneeId(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  >
                    <option value="">Select a team member</option>
                    {activeTeamMembers.length === 0 && (
                      <option value="" disabled>
                        No active team members found
                      </option>
                    )}
                    {activeTeamMembers.map((member) => {
                      const label =
                        member.name ||
                        member.fullName ||
                        member.roleDisplay ||
                        member.email;
                      return (
                        <option key={member.id} value={member.id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                  <p className="mt-2 text-xs text-gray-500">
                    Only active team members can be assigned jobs.
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedAssigneeId('');
                    setSelectedJob(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignJob}
                  disabled={isAssigning || activeTeamMembers.length === 0}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAssigning ? 'Assigning...' : 'Assign Job'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default JobManagementPage;
