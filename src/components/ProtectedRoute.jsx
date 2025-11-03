import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { currentUser, loading, needsCompanySetup, isSuperAdmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Force company setup for admins (except super admin)
  // Allow access to company-setup page itself
  if (needsCompanySetup && location.pathname !== '/company-setup') {
    return <Navigate to="/company-setup" replace />;
  }

  return children;
};

export default ProtectedRoute;
