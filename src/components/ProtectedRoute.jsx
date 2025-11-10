import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../services/firebase';
import { reload } from 'firebase/auth';
import { canAccessRoute, getDefaultRouteForRole } from '../utils/permissions';

const ProtectedRoute = ({ children }) => {
  const { currentUser, userProfile, loading, needsCompanySetup } = useAuth();
  const location = useLocation();
  const [verificationChecked, setVerificationChecked] = useState(false);

  // Force reload user to get latest emailVerified status
  useEffect(() => {
    if (currentUser && !loading) {
      reload(currentUser)
        .then(() => {
          setVerificationChecked(true);
        })
        .catch((error) => {
          console.error('Error reloading user for verification check:', error);
          setVerificationChecked(true); // Still allow check to proceed
        });
    } else if (!currentUser) {
      setVerificationChecked(true);
    }
  }, [currentUser, loading]);

  if (loading || !verificationChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Check email verification (except for super admin)
  // IMPORTANT: Block ALL protected routes if email is not verified
  const isSuperAdminUser = currentUser?.email === 'sroy@worksidesoftware.com';
  if (!isSuperAdminUser && !currentUser.emailVerified) {
    // Block access to all protected routes except verify-email page
    if (location.pathname !== '/verify-email') {
      return <Navigate to="/verify-email" replace state={{ email: currentUser.email }} />;
    }
  }

  // Force company setup for admins (except super admin)
  // Allow access to company-setup page itself
  if (needsCompanySetup && location.pathname !== '/company-setup') {
    return <Navigate to="/company-setup" replace />;
  }

  // Role-based route access
  if (!canAccessRoute(userProfile, location.pathname)) {
    const fallback = getDefaultRouteForRole(userProfile);
    if (location.pathname !== fallback) {
      return <Navigate to={fallback} replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
