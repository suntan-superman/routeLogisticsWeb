import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CompanySwitcher from './CompanySwitcher';
import { 
  HomeIcon, 
  BuildingOfficeIcon, 
  UsersIcon, 
  DocumentTextIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  CalendarIcon,
  Bars3Icon,
  XMarkIcon,
  ReceiptRefundIcon,
  ArrowPathIcon,
  EnvelopeIcon,
  DocumentArrowUpIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  BellIcon
} from '@heroicons/react/24/outline';
import { canAccessRoute } from '../utils/permissions';

const Layout = ({ children }) => {
  const { userProfile, logout, isSuperAdmin } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Define navigation array first
  const navigation = [
    { name: 'Dashboard', href: '/', icon: HomeIcon },
    { name: 'Company Setup', href: '/company-setup', icon: BuildingOfficeIcon },
    { name: 'Invitations', href: '/invitations', icon: EnvelopeIcon, adminOnly: true },
    { name: 'Bulk Import', href: '/bulk-import', icon: DocumentArrowUpIcon, adminOnly: true },
    { name: 'Company Search', href: '/company-search', icon: MagnifyingGlassIcon },
    { name: 'Customers', href: '/customers', icon: UsersIcon },
    { name: 'Estimates', href: '/estimates', icon: DocumentTextIcon },
    { name: 'Estimate Templates', href: '/estimate-templates', icon: DocumentTextIcon },
    { name: 'Jobs', href: '/jobs', icon: ClipboardDocumentListIcon },
    { name: 'Recurring Jobs', href: '/recurring-jobs', icon: ArrowPathIcon },
    { name: 'Route Optimization', href: '/route-optimization', icon: MapPinIcon, adminOnly: true },
    { name: 'Team Tracking', href: '/team-tracking', icon: MapPinIcon, adminOnly: true },
    { name: 'Notifications', href: '/notifications', icon: BellIcon, adminOnly: true },
    { name: 'Invoices', href: '/invoices', icon: ReceiptRefundIcon },
    { name: 'Calendar', href: '/calendar', icon: CalendarIcon },
    { name: 'Reports', href: '/reports', icon: ChartBarIcon },
  ];

  // Filter navigation based on user role
  const isAdmin = userProfile?.role === 'admin' || isSuperAdmin;
  const filteredNavigation = navigation.filter(item => {
    if (!userProfile) return true;

    if (item.adminOnly && !isAdmin) return false;

    return canAccessRoute(userProfile, item.href);
  });

  const isCurrentPath = (path) => {
    return location.pathname === path;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 bg-primary-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">RL</span>
                </div>
              </div>
              <div className="ml-3">
                <h1 className="text-lg font-semibold text-gray-900">Route Logistics</h1>
              </div>
            </div>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600"
              onClick={() => setSidebarOpen(false)}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex-1 px-4 py-4 space-y-1">
            {filteredNavigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    isCurrentPath(item.href)
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 bg-gray-300 rounded-full flex items-center justify-center">
                  <span className="text-gray-600 font-medium text-sm">
                    {userProfile?.name?.charAt(0) || 'U'}
                  </span>
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700">{userProfile?.name || 'User'}</p>
                <p className="text-xs text-gray-500">{userProfile?.email}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="mt-3 w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200">
          <div className="flex h-16 items-center px-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 bg-primary-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">RL</span>
                </div>
              </div>
              <div className="ml-3">
                <h1 className="text-lg font-semibold text-gray-900">Route Logistics</h1>
              </div>
            </div>
          </div>
          <nav className="flex-1 px-4 py-4 space-y-1">
            {filteredNavigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    isCurrentPath(item.href)
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 bg-gray-300 rounded-full flex items-center justify-center">
                  <span className="text-gray-600 font-medium text-sm">
                    {userProfile?.name?.charAt(0) || 'U'}
                  </span>
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700">{userProfile?.name || 'User'}</p>
                <p className="text-xs text-gray-500">{userProfile?.email}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="mt-3 w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          <button
            type="button"
            className="-m-2.5 p-2.5 text-gray-700 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="h-6 w-6" />
          </button>
                 <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
                   <div className="flex flex-1"></div>
                   <div className="flex items-center gap-x-4 lg:gap-x-6">
                     <CompanySwitcher />
                     <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200" />
                     <div className="flex items-center gap-x-2">
                       <span className="text-sm text-gray-500">Welcome back,</span>
                       <span className="text-sm font-medium text-gray-900">{userProfile?.name || 'User'}</span>
                     </div>
                   </div>
                 </div>
        </div>

        {/* Page content */}
        <main className="py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
