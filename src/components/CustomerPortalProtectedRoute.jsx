import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useCustomerPortal } from '../contexts/CustomerPortalContext';
import { useAuthSafe } from '../contexts/AuthContext';

/**
 * Protected Route Component for Customer Portal
 * Ensures only authenticated customers can access protected pages
 * Supports both OTP-based login and regular signup flow
 */
const CustomerPortalProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading, validateSession } = useCustomerPortal();
  const authContext = useAuthSafe();
  const currentUser = authContext?.currentUser || null;
  const userProfile = authContext?.userProfile || null;
  const authLoading = authContext?.loading ?? true;
  const location = useLocation();
  const [isSessionValid, setIsSessionValid] = useState(null);

  // Check if user is authenticated via main AuthContext as a customer
  const isAuthContextCustomer = currentUser && userProfile?.role === 'customer';

  useEffect(() => {
    const checkSession = async () => {
      if (isAuthenticated) {
        const valid = await validateSession();
        setIsSessionValid(valid);
      } else if (isAuthContextCustomer) {
        // Customer authenticated via main auth, no need to validate OTP session
        setIsSessionValid(true);
      }
    };

    checkSession();
  }, [isAuthenticated, isAuthContextCustomer, validateSession]);

  // Still loading auth state
  if ((isLoading && !isAuthContextCustomer) || authLoading || isSessionValid === null) {
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

  // Not authenticated - redirect to main login
  if (!isAuthenticated && !isAuthContextCustomer) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isAuthenticated && !isSessionValid) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Authenticated and session valid (either via OTP or main auth)
  return children;
};

export default CustomerPortalProtectedRoute;

