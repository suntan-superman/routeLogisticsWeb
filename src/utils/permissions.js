/**
 * Role-Based Permissions Utility
 * 
 * Centralized permission checking for role-based access control
 */

// Role hierarchy (higher = more permissions)
const ROLE_HIERARCHY = {
  'super_admin': 4,
  'admin': 3,
  'supervisor': 2,
  'field_tech': 1
};

/**
 * Check if user has a specific role or higher
 */
export const hasRole = (userRole, requiredRole) => {
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  return userLevel >= requiredLevel;
};

/**
 * Check if user is super admin
 */
export const isSuperAdmin = (userProfile) => {
  return userProfile?.role === 'super_admin' || 
         userProfile?.email === 'sroy@worksidesoftware.com';
};

/**
 * Check if user is company admin or higher
 */
export const isCompanyAdmin = (userProfile) => {
  return isSuperAdmin(userProfile) || userProfile?.role === 'admin';
};

/**
 * Check if user is supervisor or higher
 */
export const isSupervisor = (userProfile) => {
  return isCompanyAdmin(userProfile) || userProfile?.role === 'supervisor';
};

/**
 * Check if user can switch companies (super admin only)
 */
export const canSwitchCompanies = (userProfile) => {
  return isSuperAdmin(userProfile);
};

/**
 * Check if user can create users
 */
export const canCreateUsers = (userProfile) => {
  return isCompanyAdmin(userProfile);
};

/**
 * Check if user can approve/reject customers
 */
export const canApproveCustomers = (userProfile) => {
  return isSupervisor(userProfile);
};

/**
 * Check if user can create customers
 */
export const canCreateCustomers = (userProfile) => {
  // All roles can create customers, but field techs require approval
  return true;
};

/**
 * Check if user can edit customers (not just their own pending ones)
 */
export const canEditCustomers = (userProfile, customer) => {
  // Super admin and company admin can edit any customer
  if (isCompanyAdmin(userProfile)) {
    return true;
  }
  
  // Supervisors can edit any customer
  if (userProfile?.role === 'supervisor') {
    return true;
  }
  
  // Field techs can only edit their own pending customers
  if (userProfile?.role === 'field_tech') {
    return customer?.status === 'pending' && 
           customer?.createdBy === userProfile?.id;
  }
  
  return false;
};

/**
 * Check if user can delete customers
 */
export const canDeleteCustomers = (userProfile) => {
  return isCompanyAdmin(userProfile);
};

/**
 * Check if user can manage company services
 */
export const canManageServices = (userProfile) => {
  return isCompanyAdmin(userProfile);
};

/**
 * Check if user can import data
 */
export const canImportData = (userProfile) => {
  return isCompanyAdmin(userProfile);
};

/**
 * Check if user can manage company settings
 */
export const canManageCompanySettings = (userProfile) => {
  return isCompanyAdmin(userProfile);
};

/**
 * Get customer creation status based on user role
 */
export const getCustomerCreationStatus = (userProfile) => {
  // Admins and supervisors create approved customers
  if (isSupervisor(userProfile)) {
    return 'approved';
  }
  
  // Field techs create pending customers
  return 'pending';
};

/**
 * Check if user can view all company customers (vs only their own)
 */
export const canViewAllCompanyCustomers = (userProfile) => {
  return isSupervisor(userProfile);
};
