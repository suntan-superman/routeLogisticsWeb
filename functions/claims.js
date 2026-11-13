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
    return { claims: { companyId: active.companyId, role: active.role }, activateInviteId: null };
  }

  // Invites are matched by email, so the email must be verified or anyone could claim another person's invite.
  if (caller.email && caller.emailVerified) {
    const invite = data.invites.find((i) => MEMBER_ROLES.includes(i.role));
    if (invite) {
      return { claims: { companyId: invite.companyId, role: invite.role }, activateInviteId: invite.id };
    }
  }

  return { claims: null, activateInviteId: null };
}

module.exports = { resolveClaims, MEMBER_ROLES };
