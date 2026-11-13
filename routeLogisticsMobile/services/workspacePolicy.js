const policy = require('../../functions/shared/capabilities.json');
const STAFF_ROLES = Object.keys(policy.roles);

function workspacePermissions(workspace, claims) {
  const company = workspace?.status === 'company' && !!claims?.companyId && STAFF_ROLES.includes(claims.role)
    && (claims.role === 'owner' || !!claims.membershipId);
  const solo = workspace?.status === 'solo' && !claims?.companyId;
  const can = capability => (company || solo) && (policy.roles[company ? claims.role : 'owner'] || []).includes(capability);
  return {
    canAccess: company || solo,
    can, canManage: can('jobs.schedule'), canViewFinancial: can('reports.financial'),
    canEditCompany: company && claims.role === 'owner',
    isTechnician: company && claims.role === 'technician',
  };
}

function serviceNames(services) {
  return [...new Set((Array.isArray(services) ? services : []).map(service => typeof service === 'string' ? service.trim() : service?.name?.trim()).filter(Boolean))];
}

function companyProfile(company) {
  const address = company.address;
  return {
    companyName: company.name || company.businessName || '',
    companyLogo: typeof company.logo === 'string' ? company.logo : '',
    businessName: company.name || company.businessName || '',
    businessPhone: company.phone || company.phoneNumber || '',
    businessAddress: typeof address === 'string' ? [address, company.city, company.state, company.zipCode].filter(Boolean).join(', ')
      : [address?.street, address?.city, address?.state, address?.zipCode].filter(Boolean).join(', '),
    services: serviceNames(company.services),
    serviceCategories: serviceNames(company.serviceCategories),
  };
}

function parseInvitationLink(value) {
  // Accept the existing production invitation format only. Codes stay in memory.
  const match = String(value || '').trim().match(/^https:\/\/route-logistics\.com\/accept-invite\?id=([A-Za-z0-9_-]{1,200})#code=([a-f0-9]{64})$/);
  if (!match) throw new Error('Paste the complete invitation link from your Route Logistics invitation email.');
  return { inviteId: match[1], code: match[2] };
}

module.exports = { workspacePermissions, serviceNames, companyProfile, parseInvitationLink };
