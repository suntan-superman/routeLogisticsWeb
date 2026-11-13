const { HttpsError } = require('firebase-functions/v2/https');
const { requireAuth, requireCompanyOwner, documentId, normalizeEmail, rateLimit } = require('./security');
const { memberIdFor } = require('./invitations');
function ownershipHandler(db, applyClaims) {
  return async (request) => {
    const { uid, token } = requireAuth(request, true);
    if (!Number.isFinite(token.auth_time) || Date.now() / 1000 - token.auth_time > 300) throw new HttpsError('failed-precondition', 'Sign out and sign back in before transferring ownership.');
    const company = await requireCompanyOwner(db, request, request.data?.companyId);
    await rateLimit(db, 'ownership-transfer', uid, 3, 60 * 60_000);
    const targetRef = db.collection('teamMembers').doc(documentId(request.data?.memberId, 'member'));
    let target;
    await db.runTransaction(async (tx) => {
      const [current, member] = await Promise.all([tx.get(company.ref), tx.get(targetRef)]);
      target = member.data();
      if (current.get('ownerId') !== uid) throw new HttpsError('permission-denied', 'Ownership changed. Refresh your account.');
      if (!target?.uid || target.uid === uid || target.companyId !== company.id || target.status !== 'active' || target.role !== 'admin') throw new HttpsError('failed-precondition', 'Choose an active administrator in this company.');
      const otherCompanies = await tx.get(db.collection('companies').where('ownerId', '==', target.uid).limit(1));
      if (!otherCompanies.empty) throw new HttpsError('failed-precondition', 'This administrator already owns a company.');
      const oldMemberRef = db.collection('teamMembers').doc(memberIdFor(company.id, token.email));
      const now = new Date().toISOString();
      tx.update(company.ref, { ownerId: target.uid, updatedAt: now });
      // The outgoing owner retains an admin membership; the new owner is derived from ownerId.
      tx.set(oldMemberRef, { companyId: company.id, uid, email: normalizeEmail(token.email), role: 'admin', status: 'active', schemaVersion: 2, createdAt: now, updatedAt: now });
      tx.update(targetRef, { status: 'inactive', updatedAt: now });
      tx.create(db.collection('rlOwnershipAudit').doc(), { companyId: company.id, previousOwnerId: uid, newOwnerId: target.uid, transferredAt: now });
    });
    // Current Firestore rules check the live owner/membership even if claim refresh is delayed.
    await Promise.all([applyClaims(uid, token.email, true), applyClaims(target.uid, target.email, true)]);
    return { success: true };
  };
}
module.exports = { ownershipHandler };
