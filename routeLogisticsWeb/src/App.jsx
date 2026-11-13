import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';
import { registerLicense } from '@syncfusion/ej2-base';

// Contexts
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Pages
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import LandingPage from './pages/LandingPage';
import CompanySetupPage from './pages/CompanySetupPage';
import CustomerManagementPage from './pages/CustomerManagementPage';
import EstimateTemplatesPage from './pages/EstimateTemplatesPage';
import JobManagementPage from './pages/JobManagementPage';
import ReportsPage from './pages/ReportsPage';
import CalendarPage from './pages/CalendarPage';
import InvoicesPage from './pages/InvoicesPage';
import ServicePlansPage from './pages/ServicePlansPage';

// Components
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { ConfirmProvider } from './components/ConfirmProvider';

// Create a client
// Register Syncfusion license
if (import.meta.env.VITE_SYNCFUSION_LICENSE_KEY) {
  registerLicense(import.meta.env.VITE_SYNCFUSION_LICENSE_KEY);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Shows the marketing landing page to signed-out visitors, and the dashboard
// to signed-in users, without changing either route's own loading/redirect logic.
const HomeOrLanding = () => {
  const { currentUser, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }
  if (!currentUser) return <LandingPage />;
  return (
    <Layout>
      <HomePage />
    </Layout>
  );
};

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ConfirmProvider>
          <Router>
            <div className="min-h-screen bg-gray-50">
              <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<LoginPage />} />
                
                {/* Protected Routes */}
                <Route path="/" element={<HomeOrLanding />} />
                <Route path="/signup" element={<SignupPage />} />

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
                      <InvoicesPage />
                    </Layout>
                  </ProtectedRoute>
                } />

                <Route path="/service-plans" element={
                  <ProtectedRoute>
                    <Layout>
                      <ServicePlansPage />
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
          </ConfirmProvider>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;