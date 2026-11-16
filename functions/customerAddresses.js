const { HttpsError } = require('firebase-functions/v2/https');
const { requireCapability } = require('./access');
const { documentId, normalizeEmail, validEmail, rateLimit } = require('./security');
const { projectCustomer, customerVersion } = require('./workData');
const { serviceAreaHandlers } = require('./serviceAreas');

const TEXT_FIELDS = ['name', 'firstName', 'lastName', 'email', 'phone', 'phoneNumber', 'city', 'state', 'zipCode', 'postalCode', 'notes', 'serviceInstructions', 'status'];
const ADDRESS_FIELDS = ['address', 'city', 'state', 'zipCode', 'postalCode'];
const normalized = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
function customerAddress(data = {}) {
  const nested = data.address && typeof data.address === 'object' && !Array.isArray(data.address) ? data.address : {};
  const street = typeof data.address === 'string' ? data.address : nested.street || nested.line1 || '';
  const parts = [street];
  for (const value of [data.city || nested.city, data.state || nested.state, data.zipCode || data.postalCode || nested.zipCode || nested.postalCode]) {
    if (typeof value === 'string' && value.trim() && !normalized(street).includes(normalized(value))) parts.push(value);
  }
  return parts.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()).join(', ');
}
function cleanCustomerPatch(input = {}, create = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpsError('invalid-argument', 'Enter the customer details.');
  const patch = {};
  for (const field of TEXT_FIELDS) if (input[field] !== undefined) {
    if (typeof input[field] !== 'string' || input[field].length > (['notes', 'serviceInstructions'].includes(field) ? 4000 : field === 'email' ? 254 : 500) || /\u0000/.test(input[field])) throw new HttpsError('invalid-argument', 'A customer field is invalid or too long.');
    patch[field] = input[field].trim();
  }
  if (input.address !== undefined) {
    if (typeof input.address !== 'string' || input.address.length > 500 || /[<>\u0000-\u001f]/.test(input.address)) throw new HttpsError('invalid-argument', 'Enter a valid physical customer address.');
    patch.address = input.address.trim();
  }
  if (patch.email !== undefined) {
    patch.email = normalizeEmail(patch.email); patch.emailNormalized = patch.email;
    if (patch.email && !validEmail(patch.email)) throw new HttpsError('invalid-argument', 'Enter a valid customer email address.');
  }
  for (const field of ['isActive', 'emailConsent']) if (input[field] !== undefined) {
    if (typeof input[field] !== 'boolean') throw new HttpsError('invalid-argument', 'Choose valid customer preferences.');
    patch[field] = input[field];
  }
  if (input.lifecycle !== undefined) {
    if (!['prospect', 'active', 'inactive'].includes(input.lifecycle)) throw new HttpsError('invalid-argument', 'Choose Prospect, Active or Inactive for this customer.');
    patch.lifecycle = input.lifecycle;
  }
  if (create && !patch.name) patch.name = [patch.firstName, patch.lastName].filter(Boolean).join(' ');
  if ((create || Object.hasOwn(patch, 'name')) && (!patch.name || patch.name.length > 200)) throw new HttpsError('invalid-argument', 'Enter a customer name (200 characters maximum).');
  return patch;
}
async function assertCustomerActor(db, tx, scope) {
  const deletion = await tx.get(db.doc(`rlAccountDeletions/${scope.uid}`));
  if (deletion.exists) throw new HttpsError('permission-denied', 'This account no longer has access.');
  if (!scope.companyId) {
    const profile = await tx.get(db.doc(`users/${scope.uid}`));
    if (profile.get('rlCompanyId') || profile.get('companyId')) throw new HttpsError('permission-denied', 'Your workspace changed. Refresh before saving.');
    return;
  }
  const company = await tx.get(db.doc(`companies/${scope.companyId}`));
  const actor = scope.role === 'owner' ? company : await tx.get(db.doc(`teamMembers/${scope.memberId}`));
  if (!company.exists || !actor.exists || (scope.role === 'owner' ? actor.get('ownerId') !== scope.uid : actor.get('uid') !== scope.uid || actor.get('companyId') !== scope.companyId || actor.get('status') !== 'active' || actor.get('role') !== scope.role)) throw new HttpsError('permission-denied', 'Your customer-management access changed. Refresh before saving.');
}
function validatedCustomerAddress(property) {
  return { address: property.formattedAddress, city: '', state: '', zipCode: '', postalCode: '', latitude: property.latitude, longitude: property.longitude, location: { latitude: property.latitude, longitude: property.longitude }, addressValidation: { source: 'google-address-validation', validatedAt: property.validatedAt, postalCode: property.postalCode, placeId: property.placeId || '' } };
}
function customerAddressHandlers(db, config = {}) {
  const validator = config.serviceAreas || serviceAreaHandlers(db, config);
  const inScope = (row, scope) => row.exists && (scope.companyId ? row.get('companyId') === scope.companyId : !row.get('companyId') && row.get('userId') === scope.uid);
  return {
    handle: async request => {
      const scope = await requireCapability(db, request, 'customers.manage'), data = request.data || {};
      await rateLimit(db, 'customer-manage', scope.uid, 60);
      if (data.companyId !== undefined && data.companyId !== scope.companyId) throw new HttpsError('permission-denied', 'Choose this workspace’s customer.');
      if (data.action === 'validate') return { property: await validator.validateAddress(scope, data.address) };
      if (!['create', 'update'].includes(data.action)) throw new HttpsError('invalid-argument', 'Choose a customer create or update operation.');
      if (data.action === 'create') return require('./customerIntake').createManagedCustomer(db, request, config, scope);
      const create = data.action === 'create', ref = create ? db.collection('customers').doc() : db.doc(`customers/${documentId(data.id, 'customer')}`);
      const initial = create ? null : await ref.get();
      if (initial && !inScope(initial, scope)) throw new HttpsError('permission-denied', 'Customer unavailable in this workspace.');
      const patch = cleanCustomerPatch(data.customer, create), before = initial?.data() || {};
      const previousLifecycle = require('./shared/customerLifecycle').lifecycleFor(before), changedLifecycle = patch.lifecycle !== undefined && patch.lifecycle !== previousLifecycle;
      if (changedLifecycle && !Object.hasOwn(data, 'expectedVersion')) throw new HttpsError('invalid-argument', 'Refresh the customer before changing its lifecycle.');
      const nextAddress = customerAddress({ ...before, ...patch });
      const changedAddress = ADDRESS_FIELDS.some(field => Object.hasOwn(patch, field)) && normalized(nextAddress) !== normalized(customerAddress(before));
      if (!create && changedAddress && (!Object.hasOwn(data, 'expectedVersion') || data.expectedVersion !== null && (typeof data.expectedVersion !== 'string' || data.expectedVersion.length > 128))) throw new HttpsError('invalid-argument', 'Refresh the customer before changing its saved address.');
      if (!create && changedAddress && !nextAddress) throw new HttpsError('failed-precondition', 'Enter a physical address that Google can verify before replacing the saved address.', { addressValidation: { status: 'invalid', message: 'Enter a physical address that Google can verify.' } });
      if ((create || changedAddress) && nextAddress) Object.assign(patch, validatedCustomerAddress(await validator.validateAddress(scope, nextAddress)));
      return db.runTransaction(async tx => {
        const current = await tx.get(ref);
        await assertCustomerActor(db, tx, scope);
        if (!create) {
          if (!inScope(current, scope)) throw new HttpsError('permission-denied', 'Customer unavailable in this workspace.');
          if (data.expectedVersion !== undefined && customerVersion(current.get('updatedAt')) !== customerVersion(data.expectedVersion) || changedAddress && !current.updateTime.isEqual(initial.updateTime)) throw new HttpsError('aborted', 'The customer changed. Refresh it before saving.');
        }
        const updatedAt = new Date(Math.max(Date.now(), Date.parse(customerVersion(current.get('updatedAt'))) + 1 || 0)).toISOString();
        const customer = { ...(current.data() || {}), ...patch, updatedAt, ...(create ? { userId: scope.uid, ...(scope.companyId ? { companyId: scope.companyId } : {}), createdAt: updatedAt, isActive: patch.isActive !== false, totalJobs: 0, totalSpent: 0, lastServiceDate: null } : {}) };
        if (create) tx.create(ref, customer); else tx.update(ref, { ...patch, updatedAt });
        tx.create(db.collection('rlAudit').doc(), { action: create ? 'customer.create' : changedAddress ? 'customer.address.update' : changedLifecycle ? 'customer.lifecycle' : 'customer.update', companyId: scope.companyId || null, customerId: ref.id, actorId: scope.uid, createdAt: updatedAt, ...(changedLifecycle ? { fromLifecycle: previousLifecycle, toLifecycle: patch.lifecycle } : {}), ...(changedAddress ? { original: Object.fromEntries(ADDRESS_FIELDS.filter(key => before[key] !== undefined).map(key => [key, before[key]])), changes: Object.fromEntries(ADDRESS_FIELDS.filter(key => patch[key] !== undefined).map(key => [key, patch[key]])) } : {}) });
        return { id: ref.id, customer: projectCustomer(ref.id, customer, scope.role), updatedAt };
      });
    },
  };
}
module.exports = { customerAddressHandlers, customerAddress, cleanCustomerPatch, assertCustomerActor, validatedCustomerAddress };
