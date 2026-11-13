import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CustomerService from '../services/customerService';
import JobManagementService from '../services/jobManagementService';
import EstimateTemplateService from '../services/estimateTemplateService';
import { motion } from 'framer-motion';
import { 
  BuildingOfficeIcon, 
  UsersIcon, 
  DocumentTextIcon,
  ChartBarIcon,
  ClockIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline';

const formatMoney = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const HomePage = () => {
  const { userProfile } = useAuth();
  const [counts, setCounts] = useState({ customers: 0, activeJobs: 0, monthRevenue: 0, templates: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cust, jobs, tmpl] = await Promise.all([
        CustomerService.getCustomerStats(),
        JobManagementService.getJobs(500),
        EstimateTemplateService.getTemplateStats()
      ]).catch(() => [null, null, null]);
      if (cancelled) return;
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const list = jobs?.success ? jobs.jobs : [];
      setCounts({
        customers: cust?.success ? cust.stats.totalCustomers : 0,
        activeJobs: list.filter(j => j.status === 'scheduled' || j.status === 'in-progress').length,
        monthRevenue: list
          .filter(j => j.status === 'completed' && String(j.date || '').startsWith(monthKey))
          .reduce((sum, j) => sum + (Number(j.totalCost) || 0), 0),
        templates: tmpl?.success ? tmpl.stats.totalTemplates : 0
      });
    })();
    return () => { cancelled = true; };
  }, []);

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

  const stats = [
    { name: 'Total Customers', value: String(counts.customers), icon: UsersIcon },
    { name: 'Active Jobs', value: String(counts.activeJobs), icon: ClockIcon },
    { name: 'Monthly Revenue', value: formatMoney(counts.monthRevenue), icon: CurrencyDollarIcon },
    { name: 'Estimate Templates', value: String(counts.templates), icon: DocumentTextIcon },
  ];

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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        {stats.map((stat, index) => {
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
                Welcome to Route Logistics! To get the most out of your field service management platform, 
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
