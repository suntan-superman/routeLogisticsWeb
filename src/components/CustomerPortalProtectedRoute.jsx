import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useCustomerPortal } from '../contexts/CustomerPortalContext';

/**
 * Protected Route Component for Customer Portal
 * Ensures only authenticated customers can access protected pages
 */
const CustomerPortalProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading, validateSession } = useCustomerPortal();
  const location = useLocation();
  const [isSessionValid, setIsSessionValid] = useState(null);

  useEffect(() => {
    const checkSession = async () => {
      if (isAuthenticated) {
        const valid = await validateSession();
        setIsSessionValid(valid);
      }
    };

    checkSession();
  }, [isAuthenticated, validateSession]);

  // Still loading auth state
  if (isLoading || isSessionValid === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
        <div className="text-center">
          <div className="inline-block">
            <div className="w-12 h-12 border-4 border-green-200 border-t-green-600 rounded-full animate-spin" />
          </div>
          <p className="mt-4 text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated or session invalid
  if (!isAuthenticated || !isSessionValid) {
    return <Navigate to="/customer-portal/login" state={{ from: location }} replace />;
  }

  // Authenticated and session valid
  return children;
};

export default CustomerPortalProtectedRoute;

