const { createHash } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const hash = (value) => createHash('sha256').update(String(value)).digest('hex');
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function requireAuth(request, verified = false) {
  if (!request.auth || request.auth.token.portal === true) throw new HttpsError('unauthenticated', 'Sign in with your team account.');
  if (verified && request.auth.token.email_verified !== true) throw new HttpsError('failed-precondition', 'Verify your email address first.');
  return request.auth;
}
function documentId(value, label = 'ID') {
  if (typeof value !== 'string' || !value || value.length > 200 || value.includes('/')) throw new HttpsError('invalid-argument', `Invalid ${label}.`);
  return value;
}
// A transaction enforces the limit across concurrent instances. IDs contain no email/IP.
async function rateLimit(db, action, identity, maximum = 30, windowMs = 60_000, now = Date.now()) {
  const ref = db.collection('rlRateLimits').doc(hash(`${action}:${identity}`));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const sameWindow = data && data.resetAt > now;
    const count = sameWindow ? data.count : 0;
    if (count >= maximum) throw new HttpsError('resource-exhausted', 'Too many requests. Please try again later.');
    const resetAt = sameWindow ? data.resetAt : now + windowMs;
    tx.set(ref, { count: count + 1, resetAt, expiresAt: new Date(resetAt) });
  });
}
async function requireCompanyOwner(db, request, companyId) {
  const { uid } = requireAuth(request, true);
  const company = await db.collection('companies').doc(documentId(companyId, 'company')).get();
  if (!company.exists || company.get('ownerId') !== uid) throw new HttpsError('permission-denied', 'Only the company owner can manage the team.');
  return company;
}
async function requireManager(db, request, data) {
  const { uid, token } = requireAuth(request);
  if (!data.companyId) {
    if (data.userId === uid && !token.companyId) {
      const user = await db.collection('users').doc(uid).get();
      if (!user.get('rlCompanyId')) return;
    }
  } else if (token.companyId === data.companyId) {
    const company = await db.collection('companies').doc(data.companyId).get();
    if (company.get('ownerId') === uid) return;
    if (token.membershipId) {
      const member = await db.collection('teamMembers').doc(documentId(token.membershipId)).get();
      if (member.get('uid') === uid && member.get('companyId') === data.companyId && member.get('status') === 'active' && ['admin', 'manager'].includes(member.get('role'))) return;
    }
  }
  throw new HttpsError('permission-denied', 'Manager permission required.');
}
module.exports = { hash, normalizeEmail, validEmail, documentId, requireAuth, rateLimit, requireCompanyOwner, requireManager };
