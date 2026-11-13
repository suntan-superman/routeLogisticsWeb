// Pure logic for deriving a user's tenancy claims. Kept free of firebase imports so it is unit-testable.

const MEMBER_ROLES = ['technician', 'manager', 'admin'];

/**
 * @param {{uid: string, email?: string, emailVerified?: boolean}} caller
 * @param {{companies: Array<{id: string}>, memberships: Array<{id: string, companyId: string, role: string, status: string}>, invites: Array<{id: string, companyId: string, role: string}>}} data
 * @returns {{claims: {companyId: string, role: string} | null, activateInviteId: string | null}}
 */
function resolveClaims(caller, data) {
  if (data.companies.length > 0) {
    return { claims: { companyId: data.companies[0].id, role: 'owner' }, activateInviteId: null };
  }

  const active = data.memberships.find((m) => m.status === 'active' && MEMBER_ROLES.includes(m.role));
  if (active) {
    return { claims: { companyId: active.companyId, role: active.role, membershipId: active.id }, activateInviteId: null };
  }

  // Invitations grant no access until a verified user explicitly accepts their secret link.

  return { claims: null, activateInviteId: null };
}

module.exports = { resolveClaims, MEMBER_ROLES };
