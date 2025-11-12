import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import CustomerPortalService from '../services/customerPortalService';

const CustomerPortalContext = createContext();

export const useCustomerPortal = () => {
  const context = useContext(CustomerPortalContext);
  if (!context) {
    throw new Error('useCustomerPortal must be used within a CustomerPortalProvider');
  }
  return context;
};

export const CustomerPortalProvider = ({ children }) => {
  const { currentUser, userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [activeCompany, setActiveCompany] = useState(null);
  const [customerRecord, setCustomerRecord] = useState(null);

  // Check if user is a customer (not admin/tech)
  const isCustomer = () => {
    if (!userProfile) return false;
    const role = (userProfile.role || '').toLowerCase();
    return role === 'customer' || role === '' || !role;
  };

  // Load customer companies on mount or when user changes
  useEffect(() => {
    if (!currentUser?.email || !isCustomer()) {
      setLoading(false);
      return;
    }

    const loadCustomerCompanies = async () => {
      setLoading(true);
      try {
        const result = await CustomerPortalService.findCustomerCompanies(currentUser.email);
        
        if (result.success) {
          setCompanies(result.companies || []);
          
          // Auto-select if only one company
          if (result.companies && result.companies.length === 1) {
            setActiveCompany(result.companies[0]);
            
            // Load customer record
            if (result.companies[0].customerId) {
              const customerResult = await CustomerPortalService.getCustomerDetails(
                result.companies[0].customerId
              );
              if (customerResult.success) {
                setCustomerRecord(customerResult.customer);
              }
            }
          } else if (result.companies && result.companies.length > 1) {
            // Check localStorage for last selected company
            const lastCompanyId = localStorage.getItem('lastCustomerCompanyId');
            const lastCompany = result.companies.find(c => c.id === lastCompanyId);
            
            if (lastCompany) {
              setActiveCompany(lastCompany);
              
              if (lastCompany.customerId) {
                const customerResult = await CustomerPortalService.getCustomerDetails(
                  lastCompany.customerId
                );
                if (customerResult.success) {
                  setCustomerRecord(customerResult.customer);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Error loading customer companies:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCustomerCompanies();
  }, [currentUser?.email, userProfile?.role]);

  // Switch active company
  const switchCompany = async (company) => {
    setActiveCompany(company);
    localStorage.setItem('lastCustomerCompanyId', company.id);
    
    // Load customer record for this company
    if (company.customerId) {
      try {
        const customerResult = await CustomerPortalService.getCustomerDetails(
          company.customerId
        );
        if (customerResult.success) {
          setCustomerRecord(customerResult.customer);
        }
      } catch (error) {
        console.error('Error loading customer record:', error);
      }
    }
  };

  const value = {
    loading,
    companies,
    activeCompany,
    customerRecord,
    isCustomer: isCustomer(),
    hasMultipleCompanies: companies.length > 1,
    hasNoCompanies: companies.length === 0,
    switchCompany
  };

  return (
    <CustomerPortalContext.Provider value={value}>
      {children}
    </CustomerPortalContext.Provider>
  );
};

// Safe version that doesn't throw during initialization
export const useCustomerPortalSafe = () => {
  const context = useContext(CustomerPortalContext);
  return context;
};

