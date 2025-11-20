import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';

// Contexts
import { AuthProvider } from './contexts/AuthContext';
import { CompanyProvider } from './contexts/CompanyContext';
import { CustomerPortalProvider } from './contexts/CustomerPortalContext';

// Pages
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import EmailVerificationPage from './pages/EmailVerificationPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import SupportPage from './pages/SupportPage';
import CompanySetupPage from './pages/CompanySetupPage';
import CustomerManagementPage from './pages/CustomerManagementPage';
import EstimateTemplatesPage from './pages/EstimateTemplatesPage';
import EstimatesPage from './pages/EstimatesPage';
import JobManagementPage from './pages/JobManagementPage';
import ReportsPage from './pages/ReportsPage';
import CalendarPage from './pages/CalendarPage';
import InvoicePage from './pages/InvoicePage';
import InvoiceTemplatesPage from './pages/InvoiceTemplatesPage';
import RecurringJobsPage from './pages/RecurringJobsPage';
import InvitationsPage from './pages/InvitationsPage';
import BulkImportPage from './pages/BulkImportPage';
import CompanySearchPage from './pages/CompanySearchPage';
import TeamTrackingPage from './pages/TeamTrackingPage';
import NotificationsPage from './pages/NotificationsPage';
import RouteOptimizationPage from './pages/RouteOptimizationPage';
import CustomerPortalPage from './pages/CustomerPortalPage';
import LocationSettingsPage from './pages/LocationSettingsPage';
import QuickBooksSettingsPage from './pages/QuickBooksSettingsPage';
import TestDirectoryPage from './pages/TestDirectoryPage';
import PublicDirectoryPage from './pages/PublicDirectoryPage';
import ProviderProfilePage from './pages/ProviderProfilePage';

// Customer Portal Pages (login uses main /login page)
import CustomerPortalDashboardPage from './pages/customer-portal/DashboardPage';
import CustomerPortalJobsPage from './pages/customer-portal/JobsPage';
import CustomerPortalInvoicesPage from './pages/customer-portal/InvoicesPage';
import CustomerPortalCompanyPage from './pages/customer-portal/CompanyDetailPage';
import CustomerPortalProfilePage from './pages/customer-portal/ProfilePage';

// Components
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import CustomerPortalProtectedRoute from './components/CustomerPortalProtectedRoute';
import CustomerPortalLayout from './layouts/CustomerPortalLayout';

// Register Syncfusion license - import from license file
import './syncfusion-license';

// Create a client

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CompanyProvider>
            <CustomerPortalProvider>
              <Router
                future={{
                  v7_startTransition: true,
                  v7_relativeSplatPath: true
                }}
              >
            <div className="min-h-screen bg-gray-50">
              <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignUpPage />} />
                <Route path="/verify-email" element={<EmailVerificationPage />} />
                <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                <Route path="/support" element={<SupportPage />} />
                <Route path="/directory" element={<PublicDirectoryPage />} />
                <Route path="/provider/:companyId" element={<ProviderProfilePage />} />
                
                {/* Protected Routes */}
                <Route path="/" element={
                  <ProtectedRoute>
                    <Layout>
                      <HomePage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/company-setup" element={
                  <ProtectedRoute>
                    <Layout>
                      <CompanySetupPage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/customers" element={
                  <ProtectedRoute>
                    <Layout>
                      <CustomerManagementPage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/estimate-templates" element={
                  <ProtectedRoute>
                    <Layout>
                      <EstimateTemplatesPage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/estimates" element={
                  <ProtectedRoute>
                    <Layout>
                      <EstimatesPage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/jobs" element={
                  <ProtectedRoute>
                    <Layout>
                      <JobManagementPage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/reports" element={
                  <ProtectedRoute>
                    <Layout>
                      <ReportsPage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/calendar" element={
                  <ProtectedRoute>
                    <Layout>
                      <CalendarPage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/invoices" element={
                  <ProtectedRoute>
                    <Layout>
                      <InvoicePage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/invoice-templates" element={
                  <ProtectedRoute>
                    <Layout>
                      <InvoiceTemplatesPage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/quickbooks-settings" element={
                  <ProtectedRoute>
                    <Layout>
                      <QuickBooksSettingsPage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/test-directory" element={
                  <ProtectedRoute>
                    <Layout>
                      <TestDirectoryPage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/recurring-jobs" element={
                  <ProtectedRoute>
                    <Layout>
                      <RecurringJobsPage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/invitations" element={
                  <ProtectedRoute>
                    <Layout>
                      <InvitationsPage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/bulk-import" element={
                  <ProtectedRoute>
                    <Layout>
                      <BulkImportPage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/company-search" element={
                  <ProtectedRoute>
                    <Layout>
                      <CompanySearchPage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/team-tracking" element={
                  <ProtectedRoute>
                    <Layout>
                      <TeamTrackingPage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/notifications" element={
                  <ProtectedRoute>
                    <Layout>
                      <NotificationsPage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/route-optimization" element={
                  <ProtectedRoute>
                    <Layout>
                      <RouteOptimizationPage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                <Route path="/location-settings" element={
                  <ProtectedRoute>
                    <Layout>
                      <LocationSettingsPage />
                    </Layout>
                  </ProtectedRoute>
                } />
                
                {/* Customer Portal Routes - Use main /login instead of separate customer login */}
                
                <Route path="/customer-portal/dashboard" element={
                  <CustomerPortalProtectedRoute>
                    <CustomerPortalLayout>
                      <CustomerPortalDashboardPage />
                    </CustomerPortalLayout>
                  </CustomerPortalProtectedRoute>
                } />
                
                <Route path="/customer-portal/jobs" element={
                  <CustomerPortalProtectedRoute>
                    <CustomerPortalLayout>
                      <CustomerPortalJobsPage />
                    </CustomerPortalLayout>
                  </CustomerPortalProtectedRoute>
                } />
                
                <Route path="/customer-portal/invoices" element={
                  <CustomerPortalProtectedRoute>
                    <CustomerPortalLayout>
                      <CustomerPortalInvoicesPage />
                    </CustomerPortalLayout>
                  </CustomerPortalProtectedRoute>
                } />
                
                <Route path="/customer-portal/company" element={
                  <CustomerPortalProtectedRoute>
                    <CustomerPortalLayout>
                      <CustomerPortalCompanyPage />
                    </CustomerPortalLayout>
                  </CustomerPortalProtectedRoute>
                } />
                
                <Route path="/customer-portal/profile" element={
                  <CustomerPortalProtectedRoute>
                    <CustomerPortalLayout>
                      <CustomerPortalProfilePage />
                    </CustomerPortalLayout>
                  </CustomerPortalProtectedRoute>
                } />
                
                {/* Redirect /customer-portal to /customer-portal/dashboard */}
                <Route path="/customer-portal" element={<Navigate to="/customer-portal/dashboard" replace />} />
                
                {/* Redirect any unknown routes to home */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              
              {/* Toast notifications */}
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: '#363636',
                    color: '#fff',
                  },
                  success: {
                    style: {
                      background: '#10b981',
                    },
                  },
                  error: {
                    style: {
                      background: '#ef4444',
                    },
                  },
                }}
              />
            </div>
          </Router>
            </CustomerPortalProvider>
          </CompanyProvider>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;