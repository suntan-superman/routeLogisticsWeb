import SelectControl from '../components/SelectControl';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion as Motion } from 'framer-motion';
import JobManagementService from '../services/jobManagementService';
import CustomerService from '../services/customerService';
import JobFormModal from '../components/JobFormModal';
import { customerView } from '../utils/legacyCustomer';
import JobChangeHistory, { ModifiedBadge } from '../components/JobChangeHistory';
import { useConfirm } from '../components/ConfirmProvider';
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
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import JobPhotos from '../components/JobPhotos';
import ServiceChecklist from '../components/ServiceChecklist';
import JobApplicationLog from '../components/JobApplicationLog';
import JobWorkDetails from '../components/JobWorkDetails';
import InvoiceCreationDialog from '../components/InvoiceCreationDialog';
import { canManage, can } from '../services/tenancy';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { formatCalendarDate } from '../utils/calendarDate';
import { useWorkspaceQuery, useInvalidateWorkspace } from '../hooks/useWorkspaceQuery';
import { summarizeJobs, inJobPeriod, calendarDay, jobDateRange } from '../utils/jobSummary';
import { workspaceAccessError } from '../services/workspaceQueryPolicy';

const statusInput = job => ({ status: job?.status || '', actualWorkDone: job?.actualWorkDone || '', actualHours: String(job?.actualHours ?? ''), completionNotes: job?.completionNotes || '', cancellationReason: job?.cancellationReason || '' });
const EMPTY=[];
const unknownStats=Object.fromEntries(Object.keys(summarizeJobs([])).map(key=>[key,'—']));
const deniedJobRead=error=>workspaceAccessError(error)||/job not found|not assigned to your workspace|unauthorized to access this job/i.test(error?.message||'');

