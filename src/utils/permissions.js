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

export const canReassignJobs = (userProfile) => {
  return isSuperAdmin(userProfile) || userProfile?.role === 'admin';
};

/**
 * Route-level access control
 */
const ROUTE_ACCESS = {
  '/': ['field_tech', 'supervisor', 'admin', 'super_admin'],
  '/company-setup': ['supervisor', 'admin', 'super_admin'],
  '/invitations': ['admin', 'super_admin'],
  '/bulk-import': ['admin', 'super_admin'],
  '/company-search': ['supervisor', 'admin', 'super_admin'],
  '/customers': ['supervisor', 'admin', 'super_admin'],
  '/estimate-templates': ['supervisor', 'admin', 'super_admin'],
  '/jobs': ['field_tech', 'supervisor', 'admin', 'super_admin'],
  '/recurring-jobs': ['supervisor', 'admin', 'super_admin'],
  '/team-tracking': ['supervisor', 'admin', 'super_admin'],
  '/notifications': ['supervisor', 'admin', 'super_admin'],
  '/invoices': ['supervisor', 'admin', 'super_admin'],
  '/calendar': ['field_tech', 'supervisor', 'admin', 'super_admin'],
  '/reports': ['admin', 'super_admin'],
  '/home': ['field_tech', 'supervisor', 'admin', 'super_admin']
};

const normalizePath = (path) => {
  if (!path) return '/';
  if (path === '') return '/';
  if (ROUTE_ACCESS[path]) return path;

  // Handle paths with trailing slashes
  const trimmed = path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
  if (ROUTE_ACCESS[trimmed]) return trimmed;

  // Handle nested paths like /jobs/123
  const segments = trimmed.split('/');
  if (segments.length > 2) {
    const base = `/${segments[1]}`;
    if (ROUTE_ACCESS[base]) return base;
  }

  return trimmed;
};

export const canAccessRoute = (userProfile, path) => {
  if (!path) return true;

  const normalizedPath = normalizePath(path);

  // Super admin always allowed
  if (isSuperAdmin(userProfile)) {
    return true;
  }

  const allowedRoles = ROUTE_ACCESS[normalizedPath];

  if (!allowedRoles) {
    // No explicit restriction
    return true;
  }

  const userRole = userProfile?.role || '';
  return allowedRoles.includes(userRole);
};

export const getDefaultRouteForRole = (userProfile) => {
  if (isSuperAdmin(userProfile) || userProfile?.role === 'admin' || userProfile?.role === 'supervisor') {
    return '/';
  }

  // Field tech default routes
  return '/jobs';
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
