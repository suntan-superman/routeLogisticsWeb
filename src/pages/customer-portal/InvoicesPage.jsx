import React, { useState, useEffect } from 'react';
import { useCustomerPortal } from '../../contexts/CustomerPortalContext';
import { useAuthSafe } from '../../contexts/AuthContext';
import CustomerPortalService from '../../services/customerPortalService';
import { 
  DocumentTextIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  CheckCircleIcon,
  ClockIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const InvoicesPage = () => {
  const { customer, selectedCompanyId } = useCustomerPortal();
  const authContext = useAuthSafe();
  const currentUser = authContext?.currentUser || null;
  const userProfile = authContext?.userProfile || null;
  
  // Use customer from CustomerPortalContext if available, otherwise use userProfile from AuthContext
  const customerData = customer || (userProfile?.role === 'customer' ? userProfile : null);
  const effectiveCompanyId = selectedCompanyId || userProfile?.companyId;
  const [invoices, setInvoices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    if (customerData?.id) {
      loadInvoices();
    }
  }, [effectiveCompanyId, statusFilter, customerData?.id]);

  const loadInvoices = async () => {
    if (!customerData?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await CustomerPortalService.getCustomerInvoices(
        customerData.id,
        effectiveCompanyId,
        statusFilter === 'all' ? null : statusFilter
      );

      if (result.success) {
        setInvoices(result.invoices);
      } else {
        setError(result.error || 'Failed to load invoices');
        toast.error(result.error || 'Failed to load invoices');
      }
    } catch (err) {
      console.error('Error loading invoices:', err);
      setError('An error occurred while loading invoices');
      toast.error('An error occurred while loading invoices');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredInvoices = invoices.filter(invoice => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (invoice.invoiceNumber && invoice.invoiceNumber.toLowerCase().includes(searchLower)) ||
      (invoice.customerName && invoice.customerName.toLowerCase().includes(searchLower))
    );
  });

  const handleInvoiceClick = (invoice) => {
    setSelectedInvoice(invoice);
    setShowDetailsModal(true);
  };

  const totalAmount = filteredInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

  const getStatusColor = (status) => {
    const colors = {
      draft: 'bg-gray-50 text-gray-700 border-gray-200',
      sent: 'bg-blue-50 text-blue-700 border-blue-200',
      viewed: 'bg-purple-50 text-purple-700 border-purple-200',
      paid: 'bg-green-50 text-green-700 border-green-200',
      pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      overdue: 'bg-red-50 text-red-700 border-red-200'
    };
    return colors[status] || 'bg-gray-50 text-gray-700 border-gray-200';
  };

  const getStatusIcon = (status) => {
    const icons = {
      draft: '📝',
      sent: '📤',
      viewed: '👁️',
      paid: '✅',
      pending: '⏳',
      overdue: '⚠️'
    };
    return icons[status] || '📄';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Your Invoices</h1>
        <p className="mt-1 text-sm text-gray-600">
          View and manage your bills and payments
        </p>
      </div>

      {/* No Company Warning */}
      {!effectiveCompanyId && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <ExclamationTriangleIcon className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-yellow-900">No Service Company Associated</h3>
            <p className="mt-1 text-sm text-yellow-700">
              You haven't been associated with a service company yet. Once a company adds you as a customer, your invoices will appear here.
            </p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {!isLoading && !error && invoices.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryCard
            title="Total Invoices"
            value={invoices.length}
            icon={<DocumentTextIcon className="w-6 h-6" />}
            color="blue"
          />
          <SummaryCard
            title="Total Amount"
            value={CustomerPortalService.formatCurrency(totalAmount)}
            icon={<CurrencyDollarIcon className="w-6 h-6" />}
            color="green"
          />
          <SummaryCard
            title="Amount Pending"
            value={CustomerPortalService.formatCurrency(
              invoices
                .filter(inv => inv.status === 'pending' || inv.status === 'overdue')
                .reduce((sum, inv) => sum + (inv.total || 0), 0)
            )}
            icon={<ClockIcon className="w-6 h-6" />}
            color="yellow"
          />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        {/* Search */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search Invoices
          </label>
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by invoice number or customer..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:border-green-500 focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
            />
          </div>
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Filter by Status
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'all', label: 'All Invoices' },
              { value: 'pending', label: '⏳ Pending' },
              { value: 'overdue', label: '⚠️ Overdue' },
              { value: 'paid', label: '✅ Paid' },
              { value: 'draft', label: '📝 Draft' }
            ].map(option => (
              <button
                key={option.value}
                onClick={() => setStatusFilter(option.value)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  statusFilter === option.value
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block">
              <div className="w-12 h-12 border-4 border-green-200 border-t-green-600 rounded-full animate-spin" />
            </div>
            <p className="mt-4 text-gray-600 font-medium">Loading your invoices...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700 font-medium">{error}</p>
          <button
            onClick={loadInvoices}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredInvoices.length === 0 && (
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
          <DocumentTextIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices found</h3>
          <p className="text-gray-600">
            {searchTerm
              ? 'Try adjusting your search terms'
              : 'You don\'t have any invoices yet'}
          </p>
        </div>
      )}

      {/* Invoices List */}
      {!isLoading && !error && filteredInvoices.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Showing {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''}
          </p>
          <div className="grid gap-4">
            {filteredInvoices.map(invoice => (
              <InvoiceCard
                key={invoice.id}
                invoice={invoice}
                onViewDetails={() => handleInvoiceClick(invoice)}
                getStatusColor={getStatusColor}
                getStatusIcon={getStatusIcon}
              />
            ))}
          </div>
        </div>
      )}

      {/* Invoice Details Modal */}
      {showDetailsModal && selectedInvoice && (
        <InvoiceDetailsModal
          invoice={selectedInvoice}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedInvoice(null);
          }}
          getStatusColor={getStatusColor}
          getStatusIcon={getStatusIcon}
        />
      )}
    </div>
  );
};

