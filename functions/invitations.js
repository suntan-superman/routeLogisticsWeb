const { randomBytes, timingSafeEqual } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { MEMBER_ROLES } = require('./claims');
const { hash, normalizeEmail, validEmail, documentId, requireAuth, requireCompanyOwner, rateLimit } = require('./security');
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const memberIdFor = (companyId, email) => `rl_${hash(`${companyId}:${normalizeEmail(email)}`)}`;
function checkInvitation(invite, caller, code, now = Date.now()) {
  if (!invite || !MEMBER_ROLES.includes(invite.role) || !invite.companyId) throw new HttpsError('not-found', 'Invitation is unavailable. Ask the owner for a new link.');
  if (!caller.emailVerified || normalizeEmail(caller.email) !== invite.email) throw new HttpsError('permission-denied', 'Sign in with the invited email address and verify it first.');
  if (typeof code !== 'string' || !/^[a-f0-9]{64}$/.test(code) || !/^[a-f0-9]{64}$/.test(invite.codeHash || '') || !timingSafeEqual(Buffer.from(hash(code)), Buffer.from(invite.codeHash))) throw new HttpsError('permission-denied', 'Invalid invitation link.');
  if (invite.status === 'active' && invite.uid === caller.uid) return;
  if (invite.status !== 'pending' || !(invite.expiresAt > now) || invite.uid) throw new HttpsError('failed-precondition', 'Invitation has expired or was cancelled. Ask the owner for a new link.');
}
async function createInvitation(db, { companyId, email: input, role, invitedBy, companyName, appUrl, queueEmail = true }, now = Date.now()) {
  const email = normalizeEmail(input);
  if (!validEmail(email) || !MEMBER_ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Enter a valid email and select a team role.');
  const identityId = memberIdFor(companyId, email);
  const identityRef = db.collection('rlMembershipIdentities').doc(identityId);
  const audit = db.collection('rlMembershipAudit').doc();
  const code = randomBytes(32).toString('hex');
  const member = { companyId, email, role, invitedBy, status: 'pending', schemaVersion: 2, expiresAt: now + INVITE_LIFETIME_MS, updatedAt: new Date(now).toISOString() };
  const { id, inviteUrl } = await db.runTransaction(async (tx) => {
    const [identity, company, all] = await Promise.all([tx.get(identityRef), tx.get(db.collection('companies').doc(companyId)), tx.get(db.collection('teamMembers').where('companyId', '==', companyId))]);
    if (company.get('ownerId') !== invitedBy) throw new HttpsError('permission-denied', 'Only the current owner can issue invitations.');
    // Include mixed-case legacy emails. The identity document serializes concurrent calls.
    const matches = all.docs.filter((d) => normalizeEmail(d.get('email')) === email);
    if (matches.some((d) => d.get('status') === 'active')) throw new HttpsError('already-exists', 'This person already has an active membership. Manage their existing role instead.');
    const old = matches.find((d) => d.id === identity.get('memberId')) || matches.find((d) => d.id === identityId) || matches.filter((d) => d.get('status') === 'pending').sort((a, b) => a.id.localeCompare(b.id))[0] || matches[0];
    const id = old?.id || identityId, ref = db.collection('teamMembers').doc(id);
    const inviteUrl = `${appUrl.replace(/\/$/, '')}/accept-invite?id=${id}#code=${code}`;
    tx.create(audit, { companyId, actorId: invitedBy, action: 'invite-reissue', memberId: id, createdAt: new Date(now) });
    for (const record of matches.filter((d) => d.id === id || d.get('status') === 'pending')) {
      tx.create(audit.collection('originals').doc(record.id), { path: record.ref.path, data: record.data() });
      if (record.id !== id) tx.update(record.ref, { status: 'superseded', supersededBy: id, updatedAt: member.updatedAt });
    }
    tx.set(identityRef, { companyId, email, memberId: id, updatedAt: new Date(now) });
    tx.set(ref, { ...(old?.data() || {}), ...member, uid: null, activatedAt: null, supersededBy: null, createdAt: old?.get('createdAt') || member.updatedAt });
    tx.set(db.collection('rlInviteSecrets').doc(id), { codeHash: hash(code) });
    if (queueEmail) tx.create(db.collection('rlMail').doc(), {
      invitationId: id, invitationHash: hash(code),
      to: email, subject: `Join ${companyName || 'your team'} on Route Logistics`,
      text: `You have been invited as ${role}. Sign in or create an account using ${email}, verify your email, and accept your invitation:\n\n${inviteUrl}\n\nThis link expires in 7 days.`,
      status: 'queued', availableAt: now, createdAt: new Date(now), expiresAt: new Date(now + INVITE_LIFETIME_MS),
    });
    return { id, inviteUrl };
  });
  return { teamMemberId: id, teamMember: { id, ...member }, inviteUrl, deliveryStatus: queueEmail ? 'queued' : 'disabled' };
}
function invitationHandlers(db, applyClaims, appUrl, emailEnabled = () => true) {
  return {
    sendTeamInviteEmail: async (request) => {
      const company = await requireCompanyOwner(db, request, request.data?.companyId);
      await rateLimit(db, 'invite', request.auth.uid, 20, 60 * 60 * 1000);
      if (normalizeEmail(request.data.email) === normalizeEmail(request.auth.token.email)) throw new HttpsError('invalid-argument', 'The owner is already a member.');
      return createInvitation(db, { ...request.data, companyId: company.id, companyName: company.get('name'), invitedBy: request.auth.uid, appUrl: appUrl(), queueEmail: emailEnabled() });
    },
    acceptTeamInvite: async (request) => {
      const { uid, token } = requireAuth(request, true);
      await rateLimit(db, 'accept-invite', uid, 10);
      const id = documentId(request.data?.inviteId, 'invitation');
      const memberRef = db.collection('teamMembers').doc(id);
      // Lock the user in the same transaction to prevent accepting two companies concurrently.
      await db.runTransaction(async (tx) => {
        const [snap, secret, user, owned, memberships] = await Promise.all([
          tx.get(memberRef), tx.get(db.collection('rlInviteSecrets').doc(id)), tx.get(db.collection('users').doc(uid)),
          tx.get(db.collection('companies').where('ownerId', '==', uid).limit(1)),
          tx.get(db.collection('teamMembers').where('uid', '==', uid).where('status', '==', 'active')),
        ]);
        const invite = { ...snap.data(), ...secret.data() };
        checkInvitation(invite, { uid, email: token.email, emailVerified: token.email_verified === true }, request.data?.code);
        if (!owned.empty || memberships.docs.some((d) => d.id !== id) || (user.get('rlCompanyId') && user.get('rlCompanyId') !== invite.companyId)) throw new HttpsError('failed-precondition', 'Your account already belongs to a company. Contact the owner before changing companies.');
        const company = await tx.get(db.collection('companies').doc(invite.companyId));
        if (!company.exists) throw new HttpsError('not-found', 'Company no longer exists.');
        tx.update(memberRef, { uid, status: 'active', activatedAt: new Date().toISOString() });
        tx.set(db.collection('users').doc(uid), { companyId: invite.companyId, rlCompanyId: invite.companyId }, { merge: true });
      });
      return { claims: await applyClaims(uid, token.email, true) };
    },
    manageTeamMember: async (request) => {
      requireAuth(request, true);
      const ref = db.collection('teamMembers').doc(documentId(request.data?.memberId, 'member'));
      const snap = await ref.get();
      if (!snap.exists) throw new HttpsError('not-found', 'Member not found.');
      await requireCompanyOwner(db, request, snap.get('companyId'));
      await rateLimit(db, 'manage-member', request.auth.uid);
      const removal = request.data.action === 'remove';
      const { role, status } = request.data;
      if (!removal && (!MEMBER_ROLES.includes(role) || !['active', 'inactive', 'pending'].includes(status))) throw new HttpsError('invalid-argument', 'Invalid role or status.');
      await db.runTransaction(async (tx) => {
        const [current, company] = await Promise.all([tx.get(ref), tx.get(db.collection('companies').doc(snap.get('companyId')))]);
        if (!current.exists || company.get('ownerId') !== request.auth.uid || current.get('companyId') !== company.id) throw new HttpsError('permission-denied', 'Company ownership changed. Refresh and try again.');
        if (current.get('uid') === company.get('ownerId')) throw new HttpsError('failed-precondition', 'Transfer ownership before removing the owner.');
        if (['removed', 'superseded'].includes(current.get('status'))) throw new HttpsError('failed-precondition', 'This membership is archived. Refresh the team list.');
        if (!removal && status !== 'inactive' && current.get('status') !== status) throw new HttpsError('failed-precondition', 'Send a new invitation to reactivate a member.');
        tx.create(db.collection('rlMembershipAudit').doc(), { action: removal ? 'remove' : 'update', companyId: company.id, actorId: request.auth.uid, path: ref.path, original: current.data(), createdAt: new Date() });
        tx.update(ref, { ...(removal ? { status: 'removed', removedAt: new Date().toISOString() } : { role, status }), updatedAt: new Date().toISOString() });
      });
      if (snap.get('uid')) await applyClaims(snap.get('uid'), snap.get('email'), true);
      return { success: true };
    },
  };
}
module.exports = { invitationHandlers, createInvitation, memberIdFor, checkInvitation, INVITE_LIFETIME_MS };
