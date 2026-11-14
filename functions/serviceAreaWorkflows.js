const { HttpsError } = require('firebase-functions/v2/https');

const GEO_FIELDS = ['address', 'city', 'state', 'zipCode', 'latitude', 'longitude'];
const normalized = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
function propertyAddress(input = {}) {
  const property = input.serviceProperty;
  const address = typeof property === 'string' ? property : property && typeof property === 'object' ? property.address ?? property.formattedAddress : input.propertyAddress;
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
      if (!scope.companyId || !isNew && !geometryChanged(input, before)) return null;
      // Only the explicitly selected service property is used. A customer or
      // prospect contact/billing address is never an eligibility fallback.
      const address = propertyAddress(input) || (input.serviceProperty === undefined && input.propertyAddress === undefined ? propertyAddress(before) : '');
      const category = typeof input.serviceCategory === 'string' ? input.serviceCategory.trim() : before.serviceCategory || '';
      const exceptionId = typeof input.serviceAreaExceptionId === 'string' && input.serviceAreaExceptionId.trim() ? input.serviceAreaExceptionId.trim() : undefined;
      const result = await checker.checkForWorkflow({ companyId: scope.companyId, propertyAddress: address, serviceCategory: category, purpose, ...(exceptionId ? { exceptionId } : {}) });
      if (!result?.eligible) throw new HttpsError('failed-precondition', result?.message || 'The service property could not be validated against this provider’s service area.', { serviceArea: { status: result?.status || 'unavailable', reason: result?.reason || 'validation-required' } });
      const patch = {};
      if (category || Object.hasOwn(input, 'serviceCategory')) patch.serviceCategory = category;
      if (result.status !== 'unconfigured') {
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
        patch.serviceAreaManaged = true;
      } else if (address) {
        patch.serviceProperty = { address, validated: false };
        patch.address = address;
        patch.city = '';
        patch.state = '';
        patch.zipCode = '';
        patch.latitude = null;
        patch.longitude = null;
        patch.location = null;
        patch.serviceAreaEligibility = { status: 'unconfigured', eligible: true, settingsRevision: 0, serviceCategory: category, purpose, checkedAt: new Date().toISOString(), exceptionId: null };
        patch.serviceAreaManaged = false;
      }
      return { companyId: scope.companyId, actor: { uid: scope.uid, memberId: scope.memberId || null, role: scope.role }, result, propertyAddress: address, serviceCategory: category, purpose, ...(exceptionId ? { exceptionId } : {}), patch };
    },
    async assertCurrent(tx, prepared) {
      if (!prepared) return;
      const { actor, companyId } = prepared;
      if (!actor?.uid || !['owner', 'admin', 'manager'].includes(actor.role) || actor.role !== 'owner' && !actor.memberId) throw new HttpsError('permission-denied', 'Current company authorization is required to save this service property.');
      const current = await tx.get(db.doc(actor.role === 'owner' ? `companies/${companyId}` : `teamMembers/${actor.memberId}`));
      if (!current.exists || (actor.role === 'owner' ? current.get('ownerId') !== actor.uid : current.get('uid') !== actor.uid || current.get('companyId') !== companyId || current.get('status') !== 'active' || current.get('role') !== actor.role)) throw new HttpsError('permission-denied', 'Your company access changed while the service property was being checked. Refresh your access before saving.');
      await checker.assertWorkflowCurrent(tx, prepared);
    },
  };
}
module.exports = { serviceAreaWorkflow, propertyAddress, servicePropertySite, geometryChanged, storedGeometry };
