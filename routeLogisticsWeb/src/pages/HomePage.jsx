import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CustomerService from '../services/customerService';
import JobManagementService from '../services/jobManagementService';
import EstimateTemplateService from '../services/estimateTemplateService';
import { can } from '../services/tenancy';
import { motion as Motion } from 'framer-motion';
import { useWorkspaceQuery } from '../hooks/useWorkspaceQuery';
import { summarizeJobs, calendarDay } from '../utils/jobSummary';
import { callEstimate } from '../services/estimateService';
import { readWorkspace } from '../services/workspaceApi';
import { callWorkspace } from '../services/workspaceApi';
import { UsageMetrics } from '../components/CompanyUsage';
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
  const { userProfile, role } = useAuth();
  const canViewUsage=role==='owner'||role==='admin';
  const customersQuery=useWorkspaceQuery(['customer-stats'],()=>CustomerService.getCustomerStats());
  const jobsQuery=useWorkspaceQuery(['jobs',500],()=>JobManagementService.getJobs(500));
  const templatesQuery=useWorkspaceQuery(['template-stats'],()=>EstimateTemplateService.getTemplateStats());
  const estimateAttentionQuery=useWorkspaceQuery(['estimates','management-attention'],()=>callEstimate('list'),{enabled:can('estimates.manage')});
  const operationsAttentionQuery=useWorkspaceQuery(['management-attention'],()=>readWorkspace('managementAttention'),{enabled:can('dispatch.manage')});
  const usageQuery=useWorkspaceQuery(['company-usage'],()=>callWorkspace('rlCompanyUsage',{action:'company'}),{enabled:canViewUsage,intervalMs:false,staleTime:300000,refetchOnFocus:false});
  const todayKey=new Date().toLocaleDateString('en-CA');
  const counts=useMemo(()=>{const summary=jobsQuery.data?summarizeJobs(jobsQuery.data.jobs,calendarDay(todayKey)||new Date()):null;return{
    customers:customersQuery.data?.stats?.totalCustomers??null,activeJobs:summary?.activeJobs??null,
    monthRevenue:summary?.monthRevenue??null,templates:templatesQuery.data?.stats?.totalTemplates??null,
  };},[jobsQuery.data,customersQuery.data,templatesQuery.data,todayKey]);

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
    { name: 'Total Customers', value: counts.customers??'—', icon: UsersIcon },
    { name: 'Active Jobs', value: counts.activeJobs??'—', icon: ClockIcon },
    ...(can('reports.financial') ? [{ name: 'Monthly Revenue', value: counts.monthRevenue==null?'—':formatMoney(counts.monthRevenue), icon: CurrencyDollarIcon }] : []),
    { name: 'Estimate Templates', value: counts.templates??'—', icon: DocumentTextIcon },
  ];

  return (
    <div className="space-y-6">
      {can('estimates.manage') && !!((estimateAttentionQuery.data?.quoteNeededVisits?.length || 0) + (estimateAttentionQuery.data?.estimates || []).filter(row => row.status === 'submitted-for-review').length) && <Link to="/estimates" className="block rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 hover:bg-amber-100">
        <strong>Estimates need management attention</strong><span className="ml-2">{estimateAttentionQuery.data?.quoteNeededVisits?.length || 0} completed visits need quotes · {(estimateAttentionQuery.data?.estimates || []).filter(row => row.status === 'submitted-for-review').length} drafts await review</span>
      </Link>}
      {can('dispatch.manage') && operationsAttentionQuery.data?.attention && <section aria-label="Management attention" className="grid gap-3 sm:grid-cols-3">
        {[
          ['Missed visits',operationsAttentionQuery.data.attention.counts.missed,'/jobs?attention=missed','Scheduled visits whose end passed without confirmed arrival or work start.'],
          ['Assignment attention',operationsAttentionQuery.data.attention.counts.unassignedOrReassignment,'/jobs?attention=assignment','Unassigned work and pending technician reassignment requests.'],
          ['Rescheduling required',operationsAttentionQuery.data.attention.counts.rescheduleRequired,'/jobs?attention=reschedule','Jobs explicitly marked for rescheduling.'],
        ].map(([label,count,href,description])=><Link key={label} to={href} className="rounded-lg border border-amber-200 bg-white p-4 hover:bg-amber-50"><span className="block text-2xl font-bold text-amber-900">{count}</span><strong>{label}</strong><span className="mt-1 block text-xs text-gray-600">{description}</span></Link>)}
      </section>}
      {[customersQuery,jobsQuery,templatesQuery].some(query=>query.error)&&<div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p>{[customersQuery,jobsQuery,templatesQuery].find(query=>query.error)?.error?.message||'Dashboard information could not refresh.'} Saved information remains visible; unavailable counts show a dash.</p>
        <button type="button" className="mt-2 underline" onClick={()=>Promise.all([customersQuery.refetch(),jobsQuery.refetch(),templatesQuery.refetch()])}>Retry dashboard refresh</button>
      </div>}
      {jobsQuery.data?.hasMore&&<p role="status" className="text-sm text-amber-900">Job summaries cover the first 500 loaded jobs.</p>}
      {canViewUsage && <section className="space-y-3" aria-label="Company usage summary"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Company usage</h2><button type="button" className="text-sm text-primary-700 underline" onClick={() => usageQuery.refetch()}>Refresh usage</button></div>{usageQuery.isPending && <p role="status">Calculating usage…</p>}{usageQuery.error && <p role="alert">{usageQuery.error.message}</p>}<UsageMetrics metrics={usageQuery.data?.metrics} compact /></section>}
      {/* Welcome Section */}
      <Motion.div
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
      </Motion.div>

      {/* Stats Grid */}
      <Motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        {stats.map((stat) => {
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
      </Motion.div>

      {/* Quick Actions */}
      <Motion.div
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
            {quickActions.map((action) => {
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
      </Motion.div>

      {/* Getting Started */}
      <Motion.div
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
      </Motion.div>
    </div>
  );
};

export default HomePage;
