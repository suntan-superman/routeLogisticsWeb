const { HttpsError } = require('firebase-functions/v2/https');

const GEO_FIELDS = ['address', 'city', 'state', 'zipCode', 'postalCode', 'latitude', 'longitude', 'location'];
const normalized = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
function legacyPropertyAddress(input = {}) {
  if (typeof input.address !== 'string') return '';
  const street = input.address.trim();
  return [street, ...[input.city, input.state, input.zipCode || input.postalCode].filter(value => typeof value === 'string' && value.trim() && !normalized(street).includes(normalized(value)))].filter(Boolean).join(', ');
}
function propertyAddress(input = {}) {
  const property = input.serviceProperty;
  const address = typeof property === 'string' ? property : property && typeof property === 'object' ? property.address ?? property.formattedAddress : input.propertyAddress !== undefined ? input.propertyAddress : legacyPropertyAddress(input);
  return typeof address === 'string' ? address.trim() : '';
}
function servicePropertySite(data = {}) {
  if (data.serviceProperty === undefined || data.serviceProperty === null) return null;
  const property = data.serviceProperty;
  const latitude = property?.latitude, longitude = property?.longitude;
  const valid = typeof latitude === 'number' && Number.isFinite(latitude) && Math.abs(latitude) <= 90 && typeof longitude === 'number' && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
  // An explicit property is authoritative even when its coordinates are absent.
  // Never borrow a customer's billing coordinates or a stale legacy job point.
  return { address: propertyAddress(data), city: '', state: '', zipCode: typeof property?.postalCode === 'string' ? property.postalCode : '', latitude: valid ? latitude : null, longitude: valid ? longitude : null, location: valid ? { latitude, longitude } : null };
}
function geometryChanged(input = {}, before = {}) {
  if (input.serviceProperty !== undefined || input.propertyAddress !== undefined) {
    if (normalized(propertyAddress(input)) !== normalized(propertyAddress(before))) return true;
  }
  if (input.serviceCategory !== undefined && normalized(input.serviceCategory) !== normalized(before.serviceCategory)) return true;
  if (input.serviceAreaExceptionId && input.serviceAreaExceptionId !== before.serviceAreaEligibility?.exceptionId) return true;
  return GEO_FIELDS.some(key => Object.hasOwn(input, key) && normalized(input[key]) !== normalized(before[key]));
}
function storedGeometry(data = {}) {
  return Object.fromEntries(['serviceProperty', 'serviceCategory', 'serviceAreaEligibility', 'serviceAreaManaged'].filter(key => data[key] !== undefined).map(key => [key, data[key]]));
}
function serviceAreaWorkflow(db, config = {}) {
  const checker = config.serviceAreas || require('./serviceAreas').serviceAreaHandlers(db);
  return {
    async prepare(scope, input = {}, before = {}, purpose = 'scheduling', isNew = false) {
      if (!isNew && !geometryChanged(input, before)) return null;
      // Only the explicitly selected service property is used. A customer or
      // prospect contact/billing address is never an eligibility fallback.
      const explicitProperty = input.serviceProperty !== undefined || input.propertyAddress !== undefined;
      const legacyAddressEdit = ['address', 'city', 'state', 'zipCode', 'postalCode'].some(key => input[key] !== undefined);
      const address = explicitProperty ? propertyAddress(input) : legacyAddressEdit ? legacyPropertyAddress({ ...before, ...input }) : propertyAddress(before);
      if (!isNew && (explicitProperty || legacyAddressEdit) && !address && propertyAddress(before)) throw new HttpsError('failed-precondition', 'Enter a service property address that Google can verify before replacing the saved address.', { addressValidation: { status: 'invalid', message: 'Enter a service property address that Google can verify.' } });
      const category = typeof input.serviceCategory === 'string' ? input.serviceCategory.trim() : before.serviceCategory || '';
      const exceptionId = typeof input.serviceAreaExceptionId === 'string' && input.serviceAreaExceptionId.trim() ? input.serviceAreaExceptionId.trim() : undefined;
      const result = await checker.checkForWorkflow({ companyId: scope.companyId, uid: scope.uid, propertyAddress: address, serviceCategory: category, purpose, ...(exceptionId ? { exceptionId } : {}) });
      if (!result?.eligible) throw new HttpsError(result?.addressValidation?.status === 'unavailable' ? 'unavailable' : 'failed-precondition', result?.message || 'The service property could not be validated against this provider’s service area.', { serviceArea: { status: result?.status || 'unavailable', reason: result?.reason || 'validation-required' }, ...(result?.addressValidation ? { addressValidation: result.addressValidation } : {}) });
      const patch = {};
      if (category || Object.hasOwn(input, 'serviceCategory')) patch.serviceCategory = category;
      if (result.property) {
        const property = result.property;
        if (!property || typeof property.formattedAddress !== 'string' || !property.formattedAddress || !Number.isFinite(property.latitude) || Math.abs(property.latitude) > 90 || !Number.isFinite(property.longitude) || Math.abs(property.longitude) > 180) throw new HttpsError('failed-precondition', 'A validated service property location is required.');
        patch.serviceProperty = { address: property.formattedAddress, formattedAddress: property.formattedAddress, postalCode: property.postalCode || '', latitude: property.latitude, longitude: property.longitude, validated: true, source: property.source || 'google-address-validation', validatedAt: property.validatedAt || new Date().toISOString() };
        patch.address = property.formattedAddress;
        patch.city = '';
        patch.state = '';
        patch.zipCode = property.postalCode || '';
        patch.latitude = property.latitude;
        patch.longitude = property.longitude;
        patch.location = { latitude: property.latitude, longitude: property.longitude };
        patch.serviceAreaEligibility = { status: result.status, eligible: true, settingsRevision: result.settingsRevision, serviceCategory: category, purpose, checkedAt: new Date().toISOString(), exceptionId: result.exceptionId || null };
        patch.serviceAreaManaged = result.status !== 'unconfigured';
      } else if (address) throw new HttpsError('failed-precondition', 'Google must verify this service property before it can be saved.');
      return { companyId: scope.companyId, actor: { uid: scope.uid, memberId: scope.memberId || null, role: scope.role }, result, propertyAddress: address, serviceCategory: category, purpose, ...(exceptionId ? { exceptionId } : {}), patch };
    },
    async assertCurrent(tx, prepared) {
      if (!prepared) return;
      const { actor, companyId } = prepared;
      if (!actor?.uid || !['owner', 'admin', 'manager'].includes(actor.role) || actor.role !== 'owner' && !actor.memberId) throw new HttpsError('permission-denied', 'Current company authorization is required to save this service property.');
      const deletion = await tx.get(db.doc(`rlAccountDeletions/${actor.uid}`));
      if (deletion.exists) throw new HttpsError('permission-denied', 'This account no longer has access.');
      if (!companyId) {
        const user = await tx.get(db.doc(`users/${actor.uid}`));
        if (user.get('rlCompanyId') || user.get('companyId')) throw new HttpsError('permission-denied', 'Your workspace changed. Refresh before saving.');
        await checker.assertWorkflowCurrent(tx, prepared); return;
      }
      const current = await tx.get(db.doc(actor.role === 'owner' ? `companies/${companyId}` : `teamMembers/${actor.memberId}`));
      if (!current.exists || (actor.role === 'owner' ? current.get('ownerId') !== actor.uid : current.get('uid') !== actor.uid || current.get('companyId') !== companyId || current.get('status') !== 'active' || current.get('role') !== actor.role)) throw new HttpsError('permission-denied', 'Your company access changed while the service property was being checked. Refresh your access before saving.');
      await checker.assertWorkflowCurrent(tx, prepared);
    },
  };
}
module.exports = { serviceAreaWorkflow, propertyAddress, servicePropertySite, geometryChanged, storedGeometry };
