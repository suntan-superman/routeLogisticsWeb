const { randomBytes, randomInt, timingSafeEqual } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { hash, normalizeEmail, validEmail, rateLimit } = require('./security');

const CODE_LIFETIME_MS = 10 * 60_000;
const INVALID_CODE = 'Code is invalid or expired. Request a new code or sign in with your password.';
const REQUEST_MESSAGE = 'If this verified account supports email sign-in, a code will arrive shortly. Check your inbox and junk folder.';
const staffCodeHash = (id, code) => hash(`staff-login:${id}:${code}`);
function eligibleAccount(user, email) {
  return !!user && !user.disabled && user.emailVerified === true
    && normalizeEmail(user.email) === email && !user.uid.startsWith('rl_customer_')
    && user.customClaims?.portal !== true && !(user.multiFactor?.enrolledFactors || []).length;
}
async function existingAccount(auth, method, value) {
  try { return await auth[method](value); }
  catch (error) { if (error.code === 'auth/user-not-found') return null; throw error; }
}

function staffLoginHandlers(db, auth, emailEnabled = () => true) {
  const requireEmail = () => {
    if (!emailEnabled()) throw new HttpsError('failed-precondition', 'Email sign-in is unavailable. Use your password.');
  };
  return {
    requestStaffOTP: async (request) => {
      requireEmail();
      const email = normalizeEmail(request.data?.email);
      if (!validEmail(email)) throw new HttpsError('invalid-argument', 'Enter a valid email address.');
      await rateLimit(db, 'staff-login-request-ip', request.rawRequest?.ip || 'unknown', 15, 15 * 60_000);
      await rateLimit(db, 'staff-login-request-email', email, 3, 15 * 60_000);
      const challengeId = randomBytes(24).toString('hex');
      const user = await existingAccount(auth, 'getUserByEmail', email);
      if (eligibleAccount(user, email)) {
        const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
        const now = Date.now(), emailHash = hash(email);
        const batch = db.batch();
        batch.create(db.doc(`rlStaffLoginChallenges/${challengeId}`), {
          uid: user.uid, email, emailHash, codeHash: staffCodeHash(challengeId, code),
          authValidAfterTime: user.tokensValidAfterTime || '', expiresAt: new Date(now + CODE_LIFETIME_MS),
          attempts: 0, consumed: false, createdAt: new Date(now),
        });
        // The latest request invalidates earlier codes, including concurrent resends.
        batch.set(db.doc(`rlStaffLoginRequests/${emailHash}`), { challengeId, expiresAt: new Date(now + CODE_LIFETIME_MS) });
        batch.create(db.collection('rlMail').doc(), {
          staffLoginChallengeId: challengeId, to: email, subject: 'Your Route Logistics staff sign-in code',
          text: `Your Route Logistics sign-in code is ${code}.\n\nIt expires in 10 minutes and can be used once. Only enter it on route-logistics.com. If you did not request this code, ignore this email.`,
          status: 'queued', availableAt: now, createdAt: new Date(now), expiresAt: new Date(now + CODE_LIFETIME_MS),
        });
        await batch.commit();
      }
      // Never reveal whether an email exists, is verified, is disabled, or has MFA.
      return { challengeId, message: REQUEST_MESSAGE, expiresInSeconds: CODE_LIFETIME_MS / 1000 };
    },
    verifyStaffOTP: async (request) => {
      requireEmail();
      await rateLimit(db, 'staff-login-verify-ip', request.rawRequest?.ip || 'unknown', 30, 15 * 60_000);
      const id = request.data?.challengeId, code = String(request.data?.code || '').trim();
      if (typeof id !== 'string' || !/^[a-f0-9]{48}$/.test(id) || !/^\d{6}$/.test(code)) throw new HttpsError('permission-denied', INVALID_CODE);
      const ref = db.doc(`rlStaffLoginChallenges/${id}`);
      const identity = await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref), data = snapshot.data();
        if (!data || data.consumed || data.attempts >= 5 || data.expiresAt.toMillis() <= Date.now() || !/^[a-f0-9]{64}$/.test(data.codeHash || '')) return null;
        const latest = await tx.get(db.doc(`rlStaffLoginRequests/${data.emailHash}`));
        if (latest.get('challengeId') !== id) return null;
        const valid = timingSafeEqual(Buffer.from(data.codeHash, 'hex'), Buffer.from(staffCodeHash(id, code), 'hex'));
        tx.update(ref, { attempts: data.attempts + 1, consumed: valid, ...(valid ? { consumedAt: new Date() } : {}) });
        return valid ? { uid: data.uid, email: data.email, authValidAfterTime: data.authValidAfterTime } : null;
      });
      if (!identity) throw new HttpsError('permission-denied', INVALID_CODE);
      // Recheck live account policy after consuming the code. Never verify an email,
      // create a user, accept an invitation, or bypass an enrolled second factor.
      const user = await existingAccount(auth, 'getUser', identity.uid);
      if (!eligibleAccount(user, identity.email) || (user.tokensValidAfterTime || '') !== identity.authValidAfterTime) throw new HttpsError('permission-denied', INVALID_CODE);
      return { token: await auth.createCustomToken(user.uid) };
    },
  };
}

module.exports = { staffLoginHandlers, staffCodeHash, eligibleAccount };