/**
 * Summary Card Component
 */
function SummaryCard({ title, value, icon, color }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600'
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

/**
 * Invoice Card Component
 */
function InvoiceCard({ invoice, onViewDetails, getStatusColor, getStatusIcon }) {
  return (
    <button
      onClick={onViewDetails}
      className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg hover:border-gray-300 transition-all text-left"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900">{invoice.invoiceNumber}</h3>
          <p className="text-sm text-gray-600 mt-1">{invoice.customerName}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(invoice.status)}`}>
          {getStatusIcon(invoice.status)} {invoice.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <CurrencyDollarIcon className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium text-gray-900">{CustomerPortalService.formatCurrency(invoice.total)}</span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 flex-shrink-0" />
          <span>Due {CustomerPortalService.formatDate(invoice.dueDate)}</span>
        </div>
        {invoice.paidDate && (
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-4 h-4 flex-shrink-0 text-green-600" />
            <span>Paid {CustomerPortalService.formatDate(invoice.paidDate)}</span>
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-500">
        Click to view details
      </div>
    </button>
  );
}

/**
 * Invoice Details Modal Component
 */
function InvoiceDetailsModal({ invoice, onClose, getStatusColor, getStatusIcon }) {
  const handleDownloadPDF = () => {
    toast.promise(
      (async () => {
        // TODO: Implement PDF download
        await new Promise(resolve => setTimeout(resolve, 500));
      })(),
      {
        loading: 'Preparing PDF...',
        success: 'Invoice downloaded!',
        error: 'Failed to download invoice'
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">{invoice.invoiceNumber}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status and Amount */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Status</h3>
              <p className={`mt-2 px-3 py-1 rounded-full text-sm font-medium border inline-block ${getStatusColor(invoice.status)}`}>
                {getStatusIcon(invoice.status)} {invoice.status}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Amount</h3>
              <p className="mt-2 text-2xl font-bold text-gray-900">{CustomerPortalService.formatCurrency(invoice.total)}</p>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Invoice Date</h3>
              <p className="mt-2 text-lg text-gray-900">
                {CustomerPortalService.formatDate(invoice.createdAt)}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Due Date</h3>
              <p className="mt-2 text-lg text-gray-900">
                {CustomerPortalService.formatDate(invoice.dueDate)}
              </p>
            </div>
          </div>

          {/* Bill To */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Bill To</h3>
            <div className="text-gray-900">
              <p className="font-medium">{invoice.customerName}</p>
              {invoice.customerPhone && <p className="text-sm">{invoice.customerPhone}</p>}
            </div>
          </div>

          {/* Line Items */}
          {invoice.items && invoice.items.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Line Items</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Description</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Qty</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Price</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {invoice.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">{item.quantity}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">
                          {CustomerPortalService.formatCurrency(item.unitPrice)}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                          {CustomerPortalService.formatCurrency(item.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="text-gray-900">{CustomerPortalService.formatCurrency(invoice.amount)}</span>
            </div>
            {invoice.tax > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tax</span>
                <span className="text-gray-900">{CustomerPortalService.formatCurrency(invoice.tax)}</span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-2 flex justify-between font-medium">
              <span className="text-gray-900">Total</span>
              <span className="text-lg text-gray-900">{CustomerPortalService.formatCurrency(invoice.total)}</span>
            </div>
          </div>

          {/* Paid Amount */}
          {invoice.paidAmount > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-700 font-medium">
                Paid: {CustomerPortalService.formatCurrency(invoice.paidAmount)}
              </p>
              {invoice.paidDate && (
                <p className="text-xs text-green-600 mt-1">
                  on {CustomerPortalService.formatDate(invoice.paidDate)}
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          {invoice.notes && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Notes</h3>
              <p className="text-gray-700 text-sm whitespace-pre-line">{invoice.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex gap-3">
          <button
            onClick={handleDownloadPDF}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            <ArrowDownTrayIcon className="w-5 h-5" />
            Download PDF
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default InvoicesPage;

