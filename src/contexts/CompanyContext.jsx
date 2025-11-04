import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuthSafe } from './AuthContext';
import CompanyService from '../services/companyService';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';

const CompanyContext = createContext();

export const useCompany = () => {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
};

export const CompanyProvider = ({ children }) => {
  // Get auth context safely - handles case where AuthProvider might still be initializing
  const authContext = useAuthSafe();
  const userProfile = authContext?.userProfile || null;
  const isSuperAdmin = authContext?.isSuperAdmin || false;
  
  const [availableCompanies, setAvailableCompanies] = useState([]);
  const [activeCompanyId, setActiveCompanyId] = useState(null);
  const [activeCompany, setActiveCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Refresh trigger for components to know when company changes
  const [refreshKey, setRefreshKey] = useState(0);

  // Load available companies (for super admin)
  useEffect(() => {
    const loadCompanies = async () => {
      if (isSuperAdmin) {
        try {
          // Get all active companies (excluding admin companies)
          const companiesQuery = query(
            collection(db, 'companies'),
            where('isActive', '==', true)
          );
          
          const snapshot = await getDocs(companiesQuery);
          const companies = [];
          
          snapshot.forEach((doc) => {
            const companyData = doc.data();
            // Filter out admin companies from the list
            if (!companyData.isAdminCompany && !companyData.isProtected) {
              companies.push({
                id: doc.id,
                ...companyData
              });
            }
          });

          // Sort by name
          companies.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

          setAvailableCompanies(companies);

          // If no active company is set, set to first company or user's company
          // Store in localStorage to persist across refreshes
          const storedCompanyId = localStorage.getItem('activeCompanyId');
          if (storedCompanyId && companies.find(c => c.id === storedCompanyId)) {
            setActiveCompanyId(storedCompanyId);
          } else if (userProfile?.companyId && companies.find(c => c.id === userProfile.companyId)) {
            setActiveCompanyId(userProfile.companyId);
          } else if (companies.length > 0) {
            setActiveCompanyId(companies[0].id);
          }
        } catch (error) {
          console.error('Error loading companies:', error);
        }
      } else {
        // For non-super admins, only their company
        if (userProfile?.companyId) {
          setActiveCompanyId(userProfile.companyId);
          setAvailableCompanies([]);
        }
      }
      setLoading(false);
    };

    loadCompanies();
  }, [isSuperAdmin, userProfile?.companyId]);

  // Load active company details
  useEffect(() => {
    const loadActiveCompany = async () => {
      if (activeCompanyId) {
        try {
          const result = await CompanyService.getCompany(activeCompanyId);
          if (result.success) {
            setActiveCompany(result.company);
          }
        } catch (error) {
          console.error('Error loading active company:', error);
          setActiveCompany(null);
        }
      } else {
        setActiveCompany(null);
      }
    };

    loadActiveCompany();
  }, [activeCompanyId]);

  // Switch active company (super admin only)
  const switchCompany = async (companyId) => {
    if (!isSuperAdmin) {
      throw new Error('Only super admins can switch companies');
    }

    const company = availableCompanies.find(c => c.id === companyId);
    if (!company) {
      throw new Error('Company not found in available companies');
    }

    setActiveCompanyId(companyId);
    localStorage.setItem('activeCompanyId', companyId);
    // Trigger refresh for components using this company
    setRefreshKey(prev => prev + 1);
  };

  // Get current effective company ID
  // For super admin: returns activeCompanyId
  // For regular users: returns their companyId
  const getEffectiveCompanyId = () => {
    if (isSuperAdmin && activeCompanyId) {
      return activeCompanyId;
    }
    return userProfile?.companyId || null;
  };

  const value = {
    availableCompanies,
    activeCompanyId,
    activeCompany,
    switchCompany,
    getEffectiveCompanyId,
    loading,
    canSwitchCompanies: isSuperAdmin,
    refreshKey // Components can use this to refresh when company changes
  };

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
};

