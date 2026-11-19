import React, { Suspense, lazy } from 'react';
import { createBrowserRouter, RouterProvider, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createWorkspaceQueryClient } from './services/workspaceQueryClient';
import { WorkspaceQueryBoundary } from './hooks/useWorkspaceQuery';
import { Toaster } from 'react-hot-toast';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { registerLicense } from '@syncfusion/ej2-base';

// Contexts
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

// Pages
const HomePage = lazy(() => import('./pages/HomePage'));
const MyWorkPage = lazy(() => import('./pages/MyWorkPage'));
const DispatchPage = lazy(() => import('./pages/DispatchPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const CompanySetupPage = lazy(() => import('./pages/CompanySetupPage'));
const CustomerManagementPage = lazy(() => import('./pages/CustomerManagementPage'));
const EstimateTemplatesPage = lazy(() => import('./pages/EstimateTemplatesPage'));
const EstimatesPage = lazy(() => import('./pages/EstimatesPage'));
const EstimateApprovalPage = lazy(() => import('./pages/EstimateApprovalPage'));
const JobManagementPage = lazy(() => import('./pages/JobManagementPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const InvoicesPage = lazy(() => import('./pages/InvoicesPage'));
const ServicePlansPage = lazy(() => import('./pages/ServicePlansPage'));
const AcceptInvitePage = lazy(() => import('./pages/AcceptInvitePage'));
const CustomerPortalPage = lazy(() => import('./pages/CustomerPortalPage'));
const ReviewsPage = lazy(() => import('./pages/ReviewsPage'));
const ReviewInvitationPage = lazy(() => import('./pages/ReviewInvitationPage'));
const PlatformAdminPage = lazy(() => import('./pages/PlatformAdminPage'));
const PublicContentPage = lazy(() => import('./pages/PublicContentPage'));

const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const RoutesPage = lazy(() => import('./pages/RoutesPage'));
const TeamLocationsPage = lazy(() => import('./pages/TeamLocationsPage'));
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage'));

// Components
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { ConfirmProvider } from './components/ConfirmProvider';
import { UnsavedChangesProvider } from './components/UnsavedChangesProvider';
import KeyboardFocusVisibility from './components/KeyboardFocusVisibility';

// Create a client
// Register Syncfusion license
if (import.meta.env.VITE_SYNCFUSION_LICENSE_KEY) {
  registerLicense(import.meta.env.VITE_SYNCFUSION_LICENSE_KEY);
}

const queryClient = createWorkspaceQueryClient();

// Shows the marketing landing page to signed-out visitors, and the dashboard
// to signed-in users, without changing either route's own loading/redirect logic.
const HomeOrLanding = () => {
  const { currentUser, loading, role } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }
  if (!currentUser) return <LandingPage />;
  return (
    <ProtectedRoute><Layout>
      {role === 'technician' ? <MyWorkPage /> : <HomePage />}
    </Layout></ProtectedRoute>
  );
};

function PrivateRouteMetadata() {
  const { pathname } = useLocation();
  const publicPage = pathname === '/' || pathname === '/privacy' || pathname === '/terms' || /^\/(faqs|testimonials|success-stories)(\/|$)/.test(pathname);
  return publicPage ? null : <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>;
}
function AppContent() {
  return (
          <UnsavedChangesProvider>
            <KeyboardFocusVisibility />
            <div className="min-h-screen bg-gray-50">
              <PrivateRouteMetadata />
              <Suspense fallback={<div className="p-8" role="status">Loading…</div>}>
              <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<LoginPage />} />
                
                {/* Protected Routes */}
                <Route path="/" element={<HomeOrLanding />} />
                <Route path="/my-work" element={<ProtectedRoute><Layout><MyWorkPage /></Layout></ProtectedRoute>} />
                <Route path="/dispatch" element={<ProtectedRoute><Layout><DispatchPage /></Layout></ProtectedRoute>} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/accept-invite" element={<AcceptInvitePage />} />
                <Route path="/portal" element={<CustomerPortalPage />} />
                <Route path="/review" element={<ReviewInvitationPage />} />
                <Route path="/reviews" element={<ProtectedRoute><Layout><ReviewsPage /></Layout></ProtectedRoute>} />
                <Route path="/platform-admin" element={<PlatformAdminPage />} />
                <Route path="/faqs" element={<PublicContentPage type="faq" />} />
                <Route path="/faqs/:slug" element={<PublicContentPage type="faq" />} />
                <Route path="/testimonials" element={<PublicContentPage type="testimonial" />} />
                <Route path="/testimonials/:slug" element={<PublicContentPage type="testimonial" />} />
                <Route path="/success-stories" element={<PublicContentPage type="story" />} />
                <Route path="/success-stories/:slug" element={<PublicContentPage type="story" />} />
                <Route path="/estimate-approval" element={<EstimateApprovalPage />} />
                <Route path="/estimates" element={<ProtectedRoute><Layout><EstimatesPage /></Layout></ProtectedRoute>} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/notifications" element={<ProtectedRoute><Layout><NotificationsPage /></Layout></ProtectedRoute>} />
                <Route path="/routes" element={<ProtectedRoute><Layout><RoutesPage /></Layout></ProtectedRoute>} />
                <Route path="/team-locations" element={<ProtectedRoute><Layout><TeamLocationsPage /></Layout></ProtectedRoute>} />
                <Route path="/integrations" element={<ProtectedRoute><Layout><IntegrationsPage /></Layout></ProtectedRoute>} />

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
              </Suspense>
              
              {/* Toast notifications */}
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: 'var(--rl-toast-surface)',
                    color: 'var(--rl-toast-text)',
                  },
                  success: {
                    style: {
                      background: '#047857', color: '#fff',
                    },
                  },
                  error: {
                    style: {
                      background: '#b91c1c', color: '#fff',
                    },
                  },
                }}
              />
            </div>
          </UnsavedChangesProvider>
  );
}

// Keep the existing route tree while enabling supported SPA/history blockers.
const router = createBrowserRouter([{ path: '*', element: <AppContent /> }]);

function App() {
  return (
    <ThemeProvider><HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WorkspaceQueryBoundary>
          <ConfirmProvider>
            <RouterProvider router={router} />
          </ConfirmProvider>
          </WorkspaceQueryBoundary>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider></ThemeProvider>
  );
}

export default App;
