const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { resolveClaims } = require('./claims');
const { assignmentTarget, buildAssignmentMessage, DEAD_TOKEN_CODES } = require('./notify');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineString } = require('firebase-functions/params');
const { requireAuth, requireManager, rateLimit, normalizeEmail } = require('./security');
const { invitationHandlers } = require('./invitations');
const { recurringHandlers } = require('./recurring');
const { customerHandlers } = require('./customers');
const { portalHandlers } = require('./portal');
const { drainMail } = require('./mail');
const { invoiceEmailHandlers } = require('./invoiceEmail');
const { ownershipHandler } = require('./ownership');

initializeApp();
const db = getFirestore();

const TENANT_COLLECTIONS = ['customers', 'jobs', 'appointments', 'photos', 'estimates', 'estimateTemplates', 'invoices', 'servicePlans', 'serviceLogs'];
const appUrl = defineString('RL_APP_URL', { default: 'https://route-logistics.app' });
const emailFrom = defineString('RL_EMAIL_FROM', { default: '' });
// Deployment dotenv controls both delivery and secret binding. Enabling email requires
// redeploying after RL_SMTP_URL is configured; disabled deployments need no SMTP access.
const emailEnabled = () => process.env.RL_EMAIL_ENABLED === 'true';

async function loadTenancyData(uid, email) {
  const [companiesSnap, membershipsSnap, invitesSnap] = await Promise.all([
    db.collection('companies').where('ownerId', '==', uid).limit(1).get(),
    db.collection('teamMembers').where('uid', '==', uid).get(),
    email
      ? db.collection('teamMembers').where('email', '==', email).where('status', '==', 'pending').get()
      : Promise.resolve({ docs: [] }),
  ]);
  const toObj = (d) => ({ id: d.id, ...d.data() });
  return {
    companies: companiesSnap.docs.map(toObj),
    memberships: membershipsSnap.docs.map(toObj),
    invites: invitesSnap.docs.map(toObj).filter((i) => !i.uid),
  };
}

// Stamps companyId onto legacy owner-only docs so company members can see them.
async function backfillOwnerData(uid, companyId) {
  for (const name of TENANT_COLLECTIONS) {
    const snap = await db.collection(name).where('userId', '==', uid).get();
    const missing = snap.docs.filter((d) => !d.get('companyId'));
    for (let i = 0; i < missing.length; i += 400) {
      const batch = db.batch();
      missing.slice(i, i + 400).forEach((d) => batch.update(d.ref, { companyId }));
      await batch.commit();
    }
  }
}

async function applyClaims(uid, email, emailVerified) {
  const data = await loadTenancyData(uid, email);
  const { claims, activateInviteId } = resolveClaims({ uid, email, emailVerified }, data);
  const auth = getAuth();
  const userRef = db.collection('users').doc(uid);

  if (activateInviteId) {
    await db.collection('teamMembers').doc(activateInviteId).update({
      uid,
      status: 'active',
      activatedAt: new Date().toISOString(),
    });
  }

  const account = await auth.getUser(uid);
  const retained = { ...(account.customClaims || {}) };
  delete retained.companyId;
  delete retained.role;
  delete retained.membershipId;
  await auth.setCustomUserClaims(uid, { ...retained, ...claims });

  if (claims) {
    const userSnap = await userRef.get();
    const updates = { companyId: claims.companyId, rlCompanyId: claims.companyId };
    await userRef.set(updates, { merge: true });
    if (claims.role === 'owner' && !userSnap.get('legacyBackfilledAt')) {
      await backfillOwnerData(uid, claims.companyId);
      await userRef.set({ legacyBackfilledAt: new Date().toISOString() }, { merge: true });
    }
  } else {
    const userSnap = await userRef.get();
    if (userSnap.exists && userSnap.get('companyId')) {
      await userRef.update({ companyId: null });
    }
  }
  return claims;
}

// Callable the client invokes after sign-in / company creation / invite acceptance, then refreshes its ID token.
exports.syncClaims = onCall(async (request) => {
  const { uid, token } = requireAuth(request);
  await rateLimit(db, 'sync-claims', uid, 60);
  const claims = await applyClaims(uid, normalizeEmail(token.email) || null, token.email_verified === true);
  return { claims };
});

