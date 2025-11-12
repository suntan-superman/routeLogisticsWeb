import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCustomerPortal } from '../contexts/CustomerPortalContext';
import CustomerPortalService from '../services/customerPortalService';
import { motion } from 'framer-motion';
import {
  HomeIcon,
  CalendarIcon,
  DocumentTextIcon,
  ClockIcon,
  CheckCircleIcon,
  StarIcon,
  PlusIcon,
  BuildingOfficeIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const CustomerPortalPage = () => {
  const { currentUser } = useAuth();
  const {
    loading: portalLoading,
    companies,
    activeCompany,
    customerRecord,
    hasMultipleCompanies,
    hasNoCompanies,
    switchCompany
  } = useCustomerPortal();

  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [recentJobs, setRecentJobs] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCompanySwitcher, setShowCompanySwitcher] = useState(false);
  const [showServiceRequestModal, setShowServiceRequestModal] = useState(false);

  useEffect(() => {
    if (!portalLoading && activeCompany && customerRecord) {
      loadDashboardData();
    }
  }, [portalLoading, activeCompany, customerRecord]);

  const loadDashboardData = async () => {
    if (!activeCompany || !customerRecord) return;

    setLoading(true);
    try {
      const [appointmentsResult, historyResult, requestsResult] = await Promise.all([
        CustomerPortalService.getUpcomingAppointments(customerRecord.id, activeCompany.id),
        CustomerPortalService.getServiceHistory(customerRecord.id, activeCompany.id),
        CustomerPortalService.getServiceRequests(customerRecord.id, activeCompany.id)
      ]);

      if (appointmentsResult.success) {
        setUpcomingAppointments(appointmentsResult.appointments || []);
      }

      if (historyResult.success) {
        setRecentJobs((historyResult.jobs || []).slice(0, 5));
      }

      if (requestsResult.success) {
        setPendingRequests(
          (requestsResult.requests || []).filter(r => r.status === 'pending')
        );
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Date TBD';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (time) => {
    if (!time) return 'Time TBD';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'scheduled':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      case 'scheduled':
        return 'Scheduled';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status || 'Unknown';
    }
  };

  if (portalLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your portal...</p>
        </div>
      </div>
    );
  }

  // No companies found
  if (hasNoCompanies) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center"
        >
          <HomeIcon className="mx-auto h-16 w-16 text-gray-400 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome to Your Customer Portal
          </h2>
          <p className="text-gray-600 mb-6">
            We couldn't find any active service accounts associated with{' '}
            <span className="font-medium">{currentUser?.email}</span>
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-left">
            <h3 className="text-sm font-medium text-blue-900 mb-2">What can I do?</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Contact your service provider to set up an account</li>
              <li>• Verify you're using the correct email address</li>
              <li>• Check if your account is active</li>
            </ul>
          </div>
        </motion.div>
      </div>
    );
  }

  // No company selected yet (multiple companies available)
  if (!activeCompany && hasMultipleCompanies) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8"
        >
          <BuildingOfficeIcon className="mx-auto h-16 w-16 text-primary-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
            Select Your Service Provider
          </h2>
          <p className="text-gray-600 mb-6 text-center">
            You have accounts with multiple service providers. Please select one to continue.
          </p>
          <div className="space-y-3">
            {companies.map((company) => (
              <button
                key={company.id}
                onClick={() => switchCompany(company)}
                className="w-full p-4 border border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-all text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{company.name}</h3>
                    {company.phone && (
                      <p className="text-sm text-gray-600">{company.phone}</p>
                    )}
                    {company.customerSince && (
                      <p className="text-xs text-gray-500 mt-1">
                        Customer since {new Date(company.customerSince).getFullYear()}
                      </p>
                    )}
                  </div>
                  <ChevronDownIcon className="h-5 w-5 text-gray-400 transform -rotate-90" />
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header with Company Switcher */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Welcome back, {customerRecord?.name || 'Customer'}!
              </h1>
              <p className="text-gray-600">
                Your service portal with {activeCompany?.name}
              </p>
            </div>
            {hasMultipleCompanies && (
              <div className="relative">
                <button
                  onClick={() => setShowCompanySwitcher(!showCompanySwitcher)}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  <BuildingOfficeIcon className="h-5 w-5 text-gray-400" />
                  <span className="text-sm font-medium">{activeCompany?.name}</span>
                  <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                </button>
                {showCompanySwitcher && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg border border-gray-200 z-10">
                    {companies.map((company) => (
                      <button
                        key={company.id}
                        onClick={() => {
                          switchCompany(company);
                          setShowCompanySwitcher(false);
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                          company.id === activeCompany?.id ? 'bg-primary-50' : ''
                        }`}
                      >
                        <div className="font-medium text-gray-900">{company.name}</div>
                        {company.phone && (
                          <div className="text-sm text-gray-600">{company.phone}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6"
        >
          <button
            onClick={() => setShowServiceRequestModal(true)}
            className="bg-primary-600 text-white rounded-lg p-6 hover:bg-primary-700 transition-colors"
          >
            <PlusIcon className="h-8 w-8 mx-auto mb-2" />
            <div className="font-medium">Request Service</div>
          </button>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            <CalendarIcon className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <div className="font-medium text-gray-900">{upcomingAppointments.length}</div>
            <div className="text-sm text-gray-600">Upcoming</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            <ClockIcon className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <div className="font-medium text-gray-900">{pendingRequests.length}</div>
            <div className="text-sm text-gray-600">Pending Requests</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            <CheckCircleIcon className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <div className="font-medium text-gray-900">{recentJobs.filter(j => j.status === 'completed').length}</div>
            <div className="text-sm text-gray-600">Completed</div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming Appointments */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-lg shadow-sm border border-gray-200"
          >
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Upcoming Appointments</h2>
            </div>
            <div className="p-6">
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : upcomingAppointments.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarIcon className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                  <p className="text-gray-600">No upcoming appointments</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingAppointments.map((appointment) => (
                    <div
                      key={appointment.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">{appointment.serviceType}</h3>
                          <div className="mt-2 space-y-1 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <CalendarIcon className="h-4 w-4" />
                              {formatDate(appointment.date)}
                            </div>
                            <div className="flex items-center gap-2">
                              <ClockIcon className="h-4 w-4" />
                              {formatTime(appointment.time)}
                            </div>
                          </div>
                          {appointment.assignedToName && (
                            <div className="mt-2 text-sm text-gray-500">
                              Technician: {appointment.assignedToName}
                            </div>
                          )}
                        </div>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(appointment.status)}`}>
                          {getStatusLabel(appointment.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* Recent Service History */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-lg shadow-sm border border-gray-200"
          >
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Recent Service History</h2>
            </div>
            <div className="p-6">
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : recentJobs.length === 0 ? (
                <div className="text-center py-8">
                  <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                  <p className="text-gray-600">No service history yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentJobs.map((job) => (
                    <div
                      key={job.id}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">{job.serviceType}</h3>
                          <div className="mt-1 text-sm text-gray-600">
                            {formatDate(job.date)}
                          </div>
                          {job.totalCost && (
                            <div className="mt-1 text-sm font-medium text-gray-900">
                              ${Number(job.totalCost).toFixed(2)}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(job.status)}`}>
                            {getStatusLabel(job.status)}
                          </span>
                          {job.status === 'completed' && !job.customerRating && (
                            <button className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
                              <StarIcon className="h-3 w-3" />
                              Rate Service
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default CustomerPortalPage;

