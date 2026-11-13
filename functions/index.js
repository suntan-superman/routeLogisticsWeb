const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { resolveClaims } = require('./claims');

initializeApp();
const db = getFirestore();

const TENANT_COLLECTIONS = ['customers', 'jobs', 'appointments', 'photos', 'estimates', 'estimateTemplates'];

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

  await auth.setCustomUserClaims(uid, claims);

  if (claims) {
    const userSnap = await userRef.get();
    const updates = { companyId: claims.companyId };
    if (userSnap.exists) {
      await userRef.update(updates);
    }
    if (claims.role === 'owner' && !userSnap.get('legacyBackfilledAt')) {
      await backfillOwnerData(uid, claims.companyId);
      await userRef.update({ legacyBackfilledAt: new Date().toISOString() });
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
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const { uid, token } = request.auth;
  const claims = await applyClaims(uid, token.email || null, token.email_verified === true);
  return { claims };
});

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
      await event.data.ref.update({ companyId, stampedAt: FieldValue.serverTimestamp() });
    }
  });
}
