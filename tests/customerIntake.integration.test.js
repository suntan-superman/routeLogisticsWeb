// Local emulator fixtures and injected geocoding only. No provider/messages.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict'), { createRequire } = require('node:module'), path = require('node:path');
const req = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app'), { getFirestore } = req('firebase-admin/firestore');
const { customerIntakeHandlers } = require('../functions/customerIntake');
const { customerAddressHandlers } = require('../functions/customerAddresses');
const { serviceAreaHandlers } = require('../functions/serviceAreas');
const { estimateHandlers } = require('../functions/estimates');
const { lifecycleFor, propertiesFor, propertyFor } = require('../functions/shared/customerLifecycle');
let app, db, sequence = 0;
before(() => { if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Only a local emulator is authorized.'); app = initializeApp({ projectId: 'demo-routelogistics' }, 'customer-intake-tests'); db = getFirestore(app); });
after(() => deleteApp(app));
async function fixture() {
  const id = `intake-${process.pid}-${++sequence}`, uid = `${id}-owner`, customerId = `${id}-customer`; let operation = 0, clock = Date.parse('2026-11-16T18:00:00Z'), geocodes = 0, hook;
  await db.doc(`companies/${id}`).set({ ownerId: uid, name: 'Synthetic intake provider' });
  for (const role of ['admin','manager','technician']) await db.doc(`teamMembers/${id}-${role}`).set({ companyId: id, uid: `${id}-${role}`, role, status: 'active' });
  const original = { companyId: id, userId: uid, name: 'Existing synthetic customer', email: `${id}@example.invalid`, phone: '+1 (661) 555-0100', address: '100 Existing Street, Example, CA 93312', isActive: true, totalSpent: 1234, updatedAt: '2026-11-15T18:00:00Z' };
  await db.doc(`customers/${customerId}`).set(original);
  const areas = serviceAreaHandlers(db, { now: () => clock, geocode: async address => { geocodes++; if (hook) { const callback = hook; hook = null; await callback(); } if (address.includes('Unverified')) throw Error('Synthetic unverified address'); return { formattedAddress: address, latitude: 35, longitude: -119, postalCode: '93312', countryCode: 'US', locationType: 'PREMISE', streetAddressVerified: true }; } });
  const config = { serviceAreas: areas, now: () => clock }, intake = customerIntakeHandlers(db, config), customers = customerAddressHandlers(db, config);
  const f = { id, uid, customerId, original, areas, config, intake, customers, now: () => clock, advance: ms => clock += ms, geocodes: () => geocodes, onGeocode: callback => hook = callback };
  f.auth = (role = 'owner') => ({ uid: role === 'owner' ? uid : `${id}-${role}`, token: { companyId: id, role, email_verified: true, ...(role === 'owner' ? {} : { membershipId: `${id}-${role}` }) } });
  f.request = (data, role = 'owner') => ({ data, auth: f.auth(role) }); f.call = (data, role = 'owner') => intake.handle(f.request(data, role)); f.op = label => `${id}-${label}-${++operation}`;
  f.inquiry = extra => ({ serviceRequested: 'Termite inspection', serviceCategory: '', source: 'phone', notes: 'Synthetic requested access discussion', followUpDate: '2026-11-17', followUpMemberId: `${id}-manager`, ...extra });
  f.property = extra => ({ label: 'rental', address: '200 Additional Street, Example, CA 93312', unit: 'Unit B', accessInstructions: 'Use the side entrance', ...extra });
  f.newInquiry = (extra = {}) => f.call({ action: 'create', operationId: f.op('inquiry'), customer: { name: 'New synthetic prospect', email: `new-${id}@example.invalid`, phone: '+16615550101' }, property: f.property(), inquiry: f.inquiry(), ...extra });
  return f;
}

test('new inquiry atomically creates one prospect, explicit service property and independent inquiry', async () => {
  const f = await fixture(), result = await f.newInquiry(), customer = (await db.doc(`customers/${result.customer.id}`).get()).data();
  assert.equal(customer.lifecycle, 'prospect'); assert.equal(customer.isActive, true); assert.equal(result.inquiry.status, 'new');
  assert.equal(result.inquiry.customerId, result.customer.id); assert.equal(result.inquiry.servicePropertyId, result.property.id); assert.equal(result.inquiry.createdByUid, f.uid);
  assert.equal(result.property.unit, 'Unit B'); assert.equal(result.property.accessInstructions, 'Use the side entrance'); assert.equal(result.property.validated, true);
  assert.equal((await db.collection('rlMail').where('companyId','==',f.id).get()).size, 0);
});
test('stable replay and concurrent identical inquiry submissions create one contact, property, inquiry and audit', async () => {
  const f = await fixture(), operationId = f.op('stable');
  const payload = { action: 'create', operationId, customer: { name: 'One prospect', email: `once-${f.id}@example.invalid` }, property: f.property(), inquiry: f.inquiry() };
  const results = await Promise.all([f.call(payload), f.call(payload)]);
  assert.equal(results[0].customer.id, results[1].customer.id); assert.equal(results[0].inquiry.id, results[1].inquiry.id);
  assert.equal((await db.collection('rlInquiries').where('companyId','==',f.id).get()).size, 1);
  assert.equal((await db.collection('customers').where('companyId','==',f.id).get()).size, 2);
  assert.equal((await db.collection('rlIntakeOperations').where('companyId','==',f.id).get()).size, 1);
  assert.equal((await db.collection('rlAudit').where('companyId','==',f.id).get()).size, 1);
  await assert.rejects(f.call({ ...payload, inquiry: f.inquiry({ notes: 'Changed duplicate payload' }) }), { code: 'already-exists' });
});
test('concurrent distinct operations cannot accidentally create the same contact identity', async () => {
  const f = await fixture(), make = () => f.newInquiry({ customer: { name: 'Shared synthetic prospect', email: `same-${f.id}@example.invalid` } });
  const results = await Promise.allSettled([make(), make()]); assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(results.find(row => row.status === 'rejected').reason.code, 'failed-precondition');
  assert.equal((await db.collection('customers').where('companyId','==',f.id).get()).size, 2);
});
test('existing customer reuse permits multiple inquiries without reclassifying or overwriting the contact', async () => {
  const f = await fixture(), first = await f.call({ action: 'create', operationId: f.op('reuse'), customerId: f.customerId, propertyId: 'legacy-primary', inquiry: f.inquiry() });
  const second = await f.call({ action: 'create', operationId: f.op('second'), customerId: f.customerId, propertyId: 'legacy-primary', inquiry: f.inquiry({ serviceRequested: 'Additional service' }) });
  assert.equal(first.customer.id, f.customerId); assert.notEqual(first.inquiry.id, second.inquiry.id);
  assert.deepEqual((await db.doc(`customers/${f.customerId}`).get()).data(), f.original); assert.equal(first.customer.lifecycle, 'active');
});
test('matching searches normalize name, email, phone and primary/additional addresses within the tenant', async () => {
  const f = await fixture(), other = await fixture();
  for (const query of ['EXISTING SYNTHETIC', f.original.email.toUpperCase(), '6615550100', '100 existing street']) {
    const result = await f.call({ action: 'matches', query }); assert.equal(result.matches.length, 1); assert.equal(result.matches[0].customer.id, f.customerId); assert.ok(result.matches[0].matchReasons.length);
  }
  assert.equal((await other.call({ action: 'matches', query: f.original.email })).matches.length, 0);
  await assert.rejects(f.call({ action: 'matches', query: 'Existing', companyId: other.id }), { code: 'permission-denied' });
});
test('matching email or phone requires explicit separate-contact confirmation and never silently merges', async () => {
  const f = await fixture();
  for (const customer of [{ name: 'Another name', email: f.original.email }, { name: 'Different name', phone: '661-555-0100' }]) await assert.rejects(f.newInquiry({ customer }), error => error.code === 'failed-precondition' && error.details.matches.some(row => row.customer.id === f.customerId));
  const result = await f.newInquiry({ customer: { name: 'Legitimate household contact', email: f.original.email }, duplicateDecision: 'separate', duplicateReason: 'Separate authorized household service contact' });
  assert.notEqual(result.customer.id, f.customerId); assert.equal(result.customer.email, f.original.email);
  assert.deepEqual((await db.doc(`customers/${f.customerId}`).get()).data(), f.original);
});
test('legacy customer create endpoint is idempotent and duplicate-aware without trusting client lifecycle/finance fields', async () => {
  const f = await fixture(), operationId = f.op('customer'), data = { action: 'create', operationId, customer: { name: 'Created through customer endpoint', email: `managed-${f.id}@example.invalid`, lifecycle: 'prospect', totalSpent: 999 } };
  const results = await Promise.all([f.customers.handle(f.request(data)), f.customers.handle(f.request(data))]); assert.equal(results[0].id, results[1].id);
  assert.equal(results[0].customer.lifecycle, 'prospect'); assert.equal((await db.doc(`customers/${results[0].id}`).get()).get('totalSpent'), 0);
  await assert.rejects(f.customers.handle(f.request({ ...data, operationId: f.op('duplicate') })), { code: 'failed-precondition' });
});
test('historical primary addresses remain virtual and additional properties preserve all old job snapshots', async () => {
  const f = await fixture(), listed = await f.call({ action: 'properties', customerId: f.customerId });
  assert.equal(listed.properties[0].id, 'legacy-primary'); assert.equal(listed.properties[0].address, f.original.address); assert.equal(listed.properties[0].legacy, true);
  const oldJob = { companyId: f.id, userId: f.uid, customerId: f.customerId, serviceProperty: { address: 'Original historical visit address' }, status: 'completed' };
  await db.doc(`jobs/${f.id}-historical`).set(oldJob);
  const saved = await f.call({ action: 'saveProperty', operationId: f.op('property'), customerId: f.customerId, expectedVersion: listed.customerVersion, property: f.property() });
  assert.equal(saved.properties.length, 2); assert.notEqual(saved.property.id, 'legacy-primary'); assert.equal(saved.property.unit, 'Unit B');
  assert.deepEqual((await db.doc(`jobs/${f.id}-historical`).get()).data(), oldJob); assert.equal((await db.doc(`customers/${f.customerId}`).get()).get('address'), f.original.address);
  assert.equal((await f.call({ action: 'matches', query: '200 additional street' })).matches[0].customer.id, f.customerId);
});
test('property edits use captured customer version and stable property identity; stale saves cannot overwrite', async () => {
  const f = await fixture(), listed = await f.call({ action: 'properties', customerId: f.customerId });
  const created = await f.call({ action: 'saveProperty', operationId: f.op('new-property'), customerId: f.customerId, expectedVersion: listed.customerVersion, property: f.property() });
  const changed = await f.call({ action: 'saveProperty', operationId: f.op('edit-property'), customerId: f.customerId, propertyId: created.property.id, expectedVersion: created.customerVersion, property: f.property({ address: '300 Revised Street, Example, CA 93312' }) });
  assert.equal(changed.property.id, created.property.id); assert.equal(changed.property.revision, 2);
  await assert.rejects(f.call({ action: 'saveProperty', operationId: f.op('stale-property'), customerId: f.customerId, propertyId: created.property.id, expectedVersion: created.customerVersion, property: f.property({ address: '400 Stale Street' }) }), { code: 'aborted' });
  assert.equal(propertyFor((await db.doc(`customers/${f.customerId}`).get()).data(), created.property.id).address, changed.property.address);
});
test('internal unverified properties retain explicit warning and never assert client coordinates as valid', async () => {
  const f = await fixture(), listed = await f.call({ action: 'properties', customerId: f.customerId });
  const result = await f.call({ action: 'saveProperty', operationId: f.op('unverified'), customerId: f.customerId, expectedVersion: listed.customerVersion, property: f.property({ address: '999 Unverified Street', latitude: 0, longitude: 0, validated: true }) });
  assert.equal(result.property.validated, false); assert.equal(result.property.latitude, null); assert.match(result.property.validationWarning, /Google|address|verify/i);
});
test('configured out-of-area property and inquiry creation require a current owner-approved matching-category exception', async () => {
  const f = await fixture(), category = 'Pest Control', outside = f.property(), historicalJob = { companyId: f.id, userId: f.uid, customerId: f.customerId, serviceProperty: { address: 'Historical service snapshot retained' }, status: 'completed' };
  await db.doc(`companies/${f.id}`).update({ serviceCategories: [category, 'Pool Cleaning'] });
  await db.doc(`jobs/${f.id}-outside-history`).set(historicalJob);
  await f.areas.handle(f.request({ action: 'save', expectedRevision: 0, settings: { operatingAddress: f.original.address, method: 'zip', zipCodes: ['90001'], radiusMiles: 25, categoryOverrides: [], acceptingNewCustomers: true, publishCoverage: false, allowOutOfAreaRequests: true } }));
  const normalProperty = { action: 'saveProperty', operationId: f.op('outside-property'), customerId: f.customerId, expectedVersion: f.original.updatedAt, serviceCategory: category, property: outside };
  await assert.rejects(f.call(normalProperty), error => error.code === 'failed-precondition' && error.details.serviceArea.status === 'outside');
  await assert.rejects(f.call({ action: 'create', operationId: f.op('outside-inquiry'), customerId: f.customerId, property: outside, inquiry: f.inquiry({ serviceCategory: category }) }), error => error.code === 'failed-precondition' && error.details.serviceArea.status === 'outside');
  assert.deepEqual((await db.doc(`customers/${f.customerId}`).get()).data(), f.original);
  const exception = { action: 'approveException', propertyAddress: outside.address, serviceCategory: category, purpose: 'scheduling', reason: 'Synthetic explicit owner authorization for this property and category' };
  await assert.rejects(f.areas.handle(f.request(exception, 'manager')), { code: 'permission-denied' });
  await assert.rejects(f.call({ ...normalProperty, operationId: f.op('forged-exception'), serviceAreaExceptionId: 'forged-owner-approval' }, 'manager'), { code: 'failed-precondition' });
  const approval = await f.areas.handle(f.request(exception));
  await assert.rejects(f.call({ ...normalProperty, operationId: f.op('wrong-category'), serviceCategory: 'Pool Cleaning', serviceAreaExceptionId: approval.exceptionId }, 'manager'), { code: 'failed-precondition' });
  const saved = await f.call({ ...normalProperty, operationId: f.op('approved-property'), serviceAreaExceptionId: approval.exceptionId }, 'manager');
  assert.equal(saved.property.address, outside.address); assert.equal(saved.property.validated, true);
  assert.equal(saved.property.serviceAreaExceptionId, approval.exceptionId);
  const inquiry = await f.call({ action: 'create', operationId: f.op('approved-inquiry'), customerId: f.customerId, property: outside, serviceAreaExceptionId: approval.exceptionId, inquiry: f.inquiry({ serviceCategory: category }) }, 'manager');
  assert.equal(inquiry.inquiry.customerId, f.customerId); assert.equal(inquiry.inquiry.propertySnapshot.address, outside.address);
  assert.equal(inquiry.inquiry.serviceAreaExceptionId, approval.exceptionId);
  const { workDataHandlers } = require('../functions/workData');
  const booking = await workDataHandlers(db, f.config).manageJob(f.request({ action: 'create', operationId: f.op('approved-booking'), job: { appointmentKind: 'estimate_visit', customerId: f.customerId, servicePropertyId: inquiry.inquiry.servicePropertyId, inquiryId: inquiry.inquiry.id, serviceCategory: category, serviceType: 'Synthetic outside estimate', date: '2035-01-04', time: '10:00', estimatedDuration: 1, assignedTo: `${f.id}-manager` } }, 'manager'));
  const booked = await db.doc(`jobs/${booking.id}`).get();
  assert.equal(booked.get('serviceAreaEligibility.status'), 'exception-approved'); assert.equal(booked.get('serviceAreaEligibility.exceptionId'), approval.exceptionId);
  const after = (await db.doc(`customers/${f.customerId}`).get()).data();
  assert.equal(after.address, f.original.address); assert.equal(after.totalSpent, f.original.totalSpent); assert.equal(after.lifecycle, undefined);
  assert.deepEqual((await db.doc(`jobs/${f.id}-outside-history`).get()).data(), historicalJob);
  assert.equal((await db.collection('rlInquiries').where('companyId','==',f.id).get()).size, 1);
});
test('property ownership and archived contacts are checked before provider work', async () => {
  const f = await fixture(), other = await fixture();
  await assert.rejects(f.call({ action: 'properties', customerId: other.customerId }), { code: 'permission-denied' });
  await assert.rejects(f.call({ action: 'saveProperty', operationId: f.op('foreign'), customerId: other.customerId, expectedVersion: other.original.updatedAt, property: f.property() }), { code: 'permission-denied' });
  for (const archived of [{ isActive: false }, { status: 'inactive' }, { status: 'archived' }, { status: 'deleted' }]) {
    await db.doc(`customers/${f.customerId}`).set({ ...f.original, ...archived });
    await assert.rejects(f.call({ action: 'properties', customerId: f.customerId }), { code: 'failed-precondition' });
    await assert.rejects(f.call({ action: 'create', operationId: f.op('archived'), customerId: f.customerId, propertyId: 'legacy-primary', inquiry: f.inquiry() }), { code: 'failed-precondition' });
  }
  assert.equal(f.geocodes(), 0);
});
test('lifecycle transitions preserve contact identity and archive flag and require expected version', async () => {
  const f = await fixture(), created = await f.newInquiry(), before = (await db.doc(`customers/${created.customer.id}`).get()).data();
  const active = await f.call({ action: 'lifecycle', operationId: f.op('active'), customerId: created.customer.id, expectedVersion: before.updatedAt, lifecycle: 'active', reason: 'Accepted service engagement' });
  assert.equal(active.customer.id, created.customer.id); assert.equal(active.customer.lifecycle, 'active'); assert.equal((await db.doc(`customers/${created.customer.id}`).get()).get('isActive'), true);
  await assert.rejects(f.call({ action: 'lifecycle', operationId: f.op('stale-life'), customerId: created.customer.id, expectedVersion: before.updatedAt, lifecycle: 'inactive' }), { code: 'aborted' });
  assert.equal(lifecycleFor(f.original), 'active'); assert.equal(propertiesFor(f.original)[0].id, 'legacy-primary');
});
test('follow-up updates are revisioned, reject invalid or foreign staff, and closed inquiries retain history', async () => {
  const f = await fixture(), other = await fixture(), created = await f.newInquiry();
  const changed = await f.call({ action: 'update', operationId: f.op('followup'), inquiryId: created.inquiry.id, expectedRevision: 1, changes: { status: 'contacted', followUpDate: '2026-11-16', notes: 'Called back' } });
  assert.equal(changed.inquiry.revision, 2); assert.equal((await f.call({ action: 'list', filter: 'due' })).inquiries[0].id, created.inquiry.id);
  await assert.rejects(f.call({ action: 'update', operationId: f.op('stale'), inquiryId: created.inquiry.id, expectedRevision: 1, changes: { notes: 'Stale overwrite' } }), { code: 'aborted' });
  await assert.rejects(f.call({ action: 'update', operationId: f.op('foreign-followup'), inquiryId: created.inquiry.id, expectedRevision: 2, changes: { followUpMemberId: `${other.id}-manager` } }), { code: 'permission-denied' });
  const closed = await f.call({ action: 'update', operationId: f.op('closed'), inquiryId: created.inquiry.id, expectedRevision: 2, changes: { status: 'closed' } });
  await assert.rejects(f.call({ action: 'update', operationId: f.op('reopen'), inquiryId: created.inquiry.id, expectedRevision: closed.inquiry.revision, changes: { status: 'new' } }), { code: 'failed-precondition' });
});
test('new, due, overdue, scheduled and closed queue filters use tenant inquiry records only', async () => {
  const f = await fixture(), other = await fixture(), first = await f.newInquiry(); await other.newInquiry();
  assert.equal((await f.call({ action: 'list', filter: 'new' })).inquiries.length, 1);
  await f.call({ action: 'update', operationId: f.op('overdue'), inquiryId: first.inquiry.id, expectedRevision: 1, changes: { followUpDate: '2026-11-15' } });
  assert.equal((await f.call({ action: 'list', filter: 'overdue' })).inquiries.length, 1);
  await db.doc(`rlInquiries/${first.inquiry.id}`).update({ status: 'estimate_scheduled' });
  assert.equal((await f.call({ action: 'list', filter: 'scheduled' })).inquiries.length, 1);
  await db.doc(`rlInquiries/${first.inquiry.id}`).update({ status: 'closed' });
  assert.equal((await f.call({ action: 'list', filter: 'closed' })).inquiries.length, 1);
});
test('follow-up due and overdue queues use the company Pacific day instead of the next UTC day', async () => {
  const f = await fixture(); f.advance(7 * 3600000); // November 16, 5 PM Pacific; November 17 UTC.
  await f.newInquiry({ inquiry: f.inquiry({ followUpDate: '2026-11-16' }) });
  assert.equal((await f.call({ action: 'list', filter: 'due' })).inquiries.length, 1);
  assert.equal((await f.call({ action: 'list', filter: 'overdue' })).inquiries.length, 0);
});
test('manager and admin can manage intake; technicians, portals, revoked staff and foreign inquiries are denied', async () => {
  const f = await fixture(), other = await fixture(), created = await f.newInquiry();
  assert.equal((await f.call({ action: 'list' }, 'manager')).inquiries.length, 1); assert.equal((await f.call({ action: 'list' }, 'admin')).inquiries.length, 1);
  await assert.rejects(f.call({ action: 'list' }, 'technician'), { code: 'permission-denied' });
  await db.doc(`teamMembers/${f.id}-manager`).update({ status: 'revoked' }); await assert.rejects(f.call({ action: 'list' }, 'manager'), { code: 'permission-denied' });
  await assert.rejects(other.call({ action: 'update', operationId: other.op('foreign'), inquiryId: created.inquiry.id, expectedRevision: 1, changes: { notes: 'Foreign' } }), { code: 'permission-denied' });
  const portal = f.request({ action: 'list' }); portal.auth.token.portal = true; await assert.rejects(f.intake.handle(portal), { code: 'unauthenticated' });
});
test('revocation or property/customer changes during Google validation cannot commit stale writes', async () => {
  const f = await fixture(), listed = await f.call({ action: 'properties', customerId: f.customerId });
  f.onGeocode(() => db.doc(`teamMembers/${f.id}-manager`).update({ status: 'removed' }));
  await assert.rejects(f.call({ action: 'saveProperty', operationId: f.op('revoked'), customerId: f.customerId, expectedVersion: listed.customerVersion, property: f.property() }, 'manager'), { code: 'permission-denied' });
  assert.deepEqual((await db.doc(`customers/${f.customerId}`).get()).data(), f.original);
});
test('replay cannot disclose the saved contact or inquiry after records move to another tenant', async () => {
  const f = await fixture(), operationId = f.op('replay'), payload = { action: 'create', operationId, customerId: f.customerId, propertyId: 'legacy-primary', inquiry: f.inquiry() }, created = await f.call(payload);
  await db.doc(`customers/${f.customerId}`).update({ companyId: 'another-tenant' });
  await assert.rejects(f.call(payload), { code: 'permission-denied' });
  assert.equal((await db.doc(`rlInquiries/${created.inquiry.id}`).get()).get('customerId'), f.customerId);
});
test('approved estimate conversion activates the same existing prospect without duplicating or rewriting quote terms', async () => {
  const f = await fixture(); await db.doc(`customers/${f.customerId}`).update({ lifecycle: 'prospect' });
  const estimate = estimateHandlers(db, { ...f.config, enabled: () => true, emailEnabled: () => true, appUrl: () => 'https://example.invalid', bucketProvider: () => ({ file: () => ({ save: async () => {} }) }) });
  const saved = await estimate.handle(f.request({ action: 'save', operationId: f.op('quote'), data: { customerId: f.customerId, title: 'Synthetic accepted quote', serviceType: 'Inspection', scopeOfWork: 'Approved synthetic work', lineItems: [{ kind: 'labor', description: 'Inspection', quantity: 1, unitPrice: 100 }], taxRate: 0, validDays: 30, photoIds: [] } }));
  await estimate.handle(f.request({ action: 'review', estimateId: saved.estimate.id, expectedVersion: 1, decision: 'approve', comments: 'Synthetic management approval for the exact version.' }));
  const delivery = await estimate.handle(f.request({ action: 'deliver', estimateId: saved.estimate.id, expectedVersion: 1 })), mail = await db.doc(`rlMail/${delivery.mailId}`).get(), token = mail.get('text').match(/token=([a-f0-9]{64})/)[1];
  await estimate.approval({ data: { action: 'approve', estimateId: saved.estimate.id, token, signerName: 'Synthetic signer', acceptedTerms: true }, rawRequest: { ip: f.id } });
  const result = await estimate.handle(f.request({ action: 'convert', estimateId: saved.estimate.id, expectedVersion: 1, schedule: { date: '2026-12-01', time: '10:00' } }));
  assert.equal((await db.doc(`jobs/${result.jobId}`).get()).get('customerId'), f.customerId); assert.equal((await db.doc(`customers/${f.customerId}`).get()).get('lifecycle'), 'active');
  assert.equal((await db.collection('customers').where('companyId','==',f.id).get()).size, 1);
  assert.equal((await db.collection('rlAudit').where('companyId','==',f.id).where('action','==','customer.lifecycle').get()).size, 1);
});