const invites = invitationHandlers(db, applyClaims, () => appUrl.value(), emailEnabled);
exports.sendTeamInviteEmail = onCall(invites.sendTeamInviteEmail);
exports.acceptTeamInvite = onCall(invites.acceptTeamInvite);
exports.manageTeamMember = onCall(invites.manageTeamMember);
exports.transferCompanyOwnership = onCall(ownershipHandler(db, applyClaims));
exports.bulkImportCustomers = onCall(customerHandlers(db).bulkImportCustomers);
const portal = portalHandlers(db, getAuth(), emailEnabled);
exports.rlRequestCustomerOTP = onCall(portal.requestCustomerOTP);
exports.rlVerifyCustomerOTP = onCall(portal.verifyCustomerOTP);
exports.getCustomerPortal = onCall(portal.getCustomerPortal);
exports.rlDeliverEmail = onSchedule({ schedule: 'every 1 minutes', secrets: emailEnabled() ? ['RL_SMTP_URL'] : [], timeoutSeconds: 120, maxInstances: 1 }, () => emailEnabled() ? drainMail(db, process.env.RL_SMTP_URL, emailFrom.value()) : undefined);
const invoiceEmails = invoiceEmailHandlers(db, () => appUrl.value(), emailEnabled);
exports.emailInvoice = onCall(invoiceEmails.emailInvoice);
exports.rlQueueInvoiceReminders = onSchedule({ schedule: 'every day 09:00', timeZone: 'Etc/UTC', timeoutSeconds: 540 }, invoiceEmails.reminders);
const recurring = recurringHandlers(db);
exports.generateServicePlanJob = onCall(recurring.generateServicePlanJob);
exports.rlGenerateRecurringJobs = onSchedule({ schedule: 'every day 04:00', timeZone: 'Etc/UTC', timeoutSeconds: 540 }, recurring.generateRecurringJobs);

// Re-evaluates a member's claims when their invite is deactivated or removed, and revokes live sessions.
async function reevaluateMember(uid) {
  if (!uid) return;
  const auth = getAuth();
  const user = await auth.getUser(uid);
  await applyClaims(uid, user.email || null, user.emailVerified);
  await auth.revokeRefreshTokens(uid);
}

exports.onTeamMemberDeleted = onDocumentDeleted('teamMembers/{id}', async (event) => {
  await reevaluateMember(event.data?.get('uid'));
});

exports.onTeamMemberUpdated = onDocumentUpdated('teamMembers/{id}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (after.uid && (before.status !== after.status || before.role !== after.role)) {
    await reevaluateMember(after.uid);
  }
});

// Mobile creates docs without companyId; attribute them to the author's company server-side.
for (const name of TENANT_COLLECTIONS) {
  exports[`stamp_${name}`] = onDocumentCreated(`${name}/{id}`, async (event) => {
    const data = event.data?.data();
    if (!data || data.companyId || !data.userId) return;
    const userSnap = await db.collection('users').doc(data.userId).get();
    const companyId = userSnap.get('companyId');
    if (companyId) {
      // Old claimless tokens must not turn technician-created solo docs into company jobs.
      const account = await getAuth().getUser(data.userId);
      try {
        await requireManager(db, { auth: { uid: data.userId, token: account.customClaims || {} } }, { userId: data.userId, companyId });
      } catch (error) {
        if (error.code === 'permission-denied' || error.code === 'unauthenticated') return;
        throw error;
      }
      await event.data.ref.update({ companyId, stampedAt: FieldValue.serverTimestamp() });
    }
  });
}

// Persist history even when a user has not registered a push device.
async function publishNotification(uid, companyId, message, eventId) {
  const { hash } = require('./security');
  const ref = db.collection('rlNotifications').doc(hash(`${eventId}:${uid}`));
  try {
    await ref.create({ userId: uid, companyId: companyId || null, title: message.title, body: message.body, jobId: message.data.jobId, read: false, createdAt: FieldValue.serverTimestamp() });
  } catch (error) { if (error.code !== 6 && error.code !== 'already-exists') throw error; }
  const tokensSnap = await db.collection('deviceTokens').where('userId', '==', uid).get();
  for (let i = 0; i < tokensSnap.size; i += 500) {
    const docs = tokensSnap.docs.slice(i, i + 500).filter((d) => typeof d.get('token') === 'string');
    if (!docs.length) continue;
    const result = await getMessaging().sendEachForMulticast({ tokens: docs.map((d) => d.get('token')), notification: { title: message.title, body: message.body }, data: message.data });
    await Promise.all(result.responses.flatMap((r, index) => !r.success && DEAD_TOKEN_CODES.has(r.error?.code) ? [docs[index].ref.delete()] : []));
  }
}
async function notifyAssignment(before, after, jobId, eventId) {
  if (!after?.assignedTo || before?.assignedTo === after.assignedTo) return;
  const member = await db.collection('teamMembers').doc(after.assignedTo).get();
  const uid = assignmentTarget(before, after, member.exists ? member.data() : null);
  if (uid) await publishNotification(uid, after.companyId, buildAssignmentMessage(after, jobId), eventId);
}
exports.notifyJobAssigned = onDocumentUpdated('jobs/{jobId}', (event) => notifyAssignment(event.data.before.data(), event.data.after.data(), event.params.jobId, event.id));
exports.rlNotifyNewJobAssigned = onDocumentCreated('jobs/{jobId}', (event) => notifyAssignment(null, event.data.data(), event.params.jobId, event.id));
exports.rlNotifyJobStatus = onDocumentUpdated('jobs/{jobId}', async (event) => {
  const before = event.data.before.data(), after = event.data.after.data();
  if (before.status === after.status || !after.companyId) return;
  const company = await db.collection('companies').doc(after.companyId).get();
  const uid = company.get('ownerId');
  if (!uid) return;
  await publishNotification(uid, after.companyId, {
    title: 'Job status updated', body: `${after.serviceType || 'Service'}: ${after.status}`,
    data: { type: 'job-status', jobId: event.params.jobId, url: '/jobs' },
  }, event.id);
});
