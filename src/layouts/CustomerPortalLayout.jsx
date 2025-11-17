import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCustomerPortal } from '../contexts/CustomerPortalContext';
import {
  HomeIcon,
  DocumentTextIcon,
  BriefcaseIcon,
  BuildingOfficeIcon,
  UserIcon,
  ArrowLeftOnRectangleIcon,
  ChevronDownIcon,
  Bars3Icon,
  XMarkIcon,
  BellIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const CustomerPortalLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { customer, selectedCompanyId, selectCompany, companies, logout } = useCustomerPortal();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const handleLogoutConfirm = async () => {
    setShowLogoutConfirm(false);
    try {
      await logout();
      navigate('/customer-portal/login');
      toast.success('Logged out successfully');
    } catch (error) {
      toast.error('Failed to logout');
    }
  };

  const handleLogoutCancel = () => {
    setShowLogoutConfirm(false);
  };

  const isActive = (path) => location.pathname === path;

  const navigationItems = [
    {
      label: 'Dashboard',
      path: '/customer-portal/dashboard',
      icon: HomeIcon
    },
    {
      label: 'Jobs',
      path: '/customer-portal/jobs',
      icon: DocumentTextIcon
    },
    {
      label: 'Invoices',
      path: '/customer-portal/invoices',
      icon: BriefcaseIcon
    },
    {
      label: 'Company',
      path: '/customer-portal/company',
      icon: BuildingOfficeIcon
    },
    {
      label: 'Profile',
      path: '/customer-portal/profile',
      icon: UserIcon
    }
  ];

  const currentCompany = companies?.find(c => c.id === selectedCompanyId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo and Brand */}
            <Link to="/customer-portal/dashboard" className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-600 to-green-700 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">📊</span>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-bold text-gray-900">Customer Portal</p>
                <p className="text-xs text-gray-600">Route Logistics</p>
              </div>
            </Link>

            {/* Company Selector - Desktop */}
            <div className="hidden md:flex items-center gap-3 mx-auto max-w-xs">
              {currentCompany && (
                <div className="flex-1">
                  <button
                    onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium text-gray-900"
                  >
                    <span className="truncate">{currentCompany.businessName || currentCompany.name}</span>
                    <ChevronDownIcon
                      className={`w-4 h-4 flex-shrink-0 transition-transform ${
                        companyDropdownOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {/* Dropdown */}
                  {companyDropdownOpen && companies && companies.length > 1 && (
                    <div className="absolute top-16 left-1/2 -translate-x-1/2 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                      {companies.map(company => (
                        <button
                          key={company.id}
                          onClick={() => {
                            selectCompany(company.id);
                            setCompanyDropdownOpen(false);
                          }}
                          className={`w-full px-4 py-3 text-left text-sm transition-colors border-b border-gray-100 last:border-0 ${
                            selectedCompanyId === company.id
                              ? 'bg-green-50 text-green-700 font-medium'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {company.businessName || company.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Side - Desktop */}
            <div className="hidden md:flex items-center gap-4">
              <button className="p-2 text-gray-600 hover:text-gray-900 relative">
                <BellIcon className="w-6 h-6" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              </button>

              {/* User Menu */}
              <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
                <div className="w-10 h-10 bg-gradient-to-br from-green-600 to-green-700 rounded-full flex items-center justify-center text-white font-bold">
                  {customer?.name?.charAt(0) || 'C'}
                </div>
                <button
                  onClick={handleLogoutClick}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Logout"
                >
                  <ArrowLeftOnRectangleIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden flex items-center gap-2">
              <button className="p-2 text-gray-600 hover:text-gray-900">
                <BellIcon className="w-6 h-6" />
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-gray-600 hover:text-gray-900"
              >
                {mobileMenuOpen ? (
                  <XMarkIcon className="w-6 h-6" />
                ) : (
                  <Bars3Icon className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-gray-200 py-3 space-y-2">
              {/* Company Selector - Mobile */}
              {currentCompany && companies && companies.length > 1 && (
                <div className="px-2 mb-3 pb-3 border-b border-gray-200">
                  <p className="text-xs font-medium text-gray-600 uppercase mb-2">Company</p>
                  <div className="space-y-1">
                    {companies.map(company => (
                      <button
                        key={company.id}
                        onClick={() => {
                          selectCompany(company.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm rounded-lg transition-colors ${
                          selectedCompanyId === company.id
                            ? 'bg-green-100 text-green-700 font-medium'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {company.businessName || company.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {navigationItems.map(item => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                      isActive(item.path)
                        ? 'bg-green-100 text-green-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogoutClick();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-left"
              >
                <ArrowLeftOnRectangleIcon className="w-5 h-5 flex-shrink-0" />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar - Desktop */}
          <aside className="hidden md:block w-56 flex-shrink-0">
            <nav className="space-y-1 sticky top-24">
              {navigationItems.map(item => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                      isActive(item.path)
                        ? 'bg-green-100 text-green-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {children}
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-16 border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">About Portal</h3>
              <p className="text-sm text-gray-600">
                Manage your jobs, invoices, and account in one secure location.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Quick Links</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/customer-portal/jobs" className="text-gray-600 hover:text-green-600">
                    Jobs
                  </Link>
                </li>
                <li>
                  <Link to="/customer-portal/invoices" className="text-gray-600 hover:text-green-600">
                    Invoices
                  </Link>
                </li>
                <li>
                  <Link to="/customer-portal/profile" className="text-gray-600 hover:text-green-600">
                    Profile
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Support</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/support" className="text-gray-600 hover:text-green-600">
                    Support & Help
                  </Link>
                </li>
                <li>
                  <Link to="/privacy-policy" className="text-gray-600 hover:text-green-600">
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-8 flex flex-col md:flex-row items-center justify-between">
            <p className="text-sm text-gray-600">
              © 2025 miFactotum. All rights reserved.
            </p>
            <p className="text-sm text-gray-600 mt-4 md:mt-0">
              Logged in as: <span className="font-medium text-gray-900">{customer?.name}</span>
            </p>
          </div>
        </div>
      </footer>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={handleLogoutCancel}
            />

            {/* Modal */}
            <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
              <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <ArrowLeftOnRectangleIcon className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <h3 className="text-lg font-semibold leading-6 text-gray-900">
                      Confirm Logout
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Are you sure you want to logout? You will need to enter your email and verification code to sign in again.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                <button
                  type="button"
                  onClick={handleLogoutConfirm}
                  className="inline-flex w-full justify-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto transition-colors"
                >
                  Yes, Logout
                </button>
                <button
                  type="button"
                  onClick={handleLogoutCancel}
                  className="mt-3 inline-flex w-full justify-center rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerPortalLayout;

