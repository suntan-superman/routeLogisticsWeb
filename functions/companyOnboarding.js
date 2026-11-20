const { HttpsError } = require('firebase-functions/v2/https');
const { requireAuth, normalizeEmail, rateLimit } = require('./security');

const clean = (value, max = 500) => String(value || '').trim().slice(0, max);
const validZone = value => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return true; } catch { return false; }
};
function cleanDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpsError('invalid-argument', 'Invalid onboarding draft.');
  const profile = input.profile && typeof input.profile === 'object' ? input.profile : {};
  const services = Array.isArray(input.services) ? input.services.map(value => clean(value, 100)).filter(Boolean).slice(0, 30) : [];
  const businessHours = input.businessHours && typeof input.businessHours === 'object' ? input.businessHours : {};
  const allowedDays = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const hours = Object.fromEntries(allowedDays.map(day => {
    const value = businessHours[day] || {};
    const validTime = time => typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
    const open = validTime(value.open) ? value.open : '';
    const close = validTime(value.close) ? value.close : '';
    if (!value.closed && (!open || !close || open >= close)) throw new HttpsError('invalid-argument', `Choose valid opening and closing times for ${day}.`);
    return [day, { closed: value.closed === true, open, close }];
  }));
  const timeZone = clean(input.timeZone, 100) || 'America/Los_Angeles';
  if (!validZone(timeZone)) throw new HttpsError('invalid-argument', 'Choose a valid company time zone.');
  return {
    currentStep: Math.max(1, Math.min(7, Number(input.currentStep) || 1)),
    profile: { name: clean(profile.name, 200), businessName: clean(profile.businessName, 200), phone: clean(profile.phone, 40), address: clean(profile.address, 278), city: clean(profile.city, 100), state: clean(profile.state, 50), zipCode: clean(profile.zipCode, 20), description: clean(profile.description, 2000) },
    services: [...new Set(services)], timeZone, businessHours: hours,
    serviceArea: input.serviceArea && typeof input.serviceArea === 'object' ? { method: input.serviceArea.method === 'radius' ? 'radius' : 'zip', radiusMiles: Math.min(300, Math.max(0.1, Number(input.serviceArea.radiusMiles) || 25)), zipCodes: Array.isArray(input.serviceArea.zipCodes) ? [...new Set(input.serviceArea.zipCodes.map(v => clean(v, 10).slice(0, 10)))].filter(v => /^\d{5}$/.test(v)).slice(0, 500) : [] } : { method: 'zip', radiusMiles: 25, zipCodes: [] },
    invites: Array.isArray(input.invites) ? input.invites.slice(0, 50).map(row => ({ email: normalizeEmail(clean(row?.email, 254)), role: row?.role === 'manager' ? 'manager' : 'technician' })).filter(row => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) : [],
  };
}
function companyOnboardingHandlers(db) {
  const draftRef = uid => db.doc(`rlCompanyOnboardingDrafts/${uid}`);
  async function assertEligible(uid, token) {
    if (token.email_verified !== true) throw new HttpsError('failed-precondition', 'Verify your email before continuing company setup.');
    const [profile, owned, membership, deletion] = await Promise.all([
      db.doc(`users/${uid}`).get(), db.collection('companies').where('ownerId', '==', uid).limit(1).get(),
      db.collection('teamMembers').where('uid', '==', uid).limit(1).get(), db.doc(`rlAccountDeletions/${uid}`).get(),
    ]);
    if (deletion.exists) throw new HttpsError('permission-denied', 'This account has been deleted.');
    return { profile, owned, membership };
  }
  return {
    getDraft: async request => {
      const { uid } = requireAuth(request); await rateLimit(db, 'onboarding-read', uid, 60);
      const eligibility = await assertEligible(uid, request.auth.token);
      if (!eligibility.owned.empty || !eligibility.membership.empty || eligibility.profile.get('companyId') || eligibility.profile.get('rlCompanyId')) return { activated: true };
      const snap = await draftRef(uid).get(), profileData = eligibility.profile.data() || {};
      return { draft: snap.exists ? snap.data().draft : null, revision: snap.exists ? snap.get('revision') : 0, profile: { name: clean(profileData.name, 200), businessName: clean(profileData.businessName, 200), phone: clean(profileData.phoneNumber || profileData.phone, 40), address: clean(profileData.address, 278), city: clean(profileData.city, 100), state: clean(profileData.state, 50), zipCode: clean(profileData.zipCode, 20) } };
    },
    saveDraft: async request => {
      const { uid } = requireAuth(request); await rateLimit(db, 'onboarding-save', uid, 120);
      const draft = cleanDraft(request.data?.draft), expectedRevision = Number(request.data?.expectedRevision) || 0;
      const ref = draftRef(uid);
      return db.runTransaction(async tx => {
        const [old, profile, owned, memberships, deletion] = await Promise.all([tx.get(ref), tx.get(db.doc(`users/${uid}`)), tx.get(db.collection('companies').where('ownerId', '==', uid).limit(1)), tx.get(db.collection('teamMembers').where('uid', '==', uid).limit(1)), tx.get(db.doc(`rlAccountDeletions/${uid}`))]);
        if (request.auth.token.email_verified !== true) throw new HttpsError('failed-precondition', 'Verify your email before continuing company setup.');
        if (deletion.exists || profile.get('companyId') || profile.get('rlCompanyId') || !owned.empty || !memberships.empty) throw new HttpsError('permission-denied', 'This account already belongs to a company or is unavailable.');
        const revision = old.exists ? old.get('revision') : 0;
        if (revision !== expectedRevision) throw new HttpsError('aborted', 'This setup changed in another session. Reload the latest saved draft.');
        tx.set(ref, { ownerId: uid, revision: revision + 1, draft, updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
        return { revision: revision + 1 };
      });
    },
    activate: async request => {
      const { uid } = requireAuth(request); await rateLimit(db, 'onboarding-activate', uid, 10);
      const ref = draftRef(uid), companyRef = db.collection('companies').doc(), profileRef = db.doc(`users/${uid}`);
      return db.runTransaction(async tx => {
        const [draftSnap, profile, owned, memberships, invites, deletion] = await Promise.all([tx.get(ref), tx.get(profileRef), tx.get(db.collection('companies').where('ownerId', '==', uid).limit(1)), tx.get(db.collection('teamMembers').where('uid', '==', uid).limit(1)), tx.get(db.collection('teamMembers').where('email', '==', normalizeEmail(request.auth.token.email || '')).limit(1)), tx.get(db.doc(`rlAccountDeletions/${uid}`))]);
        if (request.auth.token.email_verified !== true) throw new HttpsError('failed-precondition', 'Verify your email before activating your company.');
        if (deletion.exists) throw new HttpsError('permission-denied', 'This account has been deleted.');
        if (draftSnap.exists && draftSnap.get('activatedCompanyId')) {
          const existing = await tx.get(db.doc(`companies/${draftSnap.get('activatedCompanyId')}`));
          if (existing.exists && existing.get('ownerId') === uid) return { companyId: existing.id, alreadyActivated: true };
        }
        if (profile.get('companyId') || profile.get('rlCompanyId') || !owned.empty || !memberships.empty || !invites.empty) throw new HttpsError('permission-denied', 'This account already belongs to a company or invitation.');
        const draft = draftSnap.exists ? cleanDraft(draftSnap.get('draft')) : null;
        if (!draft || !draft.profile.name || !draft.profile.businessName || !draft.services.length) throw new HttpsError('failed-precondition', 'Complete your company profile and add at least one service before activation.');
        const now = new Date().toISOString();
        tx.create(companyRef, { ownerId: uid, name: draft.profile.name, businessName: draft.profile.businessName, phone: draft.profile.phone, address: draft.profile.address, city: draft.profile.city, state: draft.profile.state, zipCode: draft.profile.zipCode, description: draft.profile.description, services: draft.services, serviceCategories: draft.services, businessHours: draft.businessHours, timeZone: draft.timeZone, onboardingServiceArea: draft.serviceArea, createdAt: now, updatedAt: now });
        tx.set(profileRef, { companyId: companyRef.id, rlCompanyId: companyRef.id, businessName: draft.profile.businessName, updatedAt: now }, { merge: true });
        tx.set(ref, { ownerId: uid, revision: (draftSnap.get('revision') || 0) + 1, draft, activatedCompanyId: companyRef.id, activatedAt: now, updatedAt: now }, { merge: true });
        return { companyId: companyRef.id, alreadyActivated: false };
      });
    },
  };
}
module.exports = { companyOnboardingHandlers, cleanDraft };
