const { createHash, randomBytes } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { normalizeEmail, rateLimit, requireAuth } = require('./security');

const MODES = ['open', 'approval_required', 'closed'];
const AUTH_LIFETIME_MS = 7 * 86400000;
const hashCode = code => createHash('sha256').update(code).digest('hex');
const policyRef = db => db.doc('rlCompanyRegistration/policy');
const authorizationRef = (db, code) => db.doc(`rlCompanyRegistrationAuthorizations/${hashCode(code)}`);
const validCode = code => typeof code === 'string' && /^[A-Za-z0-9_-]{43}$/.test(code);
const effectiveMode = policy => policy.exists && MODES.includes(policy.get('mode')) ? policy.get('mode') : 'closed';

async function checkCompanyCreation(tx, db, request, code, now = Date.now()) {
  const { uid, token } = requireAuth(request, true);
  const policy = await tx.get(policyRef(db));
  const mode = effectiveMode(policy);
  if (mode === 'closed') throw new HttpsError('permission-denied', 'New company registration is unavailable. Contact Workside Software for access.');
  if (mode === 'open') return { mode, uid, authorization: null };
  if (!validCode(code)) throw new HttpsError('permission-denied', 'A valid Workside company authorization is required.');
  const authorization = authorizationRef(db, code);
  const record = await tx.get(authorization);
  const email = normalizeEmail(token.email || '');
  if (!record.exists || record.get('status') !== 'issued' || !Number.isFinite(record.get('expiresAt')) || record.get('expiresAt') <= now ||
      record.get('email') !== email || (record.get('uid') && record.get('uid') !== uid)) {
    throw new HttpsError('permission-denied', 'This company authorization is invalid, expired, or belongs to another account.');
  }
  return { mode, uid, authorization };
}

function recordCompanyCreation(tx, db, checked, companyId, now = Date.now()) {
  if (!checked.authorization) return;
  tx.update(checked.authorization, { status: 'redeemed', redeemedBy: checked.uid, companyId, redeemedAt: new Date(now).toISOString() });
  tx.create(db.collection('rlCompanyRegistrationAudit').doc(), { action: 'authorization.redeemed', authorizationId: checked.authorization.id, actorId: checked.uid, companyId, createdAt: new Date(now).toISOString() });
}

function companyRegistrationHandler(db, requirePlatformAdmin, { now = () => Date.now(), appUrl = () => 'https://route-logistics.com' } = {}) {
  return async request => {
    const data = request.data || {};
    if (data.action === 'status') {
      const policy = await policyRef(db).get();
      return { mode: effectiveMode(policy), configured: policy.exists && MODES.includes(policy.get('mode')) };
    }
    const admin = await requirePlatformAdmin(request);
    await rateLimit(db, 'company-registration-admin', admin.uid, 90);
    if (data.action === 'admin') {
      const [policy, outstanding, audit] = await Promise.all([
        policyRef(db).get(), db.collection('rlCompanyRegistrationAuthorizations').where('status', '==', 'issued').limit(100).get(),
        db.collection('rlCompanyRegistrationAudit').orderBy('createdAt', 'desc').limit(30).get(),
      ]);
      return { mode: effectiveMode(policy), configured: policy.exists && MODES.includes(policy.get('mode')), revision: policy.get('revision') || 0,
        outstanding: outstanding.docs.map(row => ({ id: row.id, email: row.get('email'), uid: row.get('uid') || null,
          status: row.get('expiresAt') <= now() ? 'expired' : 'issued', expiresAt: row.get('expiresAt'), createdAt: row.get('createdAt') })),
        history: audit.docs.map(row => ({ id: row.id, ...row.data() })) };
    }
    if (data.action === 'policy') {
      if (!MODES.includes(data.mode) || data.confirm !== data.mode || !Number.isInteger(data.expectedRevision) || data.expectedRevision < 0) {
        throw new HttpsError('invalid-argument', 'Confirm a supported registration policy and its current revision.');
      }
      return db.runTransaction(async tx => {
        const actor = await requirePlatformAdmin(request, tx);
        const ref = policyRef(db), old = await tx.get(ref), revision = old.get('revision') || 0;
        if (revision !== data.expectedRevision) throw new HttpsError('aborted', 'Registration policy changed. Refresh before saving.');
        const previous = effectiveMode(old);
        if (old.exists && previous === data.mode) return { mode: previous, revision, unchanged: true };
        const at = new Date(now()).toISOString();
        tx.set(ref, { mode: data.mode, revision: revision + 1, updatedAt: at, updatedBy: actor.uid });
        tx.create(db.collection('rlCompanyRegistrationAudit').doc(), { action: 'policy.changed', actorId: actor.uid, before: previous, after: data.mode, revision: revision + 1, createdAt: at });
        return { mode: data.mode, revision: revision + 1, unchanged: false };
      });
    }
    if (data.action === 'issue') {
      const email = normalizeEmail(data.email || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || (data.uid && !/^[A-Za-z0-9_-]{1,128}$/.test(data.uid))) {
        throw new HttpsError('invalid-argument', 'Enter a valid recipient email or account UID.');
      }
      const code = randomBytes(32).toString('base64url'), at = now();
      const ref = authorizationRef(db, code);
      await db.runTransaction(async tx => {
        const actor = await requirePlatformAdmin(request, tx);
        const policy = await tx.get(policyRef(db));
        if (effectiveMode(policy) !== 'approval_required') throw new HttpsError('failed-precondition', 'Set the registration policy to approval required before issuing a code.');
        tx.create(ref, { email, uid: data.uid || null, status: 'issued', createdAt: new Date(at).toISOString(), expiresAt: at + AUTH_LIFETIME_MS, issuedBy: actor.uid });
        tx.create(db.collection('rlCompanyRegistrationAudit').doc(), { action: 'authorization.issued', authorizationId: ref.id, actorId: actor.uid, email, createdAt: new Date(at).toISOString() });
      });
      return { id: ref.id, email, expiresAt: at + AUTH_LIFETIME_MS, link: `${appUrl().replace(/\/$/, '')}/onboarding#authorization=${code}` };
    }
    if (data.action === 'revoke') {
      if (typeof data.id !== 'string' || !/^[a-f0-9]{64}$/.test(data.id)) throw new HttpsError('invalid-argument', 'Select a valid authorization.');
      return db.runTransaction(async tx => {
        const actor = await requirePlatformAdmin(request, tx), ref = db.doc(`rlCompanyRegistrationAuthorizations/${data.id}`), row = await tx.get(ref);
        if (!row.exists || row.get('status') !== 'issued') throw new HttpsError('failed-precondition', 'This authorization is no longer outstanding.');
        const at = new Date(now()).toISOString();
        tx.update(ref, { status: 'revoked', revokedBy: actor.uid, revokedAt: at });
        tx.create(db.collection('rlCompanyRegistrationAudit').doc(), { action: 'authorization.revoked', authorizationId: ref.id, actorId: actor.uid, createdAt: at });
        return { revoked: true };
      });
    }
    throw new HttpsError('invalid-argument', 'Choose a supported company registration action.');
  };
}

module.exports = { companyRegistrationHandler, checkCompanyCreation, recordCompanyCreation, effectiveMode, hashCode };
