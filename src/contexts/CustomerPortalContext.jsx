import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import CustomerAuthService from '../services/customerAuthService';

/**
 * Customer Portal Context
 * Manages authentication state, customer profile, and company selection for portal
 */
const CustomerPortalContext = createContext();

export const CustomerPortalProvider = ({ children }) => {
  const [customer, setCustomer] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [notifications, setNotifications] = useState([]);

  // Initialize auth state on mount
  useEffect(() => {
    const unsubscribe = CustomerAuthService.onAuthStateChanged(async (user) => {
      try {
        if (user) {
          // User is authenticated
          const profile = await CustomerAuthService.getCustomerProfile(user.uid);
          setCustomer({
            id: user.uid,
            email: user.email,
            ...profile
          });
          setIsAuthenticated(true);

          // Set default selected company to first one
          if (profile?.companies?.length > 0) {
            setSelectedCompanyId(profile.companies[0]);
          }
        } else {
          // User is not authenticated
          setCustomer(null);
          setIsAuthenticated(false);
          setSelectedCompanyId(null);
        }
      } catch (err) {
        console.error('Error handling auth state change:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Request OTP
  const requestOTP = useCallback(async (email) => {
    try {
      setError(null);
      setIsLoading(true);
      const result = await CustomerAuthService.requestOTP(email);
      
      if (!result.success) {
        setError(result.error);
        return result;
      }

      return result;
    } catch (err) {
      const message = err.message || 'Failed to request OTP';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Verify OTP and login
  const verifyOTPAndLogin = useCallback(async (email, otp) => {
    try {
      setError(null);
      setIsLoading(true);
      const result = await CustomerAuthService.verifyOTP(email, otp);
      
      if (!result.success) {
        setError(result.error);
        return result;
      }

      // Profile will be set by auth state change listener
      return result;
    } catch (err) {
      const message = err.message || 'Failed to verify OTP';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Logout
  const logout = useCallback(async () => {
    try {
      setError(null);
      const result = await CustomerAuthService.signOut();
      
      if (result.success) {
        setCustomer(null);
        setIsAuthenticated(false);
        setSelectedCompanyId(null);
        setNotifications([]);
      } else {
        setError(result.error);
      }

      return result;
    } catch (err) {
      const message = err.message || 'Failed to logout';
      setError(message);
      return { success: false, error: message };
    }
  }, []);

  // Update profile
  const updateProfile = useCallback(async (updates) => {
    try {
      if (!customer?.id) {
        throw new Error('No customer logged in');
      }

      setError(null);
      const result = await CustomerAuthService.updateCustomerProfile(customer.id, updates);
      
      if (result.success) {
        // Update local state
        setCustomer(prev => ({
          ...prev,
          ...updates
        }));
      } else {
        setError(result.error);
      }

      return result;
    } catch (err) {
      const message = err.message || 'Failed to update profile';
      setError(message);
      return { success: false, error: message };
    }
  }, [customer?.id]);

  // Change selected company
  const selectCompany = useCallback((companyId) => {
    if (customer?.companies?.includes(companyId)) {
      setSelectedCompanyId(companyId);
      return true;
    }
    return false;
  }, [customer?.companies]);

  // Validate session
  const validateSession = useCallback(async () => {
    try {
      const result = await CustomerAuthService.validateSession();
      
      if (!result.valid) {
        setIsAuthenticated(false);
        setCustomer(null);
        setError(result.reason);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error validating session:', err);
      return false;
    }
  }, []);

  // Extend session
  const extendSession = useCallback(() => {
    return CustomerAuthService.extendSession();
  }, []);

  // Get companies list with labels
  const companiesList = customer?.companies || [];

  // Value object
  const value = {
    // State
    customer,
    isAuthenticated,
    isLoading,
    error,
    selectedCompanyId,
    notifications,
    companiesList,

    // Auth methods
    requestOTP,
    verifyOTPAndLogin,
    logout,

    // Profile methods
    updateProfile,

    // Company methods
    selectCompany,

    // Session methods
    validateSession,
    extendSession,

    // Utils
    isCustomerPortalUser: isAuthenticated && customer?.id,
    customerEmail: customer?.email,
    customerName: customer?.name,
  };

  return (
    <CustomerPortalContext.Provider value={value}>
      {children}
    </CustomerPortalContext.Provider>
  );
};

/**
 * Hook to use Customer Portal Context
 */
export const useCustomerPortal = () => {
  const context = useContext(CustomerPortalContext);
  
  if (!context) {
    throw new Error('useCustomerPortal must be used within CustomerPortalProvider');
  }

  return context;
};

export default CustomerPortalContext;
