import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import InvoiceService from '../services/invoiceService';
import JobManagementService from '../services/jobManagementService';
import { 
  DocumentTextIcon, 
  PlusIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  XCircleIcon
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

const InvoicePage = () => {
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [completedJobs, setCompletedJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [invoicePreviewUrl, setInvoicePreviewUrl] = useState(null);
  const [stats, setStats] = useState({
    totalInvoices: 0,
    drafted: 0,
    sent: 0,
    paid: 0,
    overdue: 0,
    totalRevenue: 0
  });
  const invoicesGridRef = useRef(null);
  const invoicesToolbarOptions = useMemo(() => ['Search', 'ExcelExport'], []);
  const invoicesPageSettings = useMemo(() => ({ pageSize: 25, pageSizes: [25, 50, 100, 200] }), []);
  const invoicesFilterSettings = useMemo(() => ({ type: 'Excel' }), []);

  // Filter states
  const [activeFilter, setActiveFilter] = useState('all'); // all, drafted, sent, paid, overdue
  const [sortBy, setSortBy] = useState('date'); // date, amount, status

  // Invoice form data
  const [invoiceData, setInvoiceData] = useState({
    paymentTerms: 'net30',
    taxRate: 0,
    notes: '',
    terms: ''
  });

  useEffect(() => {
    loadInvoices();
    loadStats();
  }, []);

  useEffect(() => {
    filterAndSortInvoices();
  }, [invoices, searchTerm, activeFilter, sortBy]);

  const loadInvoices = async () => {
    setIsLoading(true);
    try {
      const result = await InvoiceService.getInvoices(100);
      if (result.success) {
        setInvoices(result.invoices);
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error loading invoices:', error);
      toast.error('Error loading invoices');
    }
    setIsLoading(false);
  };

  const loadStats = async () => {
    try {
      const result = await InvoiceService.getInvoices(1000);
      if (result.success) {
        const invoices = result.invoices;
        const stats = {
          totalInvoices: invoices.length,
          drafted: invoices.filter(inv => inv.status === 'drafted').length,
          sent: invoices.filter(inv => inv.status === 'sent').length,
          paid: invoices.filter(inv => inv.status === 'paid').length,
          overdue: invoices.filter(inv => inv.status === 'overdue').length,
          totalRevenue: invoices
            .filter(inv => inv.status === 'paid')
            .reduce((sum, inv) => sum + (inv.total || 0), 0)
        };
        setStats(stats);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const filterAndSortInvoices = () => {
    let filtered = [...invoices];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(invoice => {
        const searchLower = searchTerm.toLowerCase();
        return (
          invoice.invoiceNumber?.toLowerCase().includes(searchLower) ||
          invoice.customerName?.toLowerCase().includes(searchLower) ||
          invoice.customerEmail?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply status filter
    if (activeFilter !== 'all') {
      filtered = filtered.filter(invoice => invoice.status === activeFilter);
    }

    // Apply sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.invoiceDate) - new Date(a.invoiceDate);
        case 'amount':
          return (b.total || 0) - (a.total || 0);
        case 'status':
          return a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });

    setFilteredInvoices(filtered);
  };

  const loadCompletedJobs = async () => {
    try {
      const result = await JobManagementService.getJobsByStatus('completed');
      if (result.success) {
        // Filter out jobs that already have invoices
        const jobsWithInvoices = new Set(invoices.map(inv => inv.jobId));
        const availableJobs = result.jobs.filter(job => !jobsWithInvoices.has(job.id));
        setCompletedJobs(availableJobs);
      }
    } catch (error) {
      console.error('Error loading completed jobs:', error);
      toast.error('Error loading completed jobs');
    }
  };

  const handleCreateInvoice = async () => {
    if (!selectedJob) {
      toast.error('Please select a job');
      return;
    }

    setIsLoading(true);
    try {
      const result = await InvoiceService.createInvoiceFromJob(selectedJob.id, {
        paymentTerms: invoiceData.paymentTerms,
        taxRate: invoiceData.taxRate,
        tax: calculateTax(selectedJob.totalCost || 0, invoiceData.taxRate),
        subtotal: selectedJob.totalCost || 0,
        notes: invoiceData.notes,
        terms: invoiceData.terms
      });

      if (result.success) {
        setInvoices(prev => [result.invoice, ...prev]);
        setShowCreateModal(false);
        setSelectedJob(null);
        setInvoiceData({
          paymentTerms: 'net30',
          taxRate: 0,
          notes: '',
          terms: ''
        });
        loadStats();
        toast.success('Invoice created successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error creating invoice:', error);
      toast.error('Error creating invoice');
    }
    setIsLoading(false);
  };

  const calculateTax = (subtotal, taxRate) => {
    return subtotal * (taxRate / 100);
  };

  const handleGeneratePDF = async (invoice) => {
    setIsLoading(true);
    try {
      const result = await InvoiceService.generatePDF(invoice);
      if (result.success && result.pdfBlob) {
        // Create download link
        const url = URL.createObjectURL(result.pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Invoice-${invoice.invoiceNumber}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success('PDF downloaded successfully!');
      } else {
        toast.error(result.error || 'Failed to generate PDF');
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error generating PDF');
    }
    setIsLoading(false);
  };

  const handlePreviewPDF = async (invoice) => {
    setIsLoading(true);
    try {
      const result = await InvoiceService.generatePDF(invoice);
      if (result.success && result.pdfUrl) {
        setInvoicePreviewUrl(result.pdfUrl);
        setSelectedInvoice(invoice);
        setShowPreviewModal(true);
      } else {
        toast.error(result.error || 'Failed to generate preview');
      }
    } catch (error) {
      console.error('Error generating preview:', error);
      toast.error('Error generating preview');
    }
    setIsLoading(false);
  };

  const handleSendInvoice = async (invoiceId, isResend = false) => {
    const confirmMessage = isResend 
      ? 'Resend this invoice to the customer via email?' 
      : 'Send this invoice to the customer via email?';
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await InvoiceService.sendInvoiceEmail(invoiceId);
      if (result.success) {
        await InvoiceService.updateInvoiceStatus(invoiceId, 'sent');
        await loadInvoices();
        toast.success(isResend ? 'Invoice resent successfully!' : 'Invoice sent successfully!');
      } else {
        toast.error(result.error || 'Failed to send invoice');
      }
    } catch (error) {
      console.error('Error sending invoice:', error);
      toast.error('Error sending invoice');
    }
    setIsLoading(false);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      drafted: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Drafted', icon: DocumentTextIcon },
      sent: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Sent', icon: PaperAirplaneIcon },
      viewed: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Viewed', icon: EyeIcon },
      paid: { bg: 'bg-green-100', text: 'text-green-800', label: 'Paid', icon: CheckCircleIcon },
      overdue: { bg: 'bg-red-100', text: 'text-red-800', label: 'Overdue', icon: ExclamationCircleIcon },
      cancelled: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Cancelled', icon: XCircleIcon }
    };

    const config = statusConfig[status] || statusConfig.drafted;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </span>
    );
  };

  const handleInvoicesToolbarClick = useCallback((args) => {
    if (!invoicesGridRef.current) return;
    const id = args.item?.id || '';
    if (id.includes('_excelexport')) {
      invoicesGridRef.current.excelExport({
        fileName: `invoices-${new Date().toISOString().split('T')[0]}.xlsx`
      });
    }
  }, []);

  const invoiceNumberTemplate = (props) => (
    <span className="text-sm font-medium text-gray-900">#{props.invoiceNumber}</span>
  );

  const invoiceCustomerTemplate = (props) => (
    <div className="space-y-1">
      <div className="text-sm text-gray-900">{props.customerName}</div>
      {props.customerEmail && <div className="text-xs text-gray-500">{props.customerEmail}</div>}
    </div>
  );

  const invoiceDateTemplate = (props) => (
    <span className="text-sm text-gray-800">{formatDate(props.invoiceDate)}</span>
  );

  const invoiceDueTemplate = (props) => (
    <span className="text-sm text-gray-800">{formatDate(props.dueDate)}</span>
  );

  const invoiceAmountTemplate = (props) => (
    <span className="text-sm font-semibold text-gray-900">{formatCurrency(props.total)}</span>
  );

  const invoiceStatusTemplate = (props) => getStatusBadge(props.status);

  const invoiceActionsTemplate = (props) => (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => handlePreviewPDF(props)}
        className="text-primary-600 hover:text-primary-900"
        title="Preview"
      >
        <EyeIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => handleGeneratePDF(props)}
        className="text-gray-600 hover:text-gray-900"
        title="Download PDF"
      >
        <ArrowDownTrayIcon className="h-5 w-5" />
      </button>
      {props.status === 'drafted' && (
        <button
          type="button"
          onClick={() => handleSendInvoice(props.id, false)}
          className="text-blue-600 hover:text-blue-900"
          title="Send Invoice"
        >
          <PaperAirplaneIcon className="h-5 w-5" />
        </button>
      )}
      {(props.status === 'sent' || props.status === 'viewed') && (
        <button
          type="button"
          onClick={() => handleSendInvoice(props.id, true)}
          className="text-green-600 hover:text-green-900"
          title="Resend Invoice"
        >
          <ArrowPathIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  );

  const invoicesNoRecordsTemplate = () => (
    <div className="p-8 text-center">
      <DocumentTextIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
      <p className="text-gray-500">No invoices found</p>
      <button
        type="button"
        onClick={openCreateModal}
        className="mt-4 text-primary-600 hover:text-primary-700 font-medium"
      >
        Create your first invoice
      </button>
    </div>
  );

  const openCreateModal = () => {
    setShowCreateModal(true);
    loadCompletedJobs();
  };

  const openViewModal = (invoice) => {
    setSelectedInvoice(invoice);
    setShowViewModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <DocumentTextIcon className="h-8 w-8 text-primary-500 mr-3" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Invoice Management</h1>
            <p className="text-gray-600">Create, manage, and send invoices</p>
          </div>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Create Invoice
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-6">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DocumentTextIcon className="h-6 w-6 text-primary-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Invoices</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.totalInvoices}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ClockIcon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Drafted</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.drafted}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <PaperAirplaneIcon className="h-6 w-6 text-blue-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Sent</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.sent}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircleIcon className="h-6 w-6 text-green-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Paid</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.paid}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ExclamationCircleIcon className="h-6 w-6 text-red-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Overdue</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.overdue}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
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
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search invoices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            >
              <option value="all">All Status</option>
              <option value="drafted">Drafted</option>
              <option value="sent">Sent</option>
              <option value="viewed">Viewed</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            >
              <option value="date">Sort by Date</option>
              <option value="amount">Sort by Amount</option>
              <option value="status">Sort by Status</option>
            </select>
          </div>
        </div>
      </div>

      {/* Invoices List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {isLoading && filteredInvoices.length === 0 ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Loading invoices...</p>
          </div>
        ) : (
          <div className="px-3 pb-4">
            <GridComponent
              id="invoicesGrid"
              dataSource={filteredInvoices}
              allowPaging
              allowSorting
              allowFiltering
              allowSelection
              allowExcelExport
              filterSettings={invoicesFilterSettings}
              toolbar={invoicesToolbarOptions}
              toolbarClick={handleInvoicesToolbarClick}
              selectionSettings={{ type: 'Single' }}
              pageSettings={invoicesPageSettings}
              height="520"
              ref={invoicesGridRef}
              noRecordsTemplate={invoicesNoRecordsTemplate}
            >
              <ColumnsDirective>
                <ColumnDirective
                  field="invoiceNumber"
                  headerText="Invoice #"
                  width="140"
                  template={invoiceNumberTemplate}
                />
                <ColumnDirective
                  field="customerName"
                  headerText="Customer"
                  width="220"
                  template={invoiceCustomerTemplate}
                />
                <ColumnDirective
                  field="invoiceDate"
                  headerText="Date"
                  width="140"
                  template={invoiceDateTemplate}
                />
                <ColumnDirective
                  field="dueDate"
                  headerText="Due Date"
                  width="140"
                  template={invoiceDueTemplate}
                />
                <ColumnDirective
                  field="total"
                  headerText="Amount"
                  width="130"
                  template={invoiceAmountTemplate}
                  textAlign="Right"
                />
                <ColumnDirective
                  field="status"
                  headerText="Status"
                  width="140"
                  template={invoiceStatusTemplate}
                  allowFiltering={false}
                />
                <ColumnDirective
                  headerText="Actions"
                  width="200"
                  template={invoiceActionsTemplate}
                  allowFiltering={false}
                  allowSorting={false}
                />
              </ColumnsDirective>
              <Inject services={[Page, Toolbar, Sort, Filter, ExcelExport, Selection, Search, Resize]} />
            </GridComponent>
          </div>
        )}
      </div>

      {/* Create Invoice Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={() => setShowCreateModal(false)}></div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Create Invoice</h3>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <XCircleIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Completed Job *
                    </label>
                    {completedJobs.length === 0 ? (
                      <p className="text-sm text-gray-500">No completed jobs available for invoicing.</p>
                    ) : (
                      <select
                        value={selectedJob?.id || ''}
                        onChange={(e) => {
                          const job = completedJobs.find(j => j.id === e.target.value);
                          setSelectedJob(job);
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      >
                        <option value="">-- Select a job --</option>
                        {completedJobs.map(job => (
                          <option key={job.id} value={job.id}>
                            {job.customerName} - {job.serviceType} - {formatCurrency(job.totalCost || 0)} - {formatDate(job.date)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {selectedJob && (
                    <>
                      <div className="bg-gray-50 p-4 rounded-md">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium text-gray-700">Customer:</span>
                            <p className="text-gray-900">{selectedJob.customerName}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Service:</span>
                            <p className="text-gray-900">{selectedJob.serviceType}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Amount:</span>
                            <p className="text-gray-900">{formatCurrency(selectedJob.totalCost || 0)}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Date:</span>
                            <p className="text-gray-900">{formatDate(selectedJob.date)}</p>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Payment Terms</label>
                        <select
                          value={invoiceData.paymentTerms}
                          onChange={(e) => setInvoiceData(prev => ({ ...prev, paymentTerms: e.target.value }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        >
                          <option value="dueOnReceipt">Due on Receipt</option>
                          <option value="net15">Net 15</option>
                          <option value="net30">Net 30</option>
                          <option value="net60">Net 60</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Tax Rate (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={invoiceData.taxRate}
                            onChange={(e) => {
                              const rate = parseFloat(e.target.value) || 0;
                              setInvoiceData(prev => ({ ...prev, taxRate: rate }));
                            }}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Tax Amount</label>
                          <input
                            type="text"
                            value={formatCurrency(calculateTax(selectedJob.totalCost || 0, invoiceData.taxRate))}
                            disabled
                            className="mt-1 block w-full rounded-md border-gray-300 bg-gray-50 shadow-sm sm:text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Notes</label>
                        <textarea
                          value={invoiceData.notes}
                          onChange={(e) => setInvoiceData(prev => ({ ...prev, notes: e.target.value }))}
                          rows={3}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                          placeholder="Additional notes for the invoice..."
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
              
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={handleCreateInvoice}
                  disabled={!selectedJob || isLoading}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Creating...' : 'Create Invoice'}
                </button>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && invoicePreviewUrl && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={() => {
              setShowPreviewModal(false);
              if (invoicePreviewUrl) {
                URL.revokeObjectURL(invoicePreviewUrl);
                setInvoicePreviewUrl(null);
              }
            }}></div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Invoice Preview</h3>
                  <button
                    onClick={() => {
                      setShowPreviewModal(false);
                      if (invoicePreviewUrl) {
                        URL.revokeObjectURL(invoicePreviewUrl);
                        setInvoicePreviewUrl(null);
                      }
                    }}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <XCircleIcon className="h-6 w-6" />
                  </button>
                </div>
                <iframe
                  src={invoicePreviewUrl}
                  className="w-full h-[600px] border border-gray-200 rounded"
                  title="Invoice Preview"
                />
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={() => handleGeneratePDF(selectedInvoice)}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Download PDF
                </button>
                <button
                  onClick={() => {
                    setShowPreviewModal(false);
                    if (invoicePreviewUrl) {
                      URL.revokeObjectURL(invoicePreviewUrl);
                      setInvoicePreviewUrl(null);
                    }
                  }}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoicePage;

