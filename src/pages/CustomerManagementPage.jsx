import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import CustomerService from '../services/customerService';
import QuickBooksService from '../services/quickbooksService';
import { geocodeAddress } from '../services/geocodingService';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { canApproveCustomers, canEditCustomers } from '../utils/permissions';
import { formatDate as formatDateHelper } from '../utils/dateHelpers';
import { 
  UsersIcon, 
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  FunnelIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { formatPhoneNumber } from '../utils/phoneFormatter';
import {
  GridComponent,
  ColumnsDirective,
  ColumnDirective,
  Page,
  Toolbar,
  Sort,
  Filter,
  ExcelExport,
  PdfExport,
  Selection,
  Search,
  Resize,
  Inject
} from '@syncfusion/ej2-react-grids';
import { CheckBoxComponent } from '@syncfusion/ej2-react-buttons';

const CustomerManagementPage = () => {
  const { userProfile, isSuperAdmin } = useAuth();
  const { getEffectiveCompanyId } = useCompany();
  const [customers, setCustomers] = useState([]);
  const [pendingCustomers, setPendingCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [stats, setStats] = useState({
    totalCustomers: 0,
    activeCustomers: 0,
    inactiveCustomers: 0,
    pendingCustomers: 0,
    totalRevenue: 0
  });

  // Form states
  const [customerData, setCustomerData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    notes: '',
    isActive: true,
    emailConsent: false, // Email consent for invoices
    latitude: null,
    longitude: null,
  });

  // Filter states
  const [activeFilter, setActiveFilter] = useState('all'); // all, active, inactive, pending, rejected
  const [sortBy, setSortBy] = useState('name'); // name, createdAt, totalSpent

  const { refreshKey } = useCompany();

  const buildFullAddress = (data) => {
    return [data.address, data.city, data.state, data.zipCode].filter(Boolean).join(', ');
  };

  useEffect(() => {
    loadCustomers();
    loadPendingCustomers();
    loadStats();
  }, [userProfile, refreshKey]);

  useEffect(() => {
    filterAndSortCustomers();
  }, [customers, searchTerm, activeFilter, sortBy]);

  const loadCustomers = async () => {
    setIsLoading(true);
    try {
      const companyId = getEffectiveCompanyId();
      const result = await CustomerService.getCustomers(1000, null, {}, userProfile, companyId);
      if (result.success) {
        setCustomers(result.customers);
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error loading customers:', error);
      toast.error('Error loading customers');
    }
    setIsLoading(false);
  };

  const loadPendingCustomers = async () => {
    if (!canApproveCustomers(userProfile)) return;
    
    setIsLoadingPending(true);
    try {
      const companyId = getEffectiveCompanyId();
      const result = await CustomerService.getPendingCustomers(companyId, userProfile);
      if (result.success) {
        setPendingCustomers(result.customers);
        // Update stats
        setStats(prev => ({ ...prev, pendingCustomers: result.customers.length }));
      }
    } catch (error) {
      console.error('Error loading pending customers:', error);
    }
    setIsLoadingPending(false);
  };

  const loadStats = async () => {
    try {
      const companyId = getEffectiveCompanyId();
      const result = await CustomerService.getCustomerStats(userProfile, companyId);
      if (result.success) {
        setStats(result.stats);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const filterAndSortCustomers = () => {
    let filtered = [...customers];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(customer => {
        const searchLower = searchTerm.toLowerCase();
        return (
          customer.name?.toLowerCase().includes(searchLower) ||
          customer.email?.toLowerCase().includes(searchLower) ||
          customer.phone?.includes(searchTerm) ||
          customer.address?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply active/inactive/status filter
    if (activeFilter === 'active') {
      filtered = filtered.filter(customer => customer.isActive && customer.status === 'approved');
    } else if (activeFilter === 'inactive') {
      filtered = filtered.filter(customer => !customer.isActive);
    } else if (activeFilter === 'pending') {
      filtered = filtered.filter(customer => customer.status === 'pending');
    } else if (activeFilter === 'rejected') {
      filtered = filtered.filter(customer => customer.status === 'rejected');
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        case 'createdAt':
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        case 'totalSpent':
          return (b.totalSpent || 0) - (a.totalSpent || 0);
        default:
          return 0;
      }
    });

    setFilteredCustomers(filtered);
  };

  const handleInputChange = (field, value) => {
    setCustomerData(prev => ({
      ...prev,
      [field]: value,
      ...(field === 'address' || field === 'city' || field === 'state' || field === 'zipCode'
        ? { latitude: null, longitude: null }
        : {}),
    }));
  };

  const resetForm = () => {
    setCustomerData({
      name: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      notes: '',
      isActive: true,
      emailConsent: false,
      latitude: null,
      longitude: null,
    });
  };

  const handleAddCustomer = async () => {
    if (!customerData.name.trim()) {
      toast.error('Customer name is required');
      return;
    }

    setIsLoading(true);
    try {
      let { latitude, longitude } = customerData;

      if (
        (!latitude && latitude !== 0) ||
        (!longitude && longitude !== 0)
      ) {
        const fullAddress = buildFullAddress(customerData);
        if (fullAddress) {
          const geocodeResult = await geocodeAddress(fullAddress);
          if (geocodeResult.success) {
            latitude = geocodeResult.latitude;
            longitude = geocodeResult.longitude;
          }
        }
      }

      const payload = {
        ...customerData,
        latitude: typeof latitude === 'number' ? latitude : null,
        longitude: typeof longitude === 'number' ? longitude : null,
      };

      const result = await CustomerService.createCustomer(payload, userProfile);
      if (result.success) {
        setCustomers(prev => [result.customer, ...prev]);
        setShowAddModal(false);
        resetForm();
        loadStats();
        
        // If pending, show different message and reload pending list
        if (result.customer.status === 'pending') {
          toast.success('Customer added! Pending admin approval.');
          loadPendingCustomers();
        } else {
          toast.success('Customer added successfully!');
        }
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error adding customer:', error);
      toast.error('Error adding customer');
    }
    setIsLoading(false);
  };

  const handleApproveCustomer = async (customerId) => {
    setIsLoading(true);
    try {
      const result = await CustomerService.approveCustomer(customerId, userProfile);
      if (result.success) {
        // Update customer in list
        setCustomers(prev => prev.map(c => 
          c.id === customerId ? { ...c, status: 'approved' } : c
        ));
        // Remove from pending list
        setPendingCustomers(prev => prev.filter(c => c.id !== customerId));
        loadStats();
        toast.success('Customer approved successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error approving customer:', error);
      toast.error('Error approving customer');
    }
    setIsLoading(false);
  };

  const handleRejectCustomer = async () => {
    if (!selectedCustomer) return;
    
    setIsLoading(true);
    try {
      const result = await CustomerService.rejectCustomer(
        selectedCustomer.id, 
        rejectionReason, 
        userProfile
      );
      if (result.success) {
        // Update customer in list
        setCustomers(prev => prev.map(c => 
          c.id === selectedCustomer.id ? { ...c, status: 'rejected' } : c
        ));
        // Remove from pending list
        setPendingCustomers(prev => prev.filter(c => c.id !== selectedCustomer.id));
        setShowRejectModal(false);
        setSelectedCustomer(null);
        setRejectionReason('');
        loadStats();
        toast.success('Customer rejected.');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error rejecting customer:', error);
      toast.error('Error rejecting customer');
    }
    setIsLoading(false);
  };

  const handleEditCustomer = async () => {
    if (!customerData.name.trim()) {
      toast.error('Customer name is required');
      return;
    }

    setIsLoading(true);
    try {
      let { latitude, longitude } = customerData;

      if (
        (!latitude && latitude !== 0) ||
        (!longitude && longitude !== 0)
      ) {
        const fullAddress = buildFullAddress(customerData);
        if (fullAddress) {
          const geocodeResult = await geocodeAddress(fullAddress);
          if (geocodeResult.success) {
            latitude = geocodeResult.latitude;
            longitude = geocodeResult.longitude;
          }
        }
      }

      const payload = {
        ...customerData,
        latitude: typeof latitude === 'number' ? latitude : null,
        longitude: typeof longitude === 'number' ? longitude : null,
      };

      const result = await CustomerService.updateCustomer(selectedCustomer.id, payload);
      if (result.success) {
        setCustomers(prev => prev.map(customer => 
          customer.id === selectedCustomer.id ? result.customer : customer
        ));
        setShowEditModal(false);
        setSelectedCustomer(null);
        resetForm();
        toast.success('Customer updated successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error updating customer:', error);
      toast.error('Error updating customer');
    }
    setIsLoading(false);
  };

  const handleDeleteCustomer = async (customerId) => {
    if (!window.confirm('Are you sure you want to delete this customer?')) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await CustomerService.deleteCustomer(customerId);
      if (result.success) {
        setCustomers(prev => prev.map(customer => 
          customer.id === customerId ? { ...customer, isActive: false } : customer
        ));
        loadStats();
        toast.success('Customer deleted successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error deleting customer:', error);
      toast.error('Error deleting customer');
    }
    setIsLoading(false);
  };

  const handleSyncToQuickBooks = async (customer) => {
    const companyId = getEffectiveCompanyId();
    if (!companyId) {
      toast.error('Company ID not found');
      return;
    }

    try {
      setIsLoading(true);
      const result = await QuickBooksService.syncCustomer(customer.id, companyId);
      
      if (result.success) {
        toast.success('Customer synced to QuickBooks successfully!');
        // Reload customers to update sync status
        await loadCustomers();
      } else {
        toast.error(result.error || 'Failed to sync customer to QuickBooks');
      }
    } catch (error) {
      console.error('Error syncing customer to QuickBooks:', error);
      toast.error(error.message || 'Error syncing customer to QuickBooks');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreCustomer = async (customerId) => {
    setIsLoading(true);
    try {
      const result = await CustomerService.restoreCustomer(customerId);
      if (result.success) {
        setCustomers(prev => prev.map(customer => 
          customer.id === customerId ? { ...customer, isActive: true } : customer
        ));
        loadStats();
        toast.success('Customer restored successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error restoring customer:', error);
      toast.error('Error restoring customer');
    }
    setIsLoading(false);
  };

  const openEditModal = (customer) => {
    setSelectedCustomer(customer);

    const latitude =
      typeof customer.latitude === 'number'
        ? customer.latitude
        : typeof customer.location?.latitude === 'number'
        ? customer.location.latitude
        : null;

    const longitude =
      typeof customer.longitude === 'number'
        ? customer.longitude
        : typeof customer.location?.longitude === 'number'
        ? customer.location.longitude
        : null;

    setCustomerData({
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      city: customer.city || '',
      state: customer.state || '',
      zipCode: customer.zipCode || '',
      notes: customer.notes || '',
      isActive: customer.isActive,
      emailConsent: customer.emailConsent || false,
      latitude,
      longitude,
    });
    setShowEditModal(true);
  };

  const openViewModal = (customer) => {
    setSelectedCustomer(customer);
    setShowViewModal(true);
  };

  const gridRef = useRef(null);

  const handleGridExport = () => {
    if (gridRef.current) {
      gridRef.current.excelExport({
        fileName: `customers-${new Date().toISOString().split('T')[0]}.xlsx`
      });
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

  const toolbarOptions = ['Search', 'ExcelExport', 'CsvExport'];
  const pageSettings = { pageSize: 50, pageSizes: [25, 50, 100, 200] };
  const gridFilterSettings = { type: 'Excel' };

  const handleToolbarClick = (args) => {
    if (!gridRef.current) return;
    const id = args.item?.id || '';
    if (id.includes('_excelexport')) {
      gridRef.current.excelExport({
        fileName: `customers-${new Date().toISOString().split('T')[0]}.xlsx`
      });
    } else if (id.includes('_csvexport')) {
      gridRef.current.csvExport({
        fileName: `customers-${new Date().toISOString().split('T')[0]}.csv`
      });
    }
  };

  const customerNameTemplate = (props) => (
    <div className="flex items-center">
      <div className="flex-shrink-0 h-10 w-10">
        <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
          <span className="text-sm font-medium text-gray-700">
            {(props.name?.charAt(0) || '?').toUpperCase()}
          </span>
        </div>
      </div>
      <div className="ml-4">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-gray-900">{props.name || 'Unnamed'}</div>
          {props.status === 'pending' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
              <ClockIcon className="w-3 h-3 mr-1" />
              Pending
            </span>
          )}
          {props.status === 'rejected' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
              <XCircleIcon className="w-3 h-3 mr-1" />
              Rejected
            </span>
          )}
          {props.status === 'approved' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
              <CheckCircleIcon className="w-3 h-3 mr-1" />
              Approved
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {props.createdAt ? `Added ${formatDate(props.createdAt)}` : '—'}
        </div>
      </div>
    </div>
  );

  const contactTemplate = (props) => (
    <div>
      <div className="text-sm text-gray-900">{props.email || '-'}</div>
      <div className="text-sm text-gray-500">{props.phone || '-'}</div>
    </div>
  );

  const locationTemplate = (props) => {
    if (!props.address) {
      return <div className="text-sm text-gray-500">-</div>;
    }
    return (
      <div className="text-sm text-gray-900">
        {[props.address, props.city, props.state, props.zipCode].filter(Boolean).join(', ')}
      </div>
    );
  };

  const totalSpentTemplate = (props) => (
    <div className="text-sm text-gray-900 text-right">{formatCurrency(props.totalSpent)}</div>
  );

  const activeStatusTemplate = (props) => (
    <span
      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
        props.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
      }`}
    >
      {props.isActive ? 'Active' : 'Inactive'}
    </span>
  );

  const actionsTemplate = (props) => (
    <div className="flex space-x-2">
      <button
        type="button"
        onClick={() => openViewModal(props)}
        className="text-primary-600 hover:text-primary-900"
        title="View"
      >
        <EyeIcon className="h-4 w-4" />
      </button>
      {canEditCustomers(userProfile, props) && (
        <button
          type="button"
          onClick={() => openEditModal(props)}
          className="text-gray-600 hover:text-gray-900"
          title="Edit"
        >
          <PencilIcon className="h-4 w-4" />
        </button>
      )}
      {props.status === 'pending' && canApproveCustomers(userProfile) && (
        <>
          <button
            type="button"
            onClick={() => handleApproveCustomer(props.id)}
            disabled={isLoading}
            className="text-green-600 hover:text-green-900 disabled:opacity-50"
            title="Approve"
          >
            <CheckCircleIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedCustomer(props);
              setShowRejectModal(true);
            }}
            disabled={isLoading}
            className="text-red-600 hover:text-red-900 disabled:opacity-50"
            title="Reject"
          >
            <XCircleIcon className="h-4 w-4" />
          </button>
        </>
      )}
      {canApproveCustomers(userProfile) && props.isActive && (
        <button
          type="button"
          onClick={() => handleDeleteCustomer(props.id)}
          className="text-red-600 hover:text-red-900"
          title="Delete"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      )}
      {!props.isActive && canApproveCustomers(userProfile) && (
        <button
          type="button"
          onClick={() => handleRestoreCustomer(props.id)}
          className="text-green-600 hover:text-green-900"
          title="Restore"
        >
          Restore
        </button>
      )}
      {(userProfile?.role === 'admin' || isSuperAdmin) && (
        <button
          type="button"
          onClick={() => handleSyncToQuickBooks(props)}
          className="text-green-600 hover:text-green-900 disabled:opacity-50"
          title={props.quickbooks_sync_status === 'synced' ? 'Synced to QuickBooks' : 'Sync to QuickBooks'}
          disabled={isLoading}
        >
          <ArrowPathIcon className={`h-4 w-4 ${props.quickbooks_sync_status === 'synced' ? 'text-green-600' : ''}`} />
        </button>
      )}
    </div>
  );

  const renderNoCustomerState = () => (
    <div className="text-center py-12 space-y-3">
      <UsersIcon className="mx-auto h-12 w-12 text-gray-400" />
      <h3 className="text-sm font-medium text-gray-900">No customers found</h3>
      <p className="text-sm text-gray-500">
        {searchTerm ? 'Try adjusting your search terms.' : 'Get started by adding your first customer.'}
      </p>
      {!searchTerm && (
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Customer
        </button>
      )}
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
            <UsersIcon className="h-8 w-8 text-primary-500 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Customer Management</h1>
              <p className="text-gray-600">Manage your customer database</p>
            </div>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleGridExport}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
              Export
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Customer
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-3">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <UsersIcon className="h-5 w-5 text-primary-500" />
              </div>
              <div className="ml-3 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-medium text-gray-500 truncate">Total Customers</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.totalCustomers}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-3">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-5 w-5 bg-green-500 rounded-full"></div>
              </div>
              <div className="ml-3 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-medium text-gray-500 truncate">Active Customers</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.activeCustomers}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-3">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-5 w-5 bg-gray-400 rounded-full"></div>
              </div>
              <div className="ml-3 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-medium text-gray-500 truncate">Inactive Customers</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.inactiveCustomers}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-3">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-5 w-5 bg-green-600 rounded-full"></div>
              </div>
              <div className="ml-3 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-medium text-gray-500 truncate">Total Revenue</dt>
                  <dd className="text-lg font-medium text-gray-900">{formatCurrency(stats.totalRevenue)}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {canApproveCustomers(userProfile) && (
          <div className="bg-white overflow-hidden shadow-sm rounded-lg border-2 border-yellow-400">
            <div className="p-3">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ClockIcon className="h-5 w-5 text-yellow-600" />
                </div>
                <div className="ml-3 w-0 flex-1">
                  <dl>
                    <dt className="text-xs font-medium text-gray-500 truncate">Pending Approval</dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.pendingCustomers}
                      {stats.pendingCustomers > 0 && (
                        <span className="ml-2 text-xs text-yellow-600 font-normal">Action Required</span>
                      )}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pending Customers Section (for admins/supervisors) */}
      {canApproveCustomers(userProfile) && pendingCustomers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-yellow-50 border-2 border-yellow-400 rounded-lg shadow-sm p-6 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <ExclamationTriangleIcon className="h-6 w-6 text-yellow-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">
                Pending Customer Approvals ({pendingCustomers.length})
              </h2>
            </div>
            <button
              onClick={() => setActiveFilter('pending')}
              className="text-sm text-yellow-700 hover:text-yellow-900 font-medium"
            >
              View All →
            </button>
          </div>
          
          <div className="space-y-3">
            {pendingCustomers.slice(0, 5).map((customer) => (
              <div
                key={customer.id}
                className="bg-white rounded-lg border border-yellow-200 p-4 flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{customer.name}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                      <ClockIcon className="w-3 h-3 mr-1" />
                      Pending
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {customer.email && <span>{customer.email}</span>}
                    {customer.email && customer.phone && <span className="mx-2">•</span>}
                    {customer.phone && <span>{customer.phone}</span>}
                    {customer.createdByRole === 'field_tech' && (
                      <span className="ml-2 text-xs text-gray-400">(Created by Field Tech)</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleApproveCustomer(customer.id)}
                    disabled={isLoading}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                  >
                    <CheckCircleIcon className="w-4 h-4 mr-1" />
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setShowRejectModal(true);
                    }}
                    disabled={isLoading}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                  >
                    <XCircleIcon className="w-4 h-4 mr-1" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
            {pendingCustomers.length > 5 && (
              <div className="text-center pt-2">
                <button
                  onClick={() => setActiveFilter('pending')}
                  className="text-sm text-yellow-700 hover:text-yellow-900 font-medium"
                >
                  View {pendingCustomers.length - 5} more pending customers →
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search customers by name, email, phone, or address..."
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
              <option value="all">All Customers</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
              {canApproveCustomers(userProfile) && (
                <>
                  <option value="pending">Pending Approval</option>
                  <option value="rejected">Rejected</option>
                </>
              )}
            </select>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="name">Sort by Name</option>
              <option value="createdAt">Sort by Date Added</option>
              <option value="totalSpent">Sort by Total Spent</option>
            </select>
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">
            Customers ({filteredCustomers.length})
          </h3>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
          </div>
        ) : (
          <div className="px-2 pb-4">
            {filteredCustomers.length === 0 ? (
              renderNoCustomerState()
            ) : (
              <GridComponent
                id="customersGrid"
                dataSource={filteredCustomers}
                allowPaging
                allowSorting
                allowFiltering
                allowSelection
                allowExcelExport
                allowPdfExport
                allowResizing
                filterSettings={gridFilterSettings}
                toolbar={toolbarOptions}
                toolbarClick={handleToolbarClick}
                selectionSettings={{ type: 'Single' }}
                pageSettings={pageSettings}
                height="600"
                ref={gridRef}
              >
                <ColumnsDirective>
                  <ColumnDirective
                    field="name"
                    headerText="Customer"
                    width="250"
                    template={customerNameTemplate}
                  />
                  <ColumnDirective
                    field="email"
                    headerText="Contact"
                    width="220"
                    template={contactTemplate}
                  />
                  <ColumnDirective
                    field="address"
                    headerText="Location"
                    width="260"
                    template={locationTemplate}
                  />
                  <ColumnDirective
                    field="totalSpent"
                    headerText="Total Spent"
                    width="140"
                    textAlign="Right"
                    template={totalSpentTemplate}
                    format="C2"
                  />
                  <ColumnDirective
                    field="isActive"
                    headerText="Status"
                    width="120"
                    template={activeStatusTemplate}
                    allowFiltering={false}
                  />
                  <ColumnDirective
                    headerText="Actions"
                    width="160"
                    template={actionsTemplate}
                    allowFiltering={false}
                    allowSorting={false}
                  />
                </ColumnsDirective>
                <Inject services={[Page, Toolbar, Sort, Filter, ExcelExport, PdfExport, Selection, Search, Resize]} />
              </GridComponent>
            )}
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-[576px] shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Add New Customer</h3>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
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
                {/* Row 1: Name and Email */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Name *</label>
                    <input
                      type="text"
                      value={customerData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="Enter customer name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      value={customerData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="email@example.com"
                    />
                  </div>
                </div>

                {/* Row 2: Phone (full width) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <input
                    type="tel"
                    value={customerData.phone}
                    onChange={(e) => {
                      const formatted = formatPhoneNumber(e.target.value);
                      handleInputChange('phone', formatted);
                    }}
                    maxLength={14}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="(555) 123-4567"
                  />
                </div>

                {/* Row 3: Address (full width) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Address</label>
                  <input
                    type="text"
                    value={customerData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="123 Main Street"
                  />
                </div>

                {/* Row 4: City, State, ZIP */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">City</label>
                    <input
                      type="text"
                      value={customerData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="Bakersfield"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">State</label>
                    <input
                      type="text"
                      value={customerData.state}
                      onChange={(e) => handleInputChange('state', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="CA"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">ZIP</label>
                    <input
                      type="text"
                      value={customerData.zipCode}
                      onChange={(e) => handleInputChange('zipCode', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="93311"
                    />
                  </div>
                </div>

                {/* Row 5: Notes (full width) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Notes</label>
                  <textarea
                    value={customerData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    rows={3}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="Additional notes about this customer..."
                  />
                </div>

                {/* Row 6: Email Consent Checkbox */}
                <div className="flex items-center pt-2">
                  <input
                    type="checkbox"
                    id="emailConsent"
                    checked={customerData.emailConsent}
                    onChange={(e) => handleInputChange('emailConsent', e.target.checked)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label htmlFor="emailConsent" className="ml-2 block text-sm text-gray-700">
                    Customer consents to receive invoices via email
                  </label>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddCustomer}
                  disabled={isLoading}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Adding...' : 'Add Customer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Edit Customer</h3>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedCustomer(null);
                    resetForm();
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
                  <label className="block text-sm font-medium text-gray-700">Name *</label>
                  <input
                    type="text"
                    value={customerData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="Enter customer name"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      value={customerData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Phone</label>
                    <input
                      type="tel"
                      value={customerData.phone}
                      onChange={(e) => {
                        const formatted = formatPhoneNumber(e.target.value);
                        handleInputChange('phone', formatted);
                      }}
                      maxLength={14}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Address</label>
                  <input
                    type="text"
                    value={customerData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="123 Main Street"
                  />
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">City</label>
                    <input
                      type="text"
                      value={customerData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="Bakersfield"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">State</label>
                    <input
                      type="text"
                      value={customerData.state}
                      onChange={(e) => handleInputChange('state', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="CA"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">ZIP</label>
                    <input
                      type="text"
                      value={customerData.zipCode}
                      onChange={(e) => handleInputChange('zipCode', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="93311"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Notes</label>
                  <textarea
                    value={customerData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    rows={3}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="Additional notes about this customer..."
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="editEmailConsent"
                    checked={customerData.emailConsent}
                    onChange={(e) => handleInputChange('emailConsent', e.target.checked)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label htmlFor="editEmailConsent" className="ml-2 block text-sm text-gray-700">
                    Customer consents to receive invoices via email
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={customerData.isActive}
                    onChange={(e) => handleInputChange('isActive', e.target.checked)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                    Active customer
                  </label>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedCustomer(null);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditCustomer}
                  disabled={isLoading}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Customer Modal */}
      {showRejectModal && selectedCustomer && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Reject Customer</h3>
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setSelectedCustomer(null);
                    setRejectionReason('');
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
                  <p className="text-sm text-gray-700 mb-2">
                    Are you sure you want to reject <strong>{selectedCustomer.name}</strong>?
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rejection Reason (Optional)
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={3}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="Enter reason for rejection..."
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setSelectedCustomer(null);
                    setRejectionReason('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectCustomer}
                  disabled={isLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Rejecting...' : 'Reject Customer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Customer Modal */}
      {showViewModal && selectedCustomer && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Customer Details</h3>
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setSelectedCustomer(null);
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
                <div className="flex items-center">
                  <div className="flex-shrink-0 h-12 w-12">
                    <div className="h-12 w-12 rounded-full bg-gray-300 flex items-center justify-center">
                      <span className="text-lg font-medium text-gray-700">
                        {selectedCustomer.name?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    </div>
                  </div>
                  <div className="ml-4">
                    <div className="flex items-center gap-2">
                      <h4 className="text-lg font-medium text-gray-900">{selectedCustomer.name || 'Unnamed'}</h4>
                      {selectedCustomer.status === 'pending' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                          <ClockIcon className="w-3 h-3 mr-1" />
                          Pending
                        </span>
                      )}
                      {selectedCustomer.status === 'rejected' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                          <XCircleIcon className="w-3 h-3 mr-1" />
                          Rejected
                        </span>
                      )}
                      {selectedCustomer.status === 'approved' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircleIcon className="w-3 h-3 mr-1" />
                          Approved
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">Customer since {formatDate(selectedCustomer.createdAt)}</p>
                    {selectedCustomer.status === 'pending' && selectedCustomer.createdByRole === 'field_tech' && (
                      <p className="text-xs text-gray-400 mt-1">Created by Field Technician - Awaiting approval</p>
                    )}
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Email</dt>
                      <dd className="text-sm text-gray-900">{selectedCustomer.email || 'Not provided'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Phone</dt>
                      <dd className="text-sm text-gray-900">{selectedCustomer.phone || 'Not provided'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Address</dt>
                      <dd className="text-sm text-gray-900">
                        {selectedCustomer.address ? 
                          `${selectedCustomer.address}, ${selectedCustomer.city}, ${selectedCustomer.state} ${selectedCustomer.zipCode}` : 
                          'Not provided'
                        }
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Total Spent</dt>
                      <dd className="text-sm text-gray-900">{formatCurrency(selectedCustomer.totalSpent)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Total Jobs</dt>
                      <dd className="text-sm text-gray-900">{selectedCustomer.totalJobs || 0}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Status</dt>
                      <dd className="text-sm">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          selectedCustomer.isActive 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {selectedCustomer.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </dd>
                    </div>
                    {selectedCustomer.notes && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Notes</dt>
                        <dd className="text-sm text-gray-900">{selectedCustomer.notes}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setSelectedCustomer(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    openEditModal(selectedCustomer);
                  }}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  Edit Customer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default CustomerManagementPage;
