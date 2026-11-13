// A pending invitation is not a personal workspace and grants no company access.
// Only return invitation context to the verified recipient; never return its secret.
async function workspaceStatus(db, caller, claims, now = Date.now()) {
  if (!caller.emailVerified) return { status: 'verify-email' };
  if (claims?.companyId) return { status: 'company' };
  const [profile, memberships, invitations] = await Promise.all([
    db.collection('users').doc(caller.uid).get(),
    db.collection('teamMembers').where('uid', '==', caller.uid).limit(20).get(),
    caller.email
      ? db.collection('teamMembers').where('email', '==', caller.email.trim().toLowerCase()).where('status', '==', 'pending').limit(20).get()
      : Promise.resolve({ docs: [] }),
  ]);
  const pending = invitations.docs.filter(row => !row.get('uid') && ['technician', 'manager', 'admin'].includes(row.get('role')));
  if (pending.length) {
    return { status: 'pending', invitations: await Promise.all(pending.map(async row => {
      const company = await db.collection('companies').doc(row.get('companyId')).get();
      return { id: row.id, companyName: company.get('name') || 'Your company', role: row.get('role'), expired: !(row.get('expiresAt') > now) };
    })) };
  }
  if (memberships.docs.length || profile.get('rlCompanyId') || profile.get('companyId') || ['field_tech', 'supervisor'].includes(profile.get('role'))) {
    return { status: 'unavailable' };
  }
  return { status: 'solo' };
}
module.exports = { workspaceStatus };
