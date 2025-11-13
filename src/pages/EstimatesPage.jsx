import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import EstimateService from '../services/estimateService';
import CustomerService from '../services/customerService';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { formatDate } from '../utils/dateHelpers';
import {
  DocumentTextIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  PaperAirplaneIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const EstimatesPage = () => {
  const { userProfile } = useAuth();
  const { getEffectiveCompanyId, refreshKey } = useCompany();
  const companyIdForEstimates = useMemo(
    () => (typeof getEffectiveCompanyId === 'function' ? getEffectiveCompanyId() : null),
    [getEffectiveCompanyId, refreshKey, userProfile?.companyId]
  );

  const [estimates, setEstimates] = useState([]);
  const [filteredEstimates, setFilteredEstimates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedEstimate, setSelectedEstimate] = useState(null);
  const [estimateMaterials, setEstimateMaterials] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    draft: 0,
    sent: 0,
    accepted: 0,
    rejected: 0,
    totalValue: 0
  });

  // Filter states
  const [activeFilter, setActiveFilter] = useState('all'); // all, draft, sent, accepted, rejected

  useEffect(() => {
    loadEstimates();
    loadStats();
  }, [companyIdForEstimates, userProfile]);

  useEffect(() => {
    filterEstimates();
  }, [estimates, searchTerm, activeFilter]);

  const loadEstimates = async () => {
    setIsLoading(true);
    try {
      const result = await EstimateService.getEstimates(1000, null, {}, userProfile, companyIdForEstimates);
      if (result.success) {
        setEstimates(result.estimates);
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error loading estimates:', error);
      toast.error('Error loading estimates');
    }
    setIsLoading(false);
  };

  const loadStats = async () => {
    try {
      const result = await EstimateService.getEstimateStats(companyIdForEstimates);
      if (result.success) {
        setStats(result.stats);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const filterEstimates = () => {
    let filtered = [...estimates];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(estimate => {
        const searchLower = searchTerm.toLowerCase();
        return (
          estimate.customerName?.toLowerCase().includes(searchLower) ||
          estimate.serviceType?.toLowerCase().includes(searchLower) ||
          estimate.estimateNumber?.toLowerCase().includes(searchLower) ||
          estimate.scopeOfWork?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply status filter
    if (activeFilter !== 'all') {
      filtered = filtered.filter(estimate => estimate.status === activeFilter);
    }

    setFilteredEstimates(filtered);
  };

  const openViewModal = async (estimate) => {
    setSelectedEstimate(estimate);
    setShowViewModal(true);
    
    // Load estimate materials
    try {
      const result = await EstimateService.getEstimateMaterials(estimate.id);
      if (result.success) {
        setEstimateMaterials(result.materials);
      }
    } catch (error) {
      console.error('Error loading estimate materials:', error);
    }
  };

  const handleDelete = async (estimateId) => {
    if (!window.confirm('Are you sure you want to delete this estimate?')) {
      return;
    }

    try {
      const result = await EstimateService.deleteEstimate(estimateId);
      if (result.success) {
        toast.success('Estimate deleted successfully');
        loadEstimates();
        loadStats();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error deleting estimate:', error);
      toast.error('Error deleting estimate');
    }
  };

  const handleStatusChange = async (estimateId, newStatus) => {
    try {
      const result = await EstimateService.updateEstimate(estimateId, { status: newStatus });
      if (result.success) {
        toast.success(`Estimate ${newStatus}`);
        loadEstimates();
        loadStats();
        if (selectedEstimate?.id === estimateId) {
          setSelectedEstimate({ ...selectedEstimate, status: newStatus });
        }
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error updating estimate status:', error);
      toast.error('Error updating estimate status');
    }
  };

  const handleDownloadPDF = async (estimate) => {
    try {
      toast.loading('Generating PDF...');
      const result = await EstimateService.generatePDF(estimate, estimateMaterials);
      toast.dismiss();
      
      if (result.success) {
        toast.success('PDF downloaded successfully');
      } else {
        toast.error(result.error || 'Failed to generate PDF');
      }
    } catch (error) {
      toast.dismiss();
      console.error('Error generating PDF:', error);
      toast.error('Error generating PDF');
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      draft: 'bg-gray-100 text-gray-800',
      sent: 'bg-blue-100 text-blue-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    };
    return badges[status] || badges.draft;
  };

  const getStatusIcon = (status) => {
    const icons = {
      draft: ClockIcon,
      sent: PaperAirplaneIcon,
      accepted: CheckCircleIcon,
      rejected: XCircleIcon
    };
    return icons[status] || ClockIcon;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Estimates</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage and track your estimates
            </p>
          </div>
          <button
            onClick={loadEstimates}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <ArrowPathIcon className={`w-5 h-5 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white overflow-hidden shadow rounded-lg"
        >
          <div className="p-3">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DocumentTextIcon className="h-5 w-5 text-gray-400" />
              </div>
              <div className="ml-3 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-medium text-gray-500 truncate">Total</dt>
                  <dd className="text-xl font-semibold text-gray-900">{stats.total}</dd>
                </dl>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white overflow-hidden shadow rounded-lg"
        >
          <div className="p-3">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ClockIcon className="h-5 w-5 text-gray-400" />
              </div>
              <div className="ml-3 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-medium text-gray-500 truncate">Draft</dt>
                  <dd className="text-xl font-semibold text-gray-600">{stats.draft}</dd>
                </dl>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white overflow-hidden shadow rounded-lg"
        >
          <div className="p-3">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <PaperAirplaneIcon className="h-5 w-5 text-blue-400" />
              </div>
              <div className="ml-3 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-medium text-gray-500 truncate">Sent</dt>
                  <dd className="text-xl font-semibold text-blue-600">{stats.sent}</dd>
                </dl>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white overflow-hidden shadow rounded-lg"
        >
          <div className="p-3">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircleIcon className="h-5 w-5 text-green-400" />
              </div>
              <div className="ml-3 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-medium text-gray-500 truncate">Accepted</dt>
                  <dd className="text-xl font-semibold text-green-600">{stats.accepted}</dd>
                </dl>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white overflow-hidden shadow rounded-lg"
        >
          <div className="p-3">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <XCircleIcon className="h-5 w-5 text-red-400" />
              </div>
              <div className="ml-3 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-medium text-gray-500 truncate">Rejected</dt>
                  <dd className="text-xl font-semibold text-red-600">{stats.rejected}</dd>
                </dl>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white overflow-hidden shadow rounded-lg"
        >
          <div className="p-3">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DocumentTextIcon className="h-5 w-5 text-primary-400" />
              </div>
              <div className="ml-3 w-0 flex-1">
                <dl>
                  <dt className="text-xs font-medium text-gray-500 truncate">Total Value</dt>
                  <dd className="text-xl font-semibold text-primary-600">{formatCurrency(stats.totalValue)}</dd>
                </dl>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search estimates..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div className="flex gap-2">
            {['all', 'draft', 'sent', 'accepted', 'rejected'].map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-4 py-2 text-sm font-medium rounded-md ${
                  activeFilter === filter
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Estimates List */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <p className="mt-2 text-sm text-gray-500">Loading estimates...</p>
          </div>
        ) : filteredEstimates.length === 0 ? (
          <div className="text-center py-12">
            <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No estimates found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm ? 'Try adjusting your search' : 'Get started by creating a new estimate'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {filteredEstimates.map((estimate) => {
              const StatusIcon = getStatusIcon(estimate.status);
              return (
                <li key={estimate.id}>
                  <div className="px-4 py-4 flex items-center sm:px-6 hover:bg-gray-50">
                    <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <p className="text-sm font-medium text-primary-600 truncate">
                            {estimate.estimateNumber}
                          </p>
                          <div className="ml-2 flex-shrink-0 flex">
                            <p className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(estimate.status)}`}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {estimate.status}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex">
                          <div className="flex items-center text-sm text-gray-500">
                            <p className="font-medium">{estimate.customerName}</p>
                            <span className="mx-2">•</span>
                            <p>{estimate.serviceType}</p>
                            <span className="mx-2">•</span>
                            <p className="font-semibold text-gray-900">{formatCurrency(estimate.totalCost)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex-shrink-0 sm:mt-0 sm:ml-5">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => openViewModal(estimate)}
                            className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                          >
                            <EyeIcon className="w-4 h-4 mr-1" />
                            View
                          </button>
                          <button
                            onClick={() => handleDelete(estimate.id)}
                            className="inline-flex items-center px-3 py-1.5 border border-red-300 shadow-sm text-xs font-medium rounded text-red-700 bg-white hover:bg-red-50"
                          >
                            <TrashIcon className="w-4 h-4 mr-1" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* View Estimate Modal */}
      {showViewModal && selectedEstimate && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Estimate Details</h3>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-6">
                {/* Header Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Estimate Number</p>
                    <p className="text-base text-gray-900">{selectedEstimate.estimateNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Status</p>
                    <div className="mt-1">
                      <select
                        value={selectedEstimate.status}
                        onChange={(e) => handleStatusChange(selectedEstimate.id, e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                      >
                        <option value="draft">Draft</option>
                        <option value="sent">Sent</option>
                        <option value="accepted">Accepted</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Customer Info */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Customer</h4>
                  <p className="text-base text-gray-700">{selectedEstimate.customerName}</p>
                </div>

                {/* Service Info */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Service Type</h4>
                  <p className="text-base text-gray-700">{selectedEstimate.serviceType}</p>
                </div>

                {/* Scope of Work */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Scope of Work</h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedEstimate.scopeOfWork}</p>
                </div>

                {/* Materials */}
                {estimateMaterials.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Materials</h4>
                    <div className="border rounded-md overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {estimateMaterials.map((material) => (
                            <tr key={material.id}>
                              <td className="px-4 py-2 text-sm text-gray-900">{material.materialName}</td>
                              <td className="px-4 py-2 text-sm text-gray-500">{material.quantity} {material.unit}</td>
                              <td className="px-4 py-2 text-sm text-gray-500">{formatCurrency(material.unitPrice)}</td>
                              <td className="px-4 py-2 text-sm font-medium text-gray-900">{formatCurrency(material.totalPrice)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Cost Breakdown */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Cost Breakdown</h4>
                  <div className="bg-gray-50 rounded-md p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Labor ({selectedEstimate.laborHours} hrs @ {formatCurrency(selectedEstimate.laborRate)}/hr)</span>
                      <span className="font-medium">{formatCurrency((selectedEstimate.laborHours || 0) * (selectedEstimate.laborRate || 0))}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Materials</span>
                      <span className="font-medium">{formatCurrency(selectedEstimate.materialCost)}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between text-base font-semibold">
                      <span>Total</span>
                      <span className="text-primary-600">{formatCurrency(selectedEstimate.totalCost)}</span>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {selectedEstimate.notes && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Notes</h4>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedEstimate.notes}</p>
                  </div>
                )}

                {/* Valid Until */}
                <div>
                  <p className="text-sm text-gray-500">
                    Valid until: {selectedEstimate.validUntil ? formatDate(selectedEstimate.validUntil) : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setShowViewModal(false)}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  onClick={() => handleDownloadPDF(selectedEstimate)}
                  className="px-4 py-2 bg-primary-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-primary-700"
                >
                  <DocumentArrowDownIcon className="w-4 h-4 inline mr-2" />
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EstimatesPage;

