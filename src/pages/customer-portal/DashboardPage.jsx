import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomerPortal } from '../../contexts/CustomerPortalContext';
import { useAuthSafe } from '../../contexts/AuthContext';
import { 
  ArrowRightOnRectangleIcon,
  Cog6ToothIcon,
  CalendarIcon,
  DocumentTextIcon,
  StarIcon,
  BuildingOfficeIcon 
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const DashboardPage = () => {
  const navigate = useNavigate();
  const { customer, logout, companiesList, selectedCompanyId, selectCompany, extendSession } = useCustomerPortal();
  const authContext = useAuthSafe();
  const currentUser = authContext?.currentUser || null;
  const userProfile = authContext?.userProfile || null;
  
  // Use customer from CustomerPortalContext if available, otherwise use userProfile from AuthContext
  const customerData = customer || (userProfile?.role === 'customer' ? userProfile : null);
  const [upcomingJobsCount, setUpcomingJobsCount] = useState(0);
  const [completedJobsCount, setCompletedJobsCount] = useState(0);
  const [pendingInvoicesCount, setPendingInvoicesCount] = useState(0);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Extend session on activity
  useEffect(() => {
    const handleActivity = () => {
      extendSession();
    };

    window.addEventListener('click', handleActivity);
    window.addEventListener('keypress', handleActivity);

    return () => {
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keypress', handleActivity);
    };
  }, [extendSession]);

  // Load stats
  useEffect(() => {
    loadStats();
  }, [selectedCompanyId]);

  const loadStats = async () => {
    setIsLoadingStats(true);
    try {
      // TODO: Load stats from customerJobs and customerInvoices
      // For now, show placeholder
      setUpcomingJobsCount(0);
      setCompletedJobsCount(0);
      setPendingInvoicesCount(0);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Always use main auth logout (consolidated flow)
      if (authContext?.signOut) {
        await authContext.signOut();
        toast.success('Logged out successfully');
        navigate('/login');
      } else {
        toast.error('Unable to logout');
      }
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('An error occurred during logout');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Welcome, {customerData?.name || 'Customer'}!
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                {customerData?.email || currentUser?.email}
              </p>
            </div>

            {/* Top Right Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/customer-portal/profile')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <Cog6ToothIcon className="w-5 h-5" />
                Settings
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Company Selector */}
        {companiesList.length > 1 && (
          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select Company
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {companiesList.map((companyId) => (
                <button
                  key={companyId}
                  onClick={() => selectCompany(companyId)}
                  className={`p-4 rounded-lg border-2 transition-colors text-left ${
                    selectedCompanyId === companyId
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <BuildingOfficeIcon className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-900">{companyId}</span>
                  </div>
                  {selectedCompanyId === companyId && (
                    <p className="text-xs text-green-600 mt-2">✓ Selected</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard
            icon={<CalendarIcon className="w-6 h-6" />}
            title="Upcoming Jobs"
            value={upcomingJobsCount}
            color="blue"
            isLoading={isLoadingStats}
          />
          <StatCard
            icon={<CheckCircleIcon className="w-6 h-6" />}
            title="Completed Jobs"
            value={completedJobsCount}
            color="green"
            isLoading={isLoadingStats}
          />
          <StatCard
            icon={<DocumentTextIcon className="w-6 h-6" />}
            title="Pending Invoices"
            value={pendingInvoicesCount}
            color="orange"
            isLoading={isLoadingStats}
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ActionCard
            icon={<CalendarIcon className="w-8 h-8" />}
            title="View Jobs"
            description="See all your scheduled and completed services"
            onClick={() => navigate('/customer-portal/jobs')}
          />
          <ActionCard
            icon={<DocumentTextIcon className="w-8 h-8" />}
            title="View Invoices"
            description="View and manage your invoices and payments"
            onClick={() => navigate('/customer-portal/invoices')}
          />
          <ActionCard
            icon={<StarIcon className="w-8 h-8" />}
            title="Company Info"
            description="Learn more about your service provider"
            onClick={() => navigate('/customer-portal/company')}
          />
        </div>

        {/* Empty State */}
        {companiesList.length === 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
            <p className="text-blue-900 font-medium">
              No companies found. Your service provider will add you soon!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Stat Card Component
 */
function StatCard({ icon, title, value, color, isLoading }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-3xl font-bold text-gray-900">
            {isLoading ? '...' : value}
          </p>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

/**
 * Action Card Component
 */
function ActionCard({ icon, title, description, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-6 text-left hover:shadow-lg hover:border-gray-300 transition-all group"
    >
      <div className="flex items-start gap-4">
        <div className="p-3 bg-green-50 rounded-lg text-green-600 group-hover:bg-green-100 transition-colors">
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
        <div className="text-gray-400 group-hover:text-gray-600 transition-colors">
          →
        </div>
      </div>
    </button>
  );
}

// Import missing icon
import { CheckCircleIcon } from '@heroicons/react/24/outline';

export default DashboardPage;

