import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';

// Contexts
import { AuthProvider } from './contexts/AuthContext';
import { CompanyProvider } from './contexts/CompanyContext';

// Pages
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import CompanySetupPage from './pages/CompanySetupPage';
import CustomerManagementPage from './pages/CustomerManagementPage';
import EstimateTemplatesPage from './pages/EstimateTemplatesPage';
import JobManagementPage from './pages/JobManagementPage';
import ReportsPage from './pages/ReportsPage';
import CalendarPage from './pages/CalendarPage';
import InvoicePage from './pages/InvoicePage';
import RecurringJobsPage from './pages/RecurringJobsPage';
import InvitationsPage from './pages/InvitationsPage';
import BulkImportPage from './pages/BulkImportPage';
import CompanySearchPage from './pages/CompanySearchPage';
import TeamTrackingPage from './pages/TeamTrackingPage';

// Components
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

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
            <Router>
            <div className="min-h-screen bg-gray-50">
              <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignUpPage />} />
                
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
          </CompanyProvider>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;