const JobManagementPage = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();

  const handleCreateInvoice = job => {
    if (!can('invoices.manage')) return toast.error('Invoice access is required.');
    return transition(() => { setSelectedJob(job); setShowViewModal(false); setInvoiceSelection({ scopeId: jobsQuery.scopeId, jobId: job.id }); });
  };

  const jobsQuery=useWorkspaceQuery(['jobs',500],()=>JobManagementService.getJobs(500));
  const customersQuery=useWorkspaceQuery(['customers',500],()=>CustomerService.getCustomers(500));
  const invalidate=useInvalidateWorkspace();
  const jobs=jobsQuery.data?.jobs||EMPTY,customers=customersQuery.data?.customers||EMPTY;
  const setJobs=updater=>jobsQuery.setData(previous=>({...previous,jobs:typeof updater==='function'?updater(previous?.jobs||[]):updater}));
  const setCustomers=updater=>customersQuery.setData(previous=>({...previous,customers:typeof updater==='function'?updater(previous?.customers||[]):updater}));
  const [newJobScope,setNewJobScope]=useState(null);
  const showNewJob=jobsQuery.readable&&!deniedJobRead(jobsQuery.error)&&newJobScope===jobsQuery.scopeId;
  const setShowNewJob=value=>setNewJobScope(value?jobsQuery.scopeId:null);
  const [saving, setIsLoading] = useState(false);
  const isLoading=saving||(jobsQuery.isLoading&&!jobsQuery.data);
  const [searchTerm, setSearchTerm] = useState('');
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selection,setSelection]=useState(null);
  const [invoiceSelection,setInvoiceSelection]=useState(null);
  const invoiceJob=jobsQuery.readable&&!deniedJobRead(jobsQuery.error)&&invoiceSelection?.scopeId===jobsQuery.scopeId?invoiceSelection:null;
  const selectedSnapshot=jobsQuery.readable&&!deniedJobRead(jobsQuery.error)&&selection?.scopeId===jobsQuery.scopeId?selection.job:null;
  const setSelectedJob=value=>setSelection(value?{scopeId:jobsQuery.scopeId,job:value}:null);
  const detailQuery=useWorkspaceQuery(['job',selectedSnapshot?.id||null],()=>JobManagementService.getJob(selectedSnapshot.id),{enabled:showViewModal&&!!selectedSnapshot});
  const selectedJob=showViewModal?(detailQuery.readable&&!deniedJobRead(detailQuery.error)?detailQuery.data?.job||jobs.find(row=>row.id===selectedSnapshot?.id)||selectedSnapshot:null):selectedSnapshot;
  const todayKey=new Date().toLocaleDateString('en-CA');
  const stats=useMemo(()=>jobsQuery.data?summarizeJobs(jobs,calendarDay(todayKey)||new Date()):unknownStats,[jobsQuery.data,jobs,todayKey]);

  // Filter states
  const [activeFilter, setActiveFilter] = useState('all'); // all, scheduled, in-progress, completed, cancelled
  const [dateFilter, setDateFilter] = useState('all'); // all, today, week, month
  const [sortBy, setSortBy] = useState('date'); // date, status, customer, cost

  // Status update form
  const [statusData, setStatusData] = useState(() => statusInput(null));
  const [statusBaseline, setStatusBaseline] = useState(null);
  const statusSaving = useRef(false), localAction = useRef(0), live = useRef(false), currentJob = useRef(null), escapeAction = useRef(null), viewPanel = useRef(null), statusPanel = useRef(null);
  currentJob.current = selectedJob;
  const statusChanged = showStatusModal && JSON.stringify(statusData) !== JSON.stringify(statusBaseline);
  const { confirmDiscard } = useUnsavedChanges(statusChanged, { message: 'Your job status changes have not been saved. Leave without saving them?' });
  const transition = async action => {
    if (statusSaving.current) return;
    const ticket = ++localAction.current;
    if (await confirmDiscard() && live.current && ticket === localAction.current) action();
  };
  const resetStatus = () => { setShowStatusModal(false); setSelectedJob(null); setStatusData(statusInput(null)); setStatusBaseline(null); };
  const closeView = () => transition(() => { setShowViewModal(false); setSelectedJob(null); });
  const closeStatus = () => transition(resetStatus);
  escapeAction.current = showStatusModal ? closeStatus : showViewModal ? closeView : null;
  useEffect(() => {
    const lifecycle = localAction; live.current = true;
    const keydown = event => {
      if (event.key !== 'Escape' || event.defaultPrevented || !escapeAction.current) return;
      const panel = statusPanel.current || viewPanel.current;
      if ([...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(dialog => dialog !== panel && !panel?.contains(dialog))) return;
      event.preventDefault(); escapeAction.current();
    };
    window.addEventListener('keydown', keydown);
    return () => { live.current = false; lifecycle.current++; window.removeEventListener('keydown', keydown); };
  }, []);

  const refreshSavedCustomer = async (saved, metadata) => {
    if (!metadata?.customerAddressUpdated || !saved?.customerId) return;
    const result = metadata.customer ? { success: true, customer: metadata.customer } : await CustomerService.getCustomer(saved.customerId);
    if (!result.success || !result.customer) { toast.error('Job and customer address saved. Refresh the page to load the updated customer address.'); return; }
    const updated = customerView(saved.customerId, result.customer);
    setCustomers(rows => rows.map(customer => customer.id === updated.id ? updated : customer));
  };

  const filteredJobs = useMemo(() => {
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
    if (dateFilter !== 'all') filtered = filtered.filter(job=>inJobPeriod(job,dateFilter,calendarDay(todayKey)||new Date()));

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date': {
          const dateA = calendarDay(a.date),dateB=calendarDay(b.date);
          if ((dateA?.getTime()||0) === (dateB?.getTime()||0)) {
            return (a.time || '').localeCompare(b.time || '');
          }
          return (dateB?.getTime()||0)-(dateA?.getTime()||0);
        }
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

    return filtered;
  }, [jobs, searchTerm, activeFilter, dateFilter, sortBy,todayKey]);

  const handleStatusUpdate = async () => {
    if (statusSaving.current || !statusChanged || !selectedJob) return;
    if (!statusData.status) {
      toast.error('Please select a status');
      return;
    }

    const submittedJob = selectedJob, submitted = { ...statusData }; statusSaving.current = true; setIsLoading(true);
    try {
      const result = await JobManagementService.updateJobStatus(submittedJob.id, submitted.status, submitted);
      if (!live.current || currentJob.current?.id !== submittedJob.id) return;
      if (result.success) {
        setJobs(prev => prev.map(job => 
          job.id === submittedJob.id ? result.job : job
        ));
        localAction.current++; resetStatus();
        invalidate(['jobs','job','customer-stats']);
        toast.success('Job status updated successfully!');
      } else {
        toast.error(result.error || 'Job status was not saved. Your changes are retained.');
      }
    } catch (error) {
      if (live.current) toast.error(error.message || 'Job status was not saved. Your changes are retained.');
    }
    finally { statusSaving.current = false; if (live.current) setIsLoading(false); }
  };

  const handleDeleteJob = async (job) => {
    const jobId = job.id;
    const ok = await confirm({
      title: 'Delete this job?',
      message: `${job.serviceType || 'This job'} for ${job.customerName || 'this customer'} will be permanently removed. This can't be undone.`,
      confirmText: 'Delete job'
    });
    if (!ok) return;

    setIsLoading(true);
    try {
      const result = await JobManagementService.deleteJob(jobId);
      if (result.success) {
        setJobs(prev => prev.filter(job => job.id !== jobId));
        invalidate(['jobs','job','customer-stats']);
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

  const openViewModal = job => {
    if (showViewModal && selectedJob?.id === job.id) return;
    return transition(() => { setSelectedJob(job); setShowStatusModal(false); setShowEditModal(false); setShowNewJob(false); setShowViewModal(true); });
  };

  const openEditModal = job => transition(() => { setSelectedJob(job); setShowViewModal(false); setShowStatusModal(false); setShowNewJob(false); setShowEditModal(true); });

  const openStatusModal = job => transition(() => {
    const values = statusInput(job); setSelectedJob(job); setStatusData(values); setStatusBaseline(values); setShowViewModal(false); setShowEditModal(false); setShowNewJob(false); setShowStatusModal(true);
  });

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

  const getDateRange = filter => filter==='all'?null:jobDateRange(filter);

  const formatCurrency = (amount) => {
    if(amount==='—')return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
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

  return (
    <Motion.div
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
            {can('jobs.export') && <button
              onClick={exportJobs}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
              Export
            </button>}
            {canManage() && (
              <button
                onClick={() => setShowNewJob(true)}
                className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                New Job
              </button>
            )}
          </div>
        </div>
      </div>

      {(jobsQuery.error||customersQuery.error||(showViewModal&&detailQuery.error))&&<div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p>{jobsQuery.error?.message||customersQuery.error?.message||detailQuery.error?.message} {jobsQuery.data?'Previously loaded work stays visible while refresh is retried.':''}</p>
        <button type="button" className="mt-2 underline" onClick={()=>Promise.all([jobsQuery.refetch(),customersQuery.refetch(),...(showViewModal&&selectedSnapshot?[detailQuery.refetch()]:[])])}>Retry job refresh</button>
        {showViewModal&&!selectedJob&&<button type="button" className="ml-4 underline" onClick={closeView}>Close unavailable job</button>}
      </div>}
      {jobsQuery.data?.hasMore&&<p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Showing the first 500 jobs. Summary counts and totals apply to these loaded records.</p>}

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

        {can('reports.financial') && <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
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
        </div>}
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
            <SelectControl
              aria-label="Job status filter"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="all">All Status</option>
              <option value="scheduled">Scheduled</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </SelectControl>
            
            <SelectControl
              aria-label="Job date filter"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </SelectControl>
            
            <SelectControl
              aria-label="Job sort order"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="date">Sort by Date</option>
              <option value="status">Sort by Status</option>
              <option value="customer">Sort by Customer</option>
              <option value="cost">Sort by Cost</option>
            </SelectControl>
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
        ) : !jobsQuery.data ? <p role="status" className="p-6 text-sm text-gray-600">Jobs are not available yet. Retry the refresh when your workspace is ready.</p> : filteredJobs.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardDocumentListIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No jobs found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm ? 'Try adjusting your search terms.' : 'No jobs have been scheduled yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job Details</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schedule</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned To</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium"><button type="button" onClick={() => openViewModal(job)} aria-label={`View job details for ${job.customerName || 'Customer'} · ${job.serviceType || 'Service'}`} className="text-left text-primary-700 underline decoration-primary-300 underline-offset-2 hover:text-primary-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500">{job.serviceType || 'Service'}</button><ModifiedBadge job={job} /></div>
                        <div className="text-sm text-gray-500 flex items-center">
                          <MapPinIcon className="h-3 w-3 mr-1" />
                          {job.address || 'No address'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{job.customerName || 'Unknown'}</div>
                      <div className="text-sm text-gray-500">{job.customerPhone || ''}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatCalendarDate(job.date)}</div>
                      <div className="text-sm text-gray-500 flex items-center">
                        <ClockIcon className="h-3 w-3 mr-1" />
                        {formatTime(job.time)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(job.status)}`}>
                        {getStatusIcon(job.status)}
                        <span className="ml-1 capitalize">{job.status?.replace('-', ' ')}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{job.assignedToName || (job.assignedTo ? 'Assigned technician' : 'Unassigned')}</div>
                      {job.assignmentNeedsAttention && <div className="text-xs text-amber-800">Dispatcher review needed</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(job.totalCost)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => openViewModal(job)}
                          className="text-primary-600 hover:text-primary-900"
                          title="View Job"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        {canManage() && ['scheduled', 'in-progress'].includes(job.status) && (
                          <button
                            onClick={() => openEditModal(job)}
                            className="text-gray-600 hover:text-gray-900"
                            title="Edit Job"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => openStatusModal(job)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Update Status"
                        >
                          <CheckCircleIcon className="h-4 w-4" />
                        </button>
                        {canManage() && (
                          <button
                            onClick={() => handleDeleteJob(job)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete Job"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
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

      {/* View Job Modal */}
      {invoiceJob && <InvoiceCreationDialog key={`${invoiceJob.scopeId}:${invoiceJob.jobId}`} jobId={invoiceJob.jobId}
        onClose={() => { setInvoiceSelection(null); setShowViewModal(true); }}
        onOpenInvoice={id => { setInvoiceSelection(null); navigate(`/invoices?invoice=${encodeURIComponent(id)}`); }}
        onCreated={result => {
          setInvoiceSelection(null); toast.success(result.existing ? 'Opening existing invoice' : 'Draft invoice created');
          invalidate(['invoices', 'invoice', 'jobs', 'job', 'payments', 'analytics', 'reports', 'invoice-preview']).catch(() => toast.error('Invoice saved. Refresh the invoice list if it does not update.'));
          navigate(`/invoices?invoice=${encodeURIComponent(result.id || result.invoiceId)}`);
        }} />}
      {showViewModal && selectedJob && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div ref={viewPanel} role="dialog" aria-modal="true" aria-label="Job Details" className="relative top-10 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Job Details</h3>
                <button
                  onClick={closeView}
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
                  <h4 className="text-xl font-medium text-gray-900">{selectedJob.serviceType || 'Service'}</h4>
                  <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(selectedJob.status)}`}>
                      {getStatusIcon(selectedJob.status)}
                      <span className="ml-1 capitalize">{selectedJob.status?.replace('-', ' ')}</span>
                    </span>
                    <span>Created {formatCalendarDate(selectedJob.createdAt)}</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Customer</h5>
                    <p className="text-sm text-gray-900">{selectedJob.customerName || 'Not specified'}</p>
                    <p className="text-sm text-gray-500">{selectedJob.customerPhone || ''}</p>
                  </div>
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Assigned To</h5>
                    <p className="text-sm text-gray-900">{selectedJob.assignedToName || (selectedJob.assignedTo ? 'Assigned technician' : 'Unassigned')}</p>
                    {selectedJob.assignmentNeedsAttention && <p className="text-sm text-amber-800">{selectedJob.assignmentReview || 'Dispatcher review needed'}</p>}
                  </div>
                </div>
                
                <div>
                  <h5 className="text-sm font-medium text-gray-700">Address</h5>
                  <p className="text-sm text-gray-900">{selectedJob.address || 'Not specified'}</p>
                </div>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Date & Time</h5>
                    <p className="text-sm text-gray-900">{formatCalendarDate(selectedJob.date)} at {formatTime(selectedJob.time)}</p>
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
                
                <JobWorkDetails key={selectedJob.id} job={selectedJob} />

                <JobChangeHistory job={selectedJob} />
                <div className="border-t pt-4"><JobPhotos job={selectedJob} /><ServiceChecklist key={selectedJob.id} job={selectedJob} /></div>
                <div className="border-t pt-4"><JobApplicationLog job={selectedJob} /></div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                {can('invoices.manage') && selectedJob.status === 'completed' && (
                  <button
                    onClick={() => handleCreateInvoice(selectedJob)}
                    className="px-4 py-2 border border-primary-600 text-primary-700 rounded-md hover:bg-primary-50"
                  >
                    Create Invoice
                  </button>
                )}
                <button
                  onClick={closeView}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  onClick={() => openStatusModal(selectedJob)}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  Update Status
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {showStatusModal && selectedJob && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div ref={statusPanel} role="dialog" aria-modal="true" aria-label="Update Job Status" className="relative top-20 mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Update Job Status</h3>
                <button
                  onClick={closeStatus}
                  disabled={isLoading}
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
                  <SelectControl
                    disabled={isLoading}
                    value={statusData.status}
                    onChange={(e) => setStatusData(prev => ({ ...prev, status: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  >
                    <option value="">Select Status</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="in-progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </SelectControl>
                </div>
                
                {statusData.status === 'completed' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Actual Work Done</label>
                      <textarea
                        disabled={isLoading}
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
                        disabled={isLoading}
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
                        disabled={isLoading}
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
                      disabled={isLoading}
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
                  onClick={closeStatus}
                  disabled={isLoading}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStatusUpdate}
                  disabled={isLoading || !statusChanged}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Updating...' : 'Update Status'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedJob && (
        <JobFormModal
          job={selectedJob}
          customers={customers}
          onClose={() => { setShowEditModal(false); setSelectedJob(null); }}
          onCreated={async (saved, metadata) => {
            await refreshSavedCustomer(saved, metadata);
            if (!metadata?.keepOpen) { setShowEditModal(false); setSelectedJob(null); }
            if(saved?.id)setJobs(previous=>[saved,...previous.filter(row=>row.id!==saved.id)]);
            invalidate(['jobs','job','customers','customer-stats']);
          }}
        />
      )}

      {showNewJob && (
        <JobFormModal
          customers={customers}
          onClose={() => setShowNewJob(false)}
          onCreated={async (saved, metadata) => {
            await refreshSavedCustomer(saved, metadata);
            if (!metadata?.keepOpen) setShowNewJob(false);
            if(saved?.id)setJobs(previous=>[saved,...previous.filter(row=>row.id!==saved.id)]);
            invalidate(['jobs','job','customers','customer-stats']);
          }}
        />
      )}
    </Motion.div>
  );
};

export default JobManagementPage;
