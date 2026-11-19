const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');
const { requireAuth, normalizeEmail, validEmail, hash, rateLimit } = require('./security');

const RECENT_SIGN_IN_SECONDS = 300;
const result = () => ({ success: true, deleted: true, businessRecordsRetained: true });
const deletedAccount = account => !account || account.uid?.startsWith('rl_customer_') || account.customClaims?.portal === true;
function checkAccount(account) {
  if (deletedAccount(account)) throw new HttpsError('permission-denied', 'Use your Route Logistics team account to delete that account. Customer portal identities are separate.');
}
async function optionalUser(auth, uid) {
  try { return await auth.getUser(uid); }
  catch (failure) { if (failure.code === 'auth/user-not-found') return null; throw failure; }
}

function accountDeletionHandlers(db, auth, { now = () => Date.now() } = {}) {
  const marker = uid => db.collection('rlAccountDeletions').doc(uid);
  async function deleteQuery(query) {
    // Bounded batches also make interrupted cleanup safe to repeat.
    while (true) {
      const count = await db.runTransaction(async tx => {
        const rows = await tx.get(query.limit(200));
        rows.docs.forEach(row => tx.delete(row.ref)); return rows.size;
      });
      if (count < 200) return;
    }
  }
  async function clearInvitation(uid, id) {
    const memberRef = db.doc(`teamMembers/${id}`);
    const stillRemoved = row => row.get('status') === 'removed' && row.get('accountDeletionUid') === uid;
    await db.runTransaction(async tx => {
      if (stillRemoved(await tx.get(memberRef))) tx.delete(db.doc(`rlInviteSecrets/${id}`));
    });
    for (const [collection, field] of [['rlMembershipIdentities', 'memberId'], ['rlMail', 'invitationId']]) {
      while (true) {
        const count = await db.runTransaction(async tx => {
          const [member, rows] = await Promise.all([tx.get(memberRef), tx.get(db.collection(collection).where(field, '==', id).limit(200))]);
          if (!stillRemoved(member)) return 0;
          rows.docs.forEach(row => tx.delete(row.ref)); return rows.size;
        });
        if (count < 200) break;
      }
    }
  }
  async function complete(uid) {
    const ref = marker(uid), saved = await ref.get();
    if (!saved.exists) return;
    if (saved.get('status') === 'deleted') return result();
    const account = await optionalUser(auth, uid);
    if (account) {
      checkAccount(account);
      // Revocation prevents new sessions; the durable marker also denies still-valid ID tokens.
      try { await auth.revokeRefreshTokens(uid); }
      catch (failure) { if (failure.code !== 'auth/user-not-found') throw failure; }
    }
    const data = saved.data();
    for (const [collection, field] of [
      ['rlPushDevices', 'uid'], ['rlPushPreferences', 'uid'], ['rlPushInstallations', 'uid'], ['rlPushDeliveries', 'uid'],
      ['deviceTokens', 'userId'], ['rlNotifications', 'userId'], ['rlLocations', 'userId'], ['rlLocationHistory', 'userId'], ['rlLocationHistoryEvents', 'userId'], ['rlWorkShifts', 'userId'],
      ['rlJobVisitStates', 'userId'], ['rlQbOAuthStates', 'userId'],
    ]) await deleteQuery(db.collection(collection).where(field, '==', uid));
    // Authentication mail contains one-time credentials, not accounting/message history.
    while (true) {
      const challenges = await db.collection('rlStaffLoginChallenges').where('uid', '==', uid).limit(100).get();
      if (challenges.empty) break;
      for (const challenge of challenges.docs) {
        await deleteQuery(db.collection('rlMail').where('staffLoginChallengeId', '==', challenge.id));
        await challenge.ref.delete();
      }
    }
    if (data.emailHash) await db.runTransaction(async tx => {
      const requestRef = db.doc(`rlStaffLoginRequests/${data.emailHash}`), latest = await tx.get(requestRef);
      if (!latest.exists) return;
      const challenge = typeof latest.get('challengeId') === 'string' && /^[a-f0-9]{48}$/.test(latest.get('challengeId')) ? await tx.get(db.doc(`rlStaffLoginChallenges/${latest.get('challengeId')}`)) : null;
      if (!challenge?.exists || challenge.get('uid') === uid) tx.delete(requestRef);
    });
    for (const id of data.invitationIds || []) await clearInvitation(uid, id);
    // Do not recursively remove users/{uid} Storage paths: they contain retained business photos.
    await db.doc(`rlPlatformAdmins/${uid}`).delete();
    await db.doc(`users/${uid}`).delete();
    if (account) {
      try { await auth.setCustomUserClaims(uid, {}); await auth.deleteUser(uid); }
      catch (failure) { if (failure.code !== 'auth/user-not-found') throw failure; }
    }
    await ref.update({ status: 'deleted', completedAt: new Date(now()), emailHash: FieldValue.delete(), invitationIds: FieldValue.delete() });
    return result();
  }
  async function request(request) {
    const { uid, token } = requireAuth(request, true);
    const time = now() / 1000;
    if (!Number.isFinite(token.auth_time) || time - token.auth_time > RECENT_SIGN_IN_SECONDS || token.auth_time > time + 30) {
      throw new HttpsError('failed-precondition', 'Sign out and sign back in, then delete your account within five minutes.');
    }
    if (uid.startsWith('rl_customer_') || request.data?.confirmation !== 'DELETE' || Object.keys(request.data || {}).some(key => !['confirmation', 'emailConfirmation'].includes(key))) {
      throw new HttpsError('invalid-argument', 'Confirm deletion of your own Route Logistics account by entering DELETE.');
    }
    const emailConfirmation = typeof request.data.emailConfirmation === 'string' ? normalizeEmail(request.data.emailConfirmation) : '';
    if (!validEmail(emailConfirmation) || emailConfirmation !== normalizeEmail(token.email)) throw new HttpsError('invalid-argument', 'Enter the full email address of your signed-in account to confirm deletion.');
    const ref = marker(uid), previous = await ref.get();
    if (previous.get('status') === 'deleted') return result();
    const account = await optionalUser(auth, uid);
    if (account) {
      checkAccount(account);
      if (account.disabled || !account.emailVerified || normalizeEmail(account.email) !== normalizeEmail(token.email) || emailConfirmation !== normalizeEmail(account.email)) throw new HttpsError('permission-denied', 'Sign in to your verified current account and enter its full email before deleting it.');
    } else if (!previous.exists || previous.get('status') !== 'pending' || previous.get('emailHash') !== hash(emailConfirmation)) {
      throw new HttpsError('permission-denied', 'Sign in to your verified current account before deleting it.');
    }
    if (!previous.exists) {
      await rateLimit(db, 'account-deletion', uid, 5, 60 * 60_000, now());
      const email = normalizeEmail(account.email);
      await db.runTransaction(async tx => {
        const [current, owned, memberships, pendingEmail, pendingNormalized] = await Promise.all([
          tx.get(ref), tx.get(db.collection('companies').where('ownerId', '==', uid)),
          tx.get(db.collection('teamMembers').where('uid', '==', uid)),
          tx.get(db.collection('teamMembers').where('email', '==', email).where('status', '==', 'pending')),
          tx.get(db.collection('teamMembers').where('emailNormalized', '==', email).where('status', '==', 'pending')),
        ]);
        if (current.exists) return;
        const companyMembers = [];
        for (const company of owned.docs) {
          // Reading both company ownership and the membership query in this transaction
          // serializes against ownership transfer, acceptance and new membership writes.
          const members = await tx.get(db.collection('teamMembers').where('companyId', '==', company.id));
          if (members.docs.some(member => member.get('uid') && member.get('uid') !== uid && member.get('status') === 'active' && ['admin', 'manager', 'technician'].includes(member.get('role')))) {
            throw new HttpsError('failed-precondition', 'Transfer company ownership to an active administrator before deleting your account. Manage your team and transfer ownership in Company Setup on the web.');
          }
          companyMembers.push(...members.docs.filter(member => member.get('status') === 'pending'));
        }
        const targets = new Map(memberships.docs.map(row => [row.id, row]));
        for (const row of [...pendingEmail.docs, ...pendingNormalized.docs]) {
          if (!row.get('uid') && normalizeEmail(row.get('email')) === email) targets.set(row.id, row);
        }
        for (const row of companyMembers) targets.set(row.id, row);
        if (targets.size > 200) throw new HttpsError('failed-precondition', 'Contact support to finish deleting this account with its large invitation history.');
        tx.create(ref, { status: 'pending', requestedAt: new Date(now()), emailHash: hash(email), invitationIds: [...targets.keys()], businessRecordsRetained: true });
        for (const row of targets.values()) {
          const own = row.get('uid') === uid || !row.get('uid') && normalizeEmail(row.get('email')) === email;
          tx.update(row.ref, { status: 'removed', expiresAt: 0, accountDeletionUid: uid, accountDeletedAt: new Date(now()), updatedAt: new Date(now()).toISOString(), codeHash: FieldValue.delete(),
            ...(own ? { uid: null, email: '', emailNormalized: FieldValue.delete(), name: 'Deleted user' } : { revocationReason: 'owner-account-deleted' }) });
          tx.create(db.collection('rlMembershipAudit').doc(), { action: 'account.delete', companyId: row.get('companyId'), memberId: row.id, actorId: uid, createdAt: new Date(now()) });
        }
      });
    }
    try { return await complete(uid); }
    catch {
      // Do not include SDK error text, identifiers, tokens or personal profile data.
      throw new HttpsError('unavailable', 'Your deletion request is recorded and access is revoked. Deletion will retry automatically. You can retry this request shortly.', { deletionPending: true });
    }
  }
  return { request, complete };
}
module.exports = { accountDeletionHandlers, checkAccount, RECENT_SIGN_IN_SECONDS };
