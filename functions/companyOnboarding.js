const { HttpsError } = require('firebase-functions/v2/https');
const { randomUUID } = require('node:crypto');
const { requireAuth, requireStaff, normalizeEmail, rateLimit } = require('./security');

const clean = (value, max = 500) => String(value || '').trim().slice(0, max);
const validZone = value => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return true; } catch { return false; }
};
const allowedDays = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
function cleanBusinessHours(input) {
  const businessHours = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return Object.fromEntries(allowedDays.map(day => {
    const value = businessHours[day] || { closed: ['saturday', 'sunday'].includes(day), open: '09:00', close: '17:00' };
    const validTime = time => typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
    const open = validTime(value.open) ? value.open : '';
    const close = validTime(value.close) ? value.close : '';
    if (!value.closed && (!open || !close || open >= close)) throw new HttpsError('invalid-argument', `Choose valid opening and closing times for ${day}.`);
    return [day, { closed: value.closed === true, open, close }];
  }));
}
function cleanDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpsError('invalid-argument', 'Invalid onboarding draft.');
  const profile = input.profile && typeof input.profile === 'object' ? input.profile : {};
  const services = Array.isArray(input.services) ? input.services.map(value => clean(value, 100)).filter(Boolean).slice(0, 30) : [];
  const hours = cleanBusinessHours(input.businessHours);
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
const projectProfile = data => ({
  name: clean(data.ownerName || data.name, 200),
  businessName: clean(data.businessName || data.name, 200),
  phone: clean(data.phone || data.phoneNumber, 40), address: clean(data.address, 278), city: clean(data.city, 100),
  state: clean(data.state, 50), zipCode: clean(data.zipCode, 20), description: clean(data.description, 2000),
});
const servicesFor = data => {
  const source = Array.isArray(data.services) && data.services.length ? data.services : data.serviceCategories || [];
  return [...new Set(source.map(value => clean(value, 100)).filter(Boolean))].slice(0, 30);
};
function reviewSection(section, input) {
  if (section === 'profile') {
    const source = input && typeof input === 'object' ? input : {};
    const profile = { businessName: clean(source.businessName, 200), phone: clean(source.phone, 40), address: clean(source.address, 278), city: clean(source.city, 100), state: clean(source.state, 50), zipCode: clean(source.zipCode, 20), description: clean(source.description, 2000) };
    if (!profile.businessName) throw new HttpsError('invalid-argument', 'Enter the company name before saving.');
    return profile;
  }
  if (section === 'services') {
    const services = Array.isArray(input) ? [...new Set(input.map(value => clean(value, 100)).filter(Boolean))].slice(0, 30) : [];
    if (!services.length) throw new HttpsError('invalid-argument', 'Keep at least one company service.');
    return { services, serviceCategories: services };
  }
  if (section === 'hours') {
    const timeZone = clean(input?.timeZone, 100) || 'America/Los_Angeles';
    if (!validZone(timeZone)) throw new HttpsError('invalid-argument', 'Choose a valid company time zone.');
    return { timeZone, businessHours: cleanBusinessHours(input?.businessHours) };
  }
  throw new HttpsError('invalid-argument', 'Choose a supported company setup section.');
}
const comparable = value => JSON.stringify(value);
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
  async function reviewScope(request) {
    const { token } = requireAuth(request, true);
    const companyId = clean(token.companyId, 200);
    const scope = await requireStaff(db, request, companyId);
    if (!scope.company.exists || scope.company.get('deletedAt') || scope.company.get('isActive') === false) throw new HttpsError('permission-denied', 'An active company is required.');
    if (!['owner', 'admin'].includes(scope.role)) throw new HttpsError('permission-denied', 'Only the company owner or an administrator can review company setup.');
    return { ...scope, companyId };
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
        tx.create(companyRef, { ownerId: uid, ownerName: draft.profile.name, name: draft.profile.businessName, businessName: draft.profile.businessName, phone: draft.profile.phone, address: draft.profile.address, city: draft.profile.city, state: draft.profile.state, zipCode: draft.profile.zipCode, description: draft.profile.description, services: draft.services, serviceCategories: draft.services, businessHours: draft.businessHours, timeZone: draft.timeZone, onboardingServiceArea: draft.serviceArea, isActive: true, status: 'active', createdAt: now, updatedAt: now });
        tx.set(profileRef, { companyId: companyRef.id, rlCompanyId: companyRef.id, businessName: draft.profile.businessName, updatedAt: now }, { merge: true });
        tx.set(ref, { ownerId: uid, revision: (draftSnap.get('revision') || 0) + 1, draft, activatedCompanyId: companyRef.id, activatedAt: now, updatedAt: now }, { merge: true });
        return { companyId: companyRef.id, alreadyActivated: false };
      });
    },
    review: async request => {
      const scope = await reviewScope(request); await rateLimit(db, 'company-setup-review', scope.uid, 60);
      const action = request.data?.action || 'get', companyRef = db.doc(`companies/${scope.companyId}`);
      if (action === 'get') {
        const [company, members, owner] = await Promise.all([
          companyRef.get(), db.collection('teamMembers').where('companyId', '==', scope.companyId).limit(200).get(), db.doc(`users/${scope.company.get('ownerId')}`).get(),
        ]);
        const data = company.data() || {}, ownerId = company.get('ownerId');
        const team = [{ id: `owner:${ownerId}`, name: clean(owner.get('name'), 200), email: normalizeEmail(owner.get('email')), role: 'owner', status: 'active' }];
        for (const row of members.docs) {
          if (row.get('uid') === ownerId || ['removed', 'superseded'].includes(row.get('status'))) continue;
          team.push({ id: row.id, name: clean(row.get('name') || row.get('displayName'), 200), email: normalizeEmail(row.get('email')), role: clean(row.get('role'), 30), status: clean(row.get('status'), 30), invitationStatus: clean(row.get('invitationStatus'), 30) });
        }
        return { companyId: scope.companyId, revision: company.get('setupReviewRevision') || 0, profile: { ...projectProfile(data), name: clean(owner.get('name') || data.name, 200) }, services: servicesFor(data), timeZone: clean(data.timeZone, 100) || 'America/Los_Angeles', businessHours: cleanBusinessHours(data.businessHours), team };
      }
      if (action !== 'save') throw new HttpsError('invalid-argument', 'Choose a supported company setup action.');
      const section = clean(request.data?.section, 30), updates = reviewSection(section, request.data?.value), expectedRevision = Number(request.data?.expectedRevision);
      if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new HttpsError('invalid-argument', 'Reload company setup before saving.');
      return db.runTransaction(async tx => {
        const [company, liveMember] = await Promise.all([tx.get(companyRef), scope.role === 'admin' && scope.memberId ? tx.get(db.doc(`teamMembers/${scope.memberId}`)) : Promise.resolve(null)]);
        const authorized = company.exists && (scope.role === 'owner' ? company.get('ownerId') === scope.uid : liveMember?.exists && liveMember.get('uid') === scope.uid && liveMember.get('companyId') === scope.companyId && liveMember.get('status') === 'active' && liveMember.get('role') === 'admin');
        if (!authorized) throw new HttpsError('permission-denied', 'Current owner or administrator authorization is required.');
        const revision = company.get('setupReviewRevision') || 0;
        if (revision !== expectedRevision) throw new HttpsError('aborted', 'Company setup changed in another session. Reload before saving.');
        const projected = projectProfile(company.data() || {}), existing = section === 'profile' ? { businessName: projected.businessName, phone: projected.phone, address: projected.address, city: projected.city, state: projected.state, zipCode: projected.zipCode, description: projected.description } : section === 'services' ? { services: servicesFor(company.data() || {}), serviceCategories: servicesFor(company.data() || {}) } : { timeZone: company.get('timeZone') || 'America/Los_Angeles', businessHours: cleanBusinessHours(company.get('businessHours')) };
        if (comparable(existing) === comparable(updates)) return { revision, unchanged: true };
        const now = new Date().toISOString(), nextRevision = revision + 1;
        tx.update(companyRef, { ...updates, ...(section === 'profile' ? { name: updates.businessName } : {}), setupReviewRevision: nextRevision, updatedAt: now });
        tx.create(db.doc(`rlCompanySetupAudit/${randomUUID()}`), { companyId: scope.companyId, section, actorId: scope.uid, actorRole: scope.role, revision: nextRevision, before: existing, after: updates, createdAt: now });
        return { revision: nextRevision, unchanged: false };
      });
    },
  };
}
module.exports = { companyOnboardingHandlers, cleanDraft, cleanBusinessHours, reviewSection };
