import SelectControl from '../components/SelectControl';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { formatCustomerDate, legacyDate } from '../utils/legacyCustomer';
import { motion as Motion } from 'framer-motion';
import CustomerService from '../services/customerService';
import { useConfirm } from '../components/ConfirmProvider';
import { formatPhone } from '../utils/format';
import { 
  UsersIcon, 
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import CustomerImport from '../components/CustomerImport';
import CustomerSmsConsent from '../components/CustomerSmsConsent';
import AddressValidationNotice from '../components/AddressValidationNotice';
import { canManage, can } from '../services/tenancy';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useWorkspaceQuery, useInvalidateWorkspace } from '../hooks/useWorkspaceQuery';
import { workspaceAccessError } from '../services/workspaceQueryPolicy';

const customerForm = (customer = {}) => ({name:customer.name || '',email:customer.email || '',phone:formatPhone(customer.phone || ''),address:customer.address || '',city:customer.city || '',state:customer.state || '',zipCode:customer.zipCode || '',notes:customer.notes || '',isActive:customer.isActive !== false,emailConsent:customer.emailConsent === true});
const customerSnapshot = data => JSON.stringify(customerForm(data));
const EMPTY_CUSTOMERS = [];

const CustomerManagementPage = () => {
  const confirm = useConfirm();
  const [mutating, setIsLoading] = useState(false);
  const loadedPages = useRef(1), pageScope = useRef(null);
  const invalidate = useInvalidateWorkspace();
  const customerQuery = useWorkspaceQuery(['customers', 'pages'], async () => {
    let cursor = null, lastDoc = null, hasMore = false;
    const rows = [];
    for (let page = 0; page < loadedPages.current; page++) {
      const result = await CustomerService.getCustomers(100, cursor);
      if (!result.success) throw new Error(result.error || 'Customers could not be loaded.');
      rows.push(...result.customers); lastDoc = result.lastDoc; hasMore = result.hasMore;
      if (!hasMore || !lastDoc) break;
      cursor = lastDoc;
    }
    return { customers: [...new Map(rows.map(row => [row.id, row])).values()], lastDoc, hasMore };
  });
  if (pageScope.current !== customerQuery.scopeId) { pageScope.current = customerQuery.scopeId; loadedPages.current = 1; }
  const customers = customerQuery.data?.customers || EMPTY_CUSTOMERS;
  const hasMoreCustomers = customerQuery.data?.hasMore === true;
  const lastCustomer = customerQuery.data?.lastDoc || null;
  const isLoading = mutating || customerQuery.isPending;
  const setCustomers = updater => customerQuery.setData(previous => ({ ...previous, customers: typeof updater === 'function' ? updater(previous?.customers || []) : updater }));
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const emptyStats = {
    totalCustomers: 0,
    activeCustomers: 0,
    inactiveCustomers: 0,
    totalRevenue: 0
  };
  const statsQuery = useWorkspaceQuery(['customer-stats'], () => CustomerService.getCustomerStats(), { intervalMs: 300000, staleTime: 30000 });
  const stats = statsQuery.data?.stats || emptyStats;

  // Form states
  const [customerData, setCustomerData] = useState(customerForm);
  const [savedCustomer, setSavedCustomer] = useState(() => customerSnapshot(customerForm()));
  const [addressValidation, setAddressValidation] = useState(null);
  const editingCustomerVersion = useRef(null);
  const closing = useRef(false), saving = useRef(false);
  const formDirty = (showAddModal || showEditModal) && canManage() && customerSnapshot(customerData) !== savedCustomer;
  const { confirmDiscard } = useUnsavedChanges(formDirty, { message:'You have unsaved customer details. Leave without saving them?' });
  const closeEditor = useCallback(async () => {
    if(saving.current || closing.current)return;closing.current=true;
    try{if(formDirty && !(await confirmDiscard()))return;setShowAddModal(false);setShowEditModal(false);setSelectedCustomer(null);setAddressValidation(null);editingCustomerVersion.current=null;const empty=customerForm();setCustomerData(empty);setSavedCustomer(customerSnapshot(empty));}
    finally{closing.current=false;}
  },[formDirty,confirmDiscard]);
  useEffect(()=>{if(!showAddModal&&!showEditModal)return;const onKey=event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();closeEditor();}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[showAddModal,showEditModal,closeEditor]);

  // Filter states
  const [activeFilter, setActiveFilter] = useState('all'); // all, active, inactive
  const [sortBy, setSortBy] = useState('name'); // name, createdAt, totalSpent

  const loadCustomers = async (append = false) => {
    if (append) loadedPages.current++;
    const result = await customerQuery.refetch();
    if (result.error) { if (append) loadedPages.current = Math.max(1, loadedPages.current - 1); toast.error(result.error.message || 'Customers could not be loaded.'); }
  };
  const detailQuery = useWorkspaceQuery(['customer', selectedCustomer?.id], () => CustomerService.getCustomer(selectedCustomer.id), { enabled: showViewModal && !!selectedCustomer?.id });
  useEffect(() => {
    if (showViewModal && detailQuery.data?.customer) setSelectedCustomer(detailQuery.data.customer);
  }, [showViewModal, detailQuery.data]);
  useEffect(() => {
    if ([customerQuery.error, detailQuery.error].some(workspaceAccessError)) { setShowViewModal(false); setShowEditModal(false); setShowAddModal(false); setSelectedCustomer(null); setCustomerData(customerForm()); }
  }, [customerQuery.error, detailQuery.error]);

  const filteredCustomers = useMemo(() => {
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

    // Apply active/inactive filter
    if (activeFilter === 'active') {
      filtered = filtered.filter(customer => customer.isActive);
    } else if (activeFilter === 'inactive') {
      filtered = filtered.filter(customer => !customer.isActive);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        case 'createdAt':
          return (legacyDate(b.createdAt)?.getTime() || 0) - (legacyDate(a.createdAt)?.getTime() || 0);
        case 'totalSpent':
          return (b.totalSpent || 0) - (a.totalSpent || 0);
        default:
          return 0;
      }
    });

    return filtered;
  },[customers,searchTerm,activeFilter,sortBy]);

  const handleInputChange = (field, value) => {
    if (saving.current) return;
    setAddressValidation(null);
    setCustomerData(prev => ({
      ...prev,
      [field]: field === 'phone' ? formatPhone(value) : value
    }));
  };

  const resetForm = () => {
    setAddressValidation(null);editingCustomerVersion.current=null;
    const empty=customerForm();setCustomerData(empty);setSavedCustomer(customerSnapshot(empty));
  };

  const useSuggestedAddress = address => {
    if (saving.current) return;
    setCustomerData(previous => ({ ...previous, address, city: '', state: '', zipCode: '' }));
    setAddressValidation(null);
  };

  const handleAddCustomer = async () => {
    if (!canManage()) return toast.error('Your role does not allow customer changes.');
    if (!formDirty || saving.current || isLoading) return;
    if (!customerData.name.trim()) {
      toast.error('Customer name is required');
      return;
    }

    saving.current=true;setIsLoading(true);setAddressValidation(null);
    try {
      const result = await CustomerService.createCustomer(customerData);
      if (result.success) {
        setCustomers(prev => [result.customer, ...prev]);
        setShowAddModal(false);
        resetForm();
        invalidate(['customers', 'customer', 'customer-stats']);
        toast.success('Customer added successfully!');
      } else {
        setAddressValidation(result.addressValidation || null);
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error adding customer:', error);
      toast.error('Error adding customer');
    }
    saving.current=false;setIsLoading(false);
  };

  const handleEditCustomer = async () => {
    if (!canManage()) return toast.error('Your role does not allow customer changes.');
    if (!formDirty || saving.current || isLoading) return;
    if (!customerData.name.trim()) {
      toast.error('Customer name is required');
      return;
    }

    saving.current=true;setIsLoading(true);setAddressValidation(null);
    try {
      const result = await CustomerService.updateCustomer(selectedCustomer.id, customerData, editingCustomerVersion.current);
      if (result.success) {
        setCustomers(prev => prev.map(customer => 
          customer.id === selectedCustomer.id ? result.customer : customer
        ));
        setShowEditModal(false);
        setSelectedCustomer(null);
        resetForm();
        invalidate(['customers', 'customer', 'customer-stats']);
        toast.success('Customer updated successfully!');
      } else {
        setAddressValidation(result.addressValidation || null);
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error updating customer:', error);
      toast.error('Error updating customer');
    }
    saving.current=false;setIsLoading(false);
  };

  const handleDeleteCustomer = async (customerId) => {
    if (!canManage()) return toast.error('Your role does not allow customer changes.');
    const ok = await confirm({ title: 'Delete customer?', message: "This customer will be permanently removed. Their existing jobs and invoices are not deleted. This can't be undone.", confirmText: 'Delete customer' });
    if (!ok) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await CustomerService.deleteCustomer(customerId);
      if (result.success) {
        setCustomers(prev => prev.map(customer => 
          customer.id === customerId ? { ...customer, isActive: false } : customer
        ));
        invalidate(['customers', 'customer', 'customer-stats']);
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

  const handleRestoreCustomer = async (customerId) => {
    if (!canManage()) return toast.error('Your role does not allow customer changes.');
    setIsLoading(true);
    try {
      const result = await CustomerService.restoreCustomer(customerId);
      if (result.success) {
        setCustomers(prev => prev.map(customer => 
          customer.id === customerId ? { ...customer, isActive: true } : customer
        ));
        invalidate(['customers', 'customer', 'customer-stats']);
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
    if (!canManage()) return toast.error('Your role does not allow customer changes.');
    setSelectedCustomer(customer);
    editingCustomerVersion.current = typeof customer.updatedAt === 'string' ? customer.updatedAt : legacyDate(customer.updatedAt)?.toISOString() || null;
    setAddressValidation(null);
    const values=customerForm(customer);setCustomerData(values);setSavedCustomer(customerSnapshot(values));
    setShowEditModal(true);
  };

  const openViewModal = (customer) => {
    setSelectedCustomer(customer);
    setShowViewModal(true);
  };

  const exportCustomers = async () => {
    try {
      const result = await CustomerService.exportCustomers();
      if (result.success) {
        const blob = new Blob([result.csvData], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `customers-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        toast.success('Customers exported successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error exporting customers:', error);
      toast.error('Error exporting customers');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const formatDate = formatCustomerDate;

  return (
    <Motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      {can('customers.export') && <CustomerImport onComplete={() => invalidate(['customers', 'customer', 'customer-stats'])} />}
      {(customerQuery.error || statsQuery.error) && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-red-800">{(customerQuery.error || statsQuery.error).message} <button className="underline" onClick={() => { customerQuery.refetch(); statsQuery.refetch(); }}>Retry customer refresh</button></p>}
      {hasMoreCustomers && <div className="flex flex-wrap items-center gap-3 rounded border bg-white p-4"><p>Showing {customers.length} customers. Search and filters apply to loaded customers.</p><button disabled={isLoading} className="text-primary-700 underline" onClick={() => loadCustomers(true, lastCustomer)}>Load more customers</button></div>}
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
            {can('customers.export') && <button
              onClick={exportCustomers}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
              Export
            </button>}
            {canManage() && <button
              onClick={() => { resetForm(); setShowAddModal(true); }}
              className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Customer
            </button>}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <UsersIcon className="h-6 w-6 text-primary-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Customers</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.totalCustomers}</dd>
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
                  <dt className="text-sm font-medium text-gray-500 truncate">Active Customers</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.activeCustomers}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-6 w-6 bg-gray-400 rounded-full"></div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Inactive Customers</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.inactiveCustomers}</dd>
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
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Revenue</dt>
                  <dd className="text-lg font-medium text-gray-900">{formatCurrency(stats.totalRevenue)}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>}
      </div>

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
            <SelectControl
              aria-label="Customer status filter"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="all">All Customers</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </SelectControl>
            
            <SelectControl
              aria-label="Customer sort order"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="name">Sort by Name</option>
              <option value="createdAt">Sort by Date Added</option>
              {can('reports.financial') && <option value="totalSpent">Sort by Total Spent</option>}
            </SelectControl>
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Customers ({filteredCustomers.length})
          </h3>
        </div>
        
        {customerQuery.isPending && !customerQuery.data ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="text-center py-12">
            <UsersIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No customers found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm ? 'Try adjusting your search terms.' : canManage() ? 'Get started by adding your first customer.' : 'No customers are available.'}
            </p>
            {!searchTerm && canManage() && (
              <div className="mt-6">
                <button
                  onClick={() => { resetForm(); setShowAddModal(true); }}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Add Customer
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                  {can('reports.financial') && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Spent</th>}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <span className="text-sm font-medium text-gray-700">
                              {customer.name?.charAt(0)?.toUpperCase() || '?'}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{customer.name || 'Name not provided'}</div>
                          <div className="text-sm text-gray-500">Added {formatDate(customer.createdAt)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{customer.email || '-'}</div>
                      <div className="text-sm text-gray-500">{customer.phone || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {customer.address ? `${customer.address}, ${customer.city}, ${customer.state} ${customer.zipCode}` : '-'}
                      </div>
                    </td>
                    {can('reports.financial') && <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(customer.totalSpent)}
                    </td>}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        customer.isActive 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {customer.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => openViewModal(customer)}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        {canManage() && <button
                          onClick={() => openEditModal(customer)}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>}
                        {canManage() && (customer.isActive ? (
                          <button
                            onClick={() => handleDeleteCustomer(customer.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRestoreCustomer(customer.id)}
                            className="text-green-600 hover:text-green-900"
                          >
                            Restore
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      {canManage() && showAddModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-12 mx-auto p-6 border w-full max-w-xl shadow-xl rounded-xl bg-white">
            <div>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-gray-900">Add New Customer</h3>
                <button
                  onClick={closeEditor}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <fieldset disabled={isLoading} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name *</label>
                  <input
                    type="text"
                    value={customerData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
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
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Phone</label>
                    <input
                      type="tel"
                      value={customerData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
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
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
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
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      placeholder="Bakersfield"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">State</label>
                    <input
                      type="text"
                      value={customerData.state}
                      onChange={(e) => handleInputChange('state', e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      placeholder="CA"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">ZIP</label>
                    <input
                      type="text"
                      value={customerData.zipCode}
                      onChange={(e) => handleInputChange('zipCode', e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      placeholder="93311"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="mb-4 flex gap-2 text-sm"><input type="checkbox" checked={customerData.emailConsent === true} onChange={(e) => handleInputChange('emailConsent', e.target.checked)} />Customer has consented to invoice reminder emails</label>
                  <label className="block text-sm font-medium text-gray-700">Notes</label>
                  <textarea
                    value={customerData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="Additional notes about this customer..."
                  />
                </div>
              </fieldset>
              
              <AddressValidationNotice validation={addressValidation} onAccept={useSuggestedAddress} disabled={isLoading} />
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={closeEditor}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddCustomer}
                  disabled={isLoading || !formDirty}
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
      {canManage() && showEditModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-12 mx-auto p-6 border w-full max-w-xl shadow-xl rounded-xl bg-white">
            <div>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-gray-900">Edit Customer</h3>
                <button
                  onClick={closeEditor}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <fieldset disabled={isLoading} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name *</label>
                  <input
                    type="text"
                    value={customerData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
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
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Phone</label>
                    <input
                      type="tel"
                      value={customerData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
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
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
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
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      placeholder="Bakersfield"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">State</label>
                    <input
                      type="text"
                      value={customerData.state}
                      onChange={(e) => handleInputChange('state', e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      placeholder="CA"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">ZIP</label>
                    <input
                      type="text"
                      value={customerData.zipCode}
                      onChange={(e) => handleInputChange('zipCode', e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      placeholder="93311"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="mb-4 flex gap-2 text-sm"><input type="checkbox" checked={customerData.emailConsent === true} onChange={(e) => handleInputChange('emailConsent', e.target.checked)} />Customer has consented to invoice reminder emails</label>
                  <label className="block text-sm font-medium text-gray-700">Notes</label>
                  <textarea
                    value={customerData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="Additional notes about this customer..."
                  />
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
              </fieldset>
              
              <AddressValidationNotice validation={addressValidation} onAccept={useSuggestedAddress} disabled={isLoading} />
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={closeEditor}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditCustomer}
                  disabled={isLoading || !formDirty}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Saving...' : 'Save Changes'}
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
                    <h4 className="text-lg font-medium text-gray-900">{selectedCustomer.name || 'Name not provided'}</h4>
                    <p className="text-sm text-gray-500">Customer since {formatDate(selectedCustomer.createdAt)}</p>
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
                    {can('reports.financial') && <div>
                      <dt className="text-sm font-medium text-gray-500">Total Spent</dt>
                      <dd className="text-sm text-gray-900">{formatCurrency(selectedCustomer.totalSpent)}</dd>
                    </div>}
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
              {canManage() && <CustomerSmsConsent key={selectedCustomer.id} customer={selectedCustomer} />}
              
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
                {canManage() && <button
                  onClick={() => {
                    setShowViewModal(false);
                    openEditModal(selectedCustomer);
                  }}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  Edit Customer
                </button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </Motion.div>
  );
};

export default CustomerManagementPage;
