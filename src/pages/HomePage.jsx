import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import CompanyService from '../services/companyService';
import CustomerService from '../services/customerService';
import JobManagementService from '../services/jobManagementService';
import ReportingService from '../services/reportingService';
import TechnicianDashboard from '../components/TechnicianDashboard';
import { motion } from 'framer-motion';
import { 
  BuildingOfficeIcon, 
  UsersIcon, 
  DocumentTextIcon,
  ChartBarIcon,
  ClockIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline';

const HomePage = () => {
  const { userProfile } = useAuth();
  const { activeCompany, refreshKey } = useCompany();
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [stats, setStats] = useState({
    totalCustomers: null,
    activeJobs: null,
    monthlyRevenue: null,
    teamMembers: null,
  });

  useEffect(() => {
    const companyId = activeCompany?.id || userProfile?.companyId || null;

    if (!companyId) {
      setStats({
        totalCustomers: 0,
        activeJobs: 0,
        monthlyRevenue: 0,
        teamMembers: 0,
      });
      setStatsLoading(false);
      return;
    }

    let isCancelled = false;

    const loadStats = async () => {
      setStatsLoading(true);
      setStatsError(null);
      try {
        const includeTeamMetrics =
          userProfile?.role === 'admin' ||
          userProfile?.role === 'super_admin' ||
          userProfile?.role === 'supervisor';

        const [
          customerStatsResult,
          jobStatsResult,
          analyticsResult,
          teamResult
        ] = await Promise.all([
          CustomerService.getCustomerStats(userProfile, companyId),
          JobManagementService.getJobStats(),
          ReportingService.getBusinessAnalytics('month'),
          includeTeamMetrics
            ? CompanyService.getTeamMembers(companyId).catch(() => ({
                success: false,
                teamMembers: [],
              }))
            : Promise.resolve({ success: false, teamMembers: [] })
        ]);

        if (isCancelled) {
          return;
        }

        const totals = {
          totalCustomers: customerStatsResult.success
            ? customerStatsResult.stats.totalCustomers || 0
            : 0,
          activeJobs: jobStatsResult.success
            ? (jobStatsResult.stats.inProgressJobs || 0) + (jobStatsResult.stats.scheduledJobs || 0)
            : 0,
          monthlyRevenue: analyticsResult.success
            ? analyticsResult.analytics.totalRevenue || 0
            : (jobStatsResult.success ? jobStatsResult.stats.totalRevenue || 0 : 0),
          teamMembers: teamResult.success
            ? teamResult.teamMembers.length || 0
            : includeTeamMetrics
              ? 1
              : null
        };

        setStats(totals);

        if (!customerStatsResult.success || !jobStatsResult.success || !analyticsResult.success) {
          const errors = [
            customerStatsResult.success ? null : customerStatsResult.error,
            jobStatsResult.success ? null : jobStatsResult.error,
            analyticsResult.success ? null : analyticsResult.error
          ].filter(Boolean);
          if (errors.length) {
            setStatsError(errors[0]);
          }
        }
      } catch (error) {
        console.error('Error loading dashboard stats:', error);
        if (!isCancelled) {
          const message =
            error.code === 'permission-denied'
              ? 'You do not have permission to view company-wide metrics.'
              : error.message || 'Failed to load dashboard metrics.';
          setStatsError(message);
        }
      } finally {
        if (!isCancelled) {
          setStatsLoading(false);
        }
      }
    };

    loadStats();

    return () => {
      isCancelled = true;
    };
  }, [activeCompany?.id, refreshKey, userProfile?.companyId]);

  const formattedStats = useMemo(() => {
    const formatNumber = (value) => {
      if (statsLoading) return '…';
      if (value === null || value === undefined) return '0';
      return value.toLocaleString();
    };

    const formatCurrency = (value) => {
      if (statsLoading) return '…';
      if (!value) return '$0';
      return value.toLocaleString(undefined, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    };

    return {
      totalCustomers: formatNumber(stats.totalCustomers),
      activeJobs: formatNumber(stats.activeJobs),
      monthlyRevenue: formatCurrency(stats.monthlyRevenue),
      teamMembers: formatNumber(stats.teamMembers),
    };
  }, [stats, statsLoading]);

  const quickActions = [
    {
      name: 'Company Setup',
      description: 'Configure your business settings and branding',
      href: '/company-setup',
      icon: BuildingOfficeIcon,
      color: 'bg-primary-500',
    },
    {
      name: 'Manage Customers',
      description: 'Add and manage your customer database',
      href: '/customers',
      icon: UsersIcon,
      color: 'bg-green-500',
    },
    {
      name: 'Estimate Templates',
      description: 'Create and manage estimate templates',
      href: '/estimate-templates',
      icon: DocumentTextIcon,
      color: 'bg-purple-500',
    },
  ];

  const statCards = [
    { name: 'Total Customers', value: formattedStats.totalCustomers, icon: UsersIcon },
    { name: 'Active Jobs', value: formattedStats.activeJobs, icon: ClockIcon },
    { name: 'Revenue This Month', value: formattedStats.monthlyRevenue, icon: CurrencyDollarIcon },
    { name: 'Team Members', value: formattedStats.teamMembers, icon: BuildingOfficeIcon },
  ];

  // Show technician-specific dashboard for field techs
  const isFieldTech = userProfile?.role === 'field_tech' || userProfile?.role === 'technician';
  const isCustomer = userProfile?.role === 'customer' || !userProfile?.role || userProfile?.role === '';
  
  if (isFieldTech) {
    return <TechnicianDashboard userProfile={userProfile} />;
  }

  // Redirect customers to their portal
  if (isCustomer) {
    window.location.href = '/customer-portal';
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Redirecting to your customer portal...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
      >
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="h-12 w-12 bg-primary-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">RL</span>
            </div>
          </div>
          <div className="ml-4">
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back, {userProfile?.name || 'User'}!
            </h1>
            <p className="text-gray-600">
              Manage your field service business from one place
            </p>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      {statsError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-3">
          {statsError}
        </div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.name}
              className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200"
            >
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Icon className="h-6 w-6 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        {stat.name}
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {stat.value}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="bg-white rounded-lg shadow-sm border border-gray-200"
      >
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Quick Actions</h2>
          <p className="text-sm text-gray-500">
            Get started with these essential tasks
          </p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quickActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.name}
                  to={action.href}
                  className="group relative rounded-lg border border-gray-200 bg-white p-6 hover:shadow-md transition-shadow duration-200"
                >
                  <div className="flex items-center">
                    <div className={`flex-shrink-0 rounded-lg p-3 ${action.color}`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-sm font-medium text-gray-900 group-hover:text-primary-600 transition-colors duration-200">
                        {action.name}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {action.description}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Getting Started */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="bg-primary-50 rounded-lg border border-primary-200 p-6"
      >
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <ChartBarIcon className="h-6 w-6 text-primary-600" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-primary-800">
              Getting Started
            </h3>
            <div className="mt-2 text-sm text-primary-700">
              <p>
                Welcome to Route Logistics To get the most out of your field service management platform, 
                start by setting up your company profile and adding your first customers.
              </p>
            </div>
            <div className="mt-4">
              <Link
                to="/company-setup"
                className="text-sm font-medium text-primary-600 hover:text-primary-500 transition-colors duration-200"
              >
                Set up your company →
              </Link>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default HomePage;
