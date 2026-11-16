// Synthetic local-emulator records only. Google and notification delivery are never contacted.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { workDataHandlers } = require('../functions/workData');
const { offlineHandler } = require('../functions/offline');
const { invoiceHandlers } = require('../functions/invoices');
const { serviceAreaHandlers } = require('../functions/serviceAreas');
const { nativePushHandlers } = require('../functions/nativePush');
const { hash } = require('../functions/security');
const { availabilityRef } = require('../functions/staffAvailability');
let app, db, sequence = 0;
const fixtures = [];
before(() => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(?:127\.0\.0\.1|localhost):\d+$/);
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'estimate-appointments'); db = getFirestore(app);
});
after(async () => {
  for (const f of fixtures) {
    for (const name of ['customers', 'teamMembers', 'rlInquiries', 'jobs', 'rlAudit', 'rlScheduleLocks', 'rlScheduleOperations', 'rlOperations', 'rlServiceAreaGeocodes', 'rlPushDevices', 'rlPushDeliveries', 'rlStaffAvailability', 'photos', 'rlJobVisits']) {
      const rows = await db.collection(name).where('companyId', '==', f.id).get();
      for (const row of rows.docs) await row.ref.delete();
    }
    for (const uid of [f.uid, `${f.tech}-uid`, `${f.manager}-uid`]) {
      await db.doc(`users/${uid}`).delete();
      for (const action of ['job-manage', 'offline-job', 'invoice-manage', 'work-read']) await db.doc(`rlRateLimits/${hash(`${action}:${uid}`)}`).delete();
    }
    await db.doc(`companies/${f.id}`).delete();
  }
  await deleteApp(app);
});
async function fixture() {
  const id = `intake-appointment-${process.pid}-${++sequence}`, uid = `${id}-owner`, tech = `${id}-tech`, manager = `${id}-manager`, customerId = `${id}-customer`, inquiryId = `${id}-inquiry`;
  const f = { id, uid, tech, manager, customerId, inquiryId }; fixtures.push(f);
  await db.doc(`companies/${id}`).set({ ownerId: uid, name: 'Synthetic provider', timeZone: 'America/Los_Angeles' });
  for (const [memberId, role] of [[tech, 'technician'], [manager, 'manager']]) {
    await db.doc(`teamMembers/${memberId}`).set({ companyId: id, uid: `${memberId}-uid`, role, status: 'active', name: `Synthetic ${role}` });
    await db.doc(`users/${memberId}-uid`).set({ rlCompanyId: id });
  }
  await db.doc(`users/${uid}`).set({ rlCompanyId: id });
  await db.doc(`customers/${customerId}`).set({ companyId: id, userId: uid, name: 'Synthetic prospect', lifecycle: 'prospect', isActive: true, address: '10 Billing Street, Example, CA 93312', updatedAt: '2026-11-16T00:00:00.000Z', serviceProperties: [{ id: 'rental-a', label: 'rental', address: '20 Rental Street, Example, CA 93312', unit: 'B', accessInstructions: 'Synthetic gate 1234', revision: 1 }] });
  await db.doc(`rlInquiries/${inquiryId}`).set({ companyId: id, userId: uid, customerId, servicePropertyId: 'rental-a', serviceRequested: 'Synthetic inspection', source: 'phone', status: 'new', revision: 1, followUpDate: '2035-01-05' });
  f.request = (data, role = 'owner') => ({ data, auth: { uid: role === 'owner' ? uid : role === 'manager' ? `${manager}-uid` : `${tech}-uid`, token: { companyId: id, role, email: 'synthetic@example.test', email_verified: true, ...(role === 'owner' ? {} : { membershipId: role === 'manager' ? manager : tech }) } } });
  f.googleCalls = 0;
  const areas = serviceAreaHandlers(db, { geocode: async address => { f.googleCalls++; return { formattedAddress: address, latitude: 35, longitude: -119, postalCode: '93312', countryCode: 'US', locationType: 'PREMISE', streetAddressVerified: true }; } });
  f.api = workDataHandlers(db, { serviceAreas: areas });
  f.booking = patch => ({ action: 'create', operationId: `${id}-booking-operation`, job: { appointmentKind: 'estimate_visit', customerId, servicePropertyId: 'rental-a', inquiryId, serviceProperty: { address: 'FORGED BILLING FALLBACK' }, serviceType: 'Synthetic inspection', date: '2035-01-04', time: '09:00', estimatedDuration: 1, assignedTo: tech, notes: 'Dispatcher instructions', ...patch } });
  f.rows = async name => (await db.collection(name).where('companyId', '==', id).get()).docs;
  f.job = async jobId => (await db.doc(`jobs/${jobId}`).get()).data();
  return f;
}
test('manager schedules one assigned free estimate at the selected property and updates the inquiry atomically', async () => {
  const f = await fixture(), result = await f.api.manageJob(f.request(f.booking(), 'manager')), job = await f.job(result.id);
  assert.equal(job.appointmentKind, 'estimate_visit'); assert.equal(job.billable, false); assert.equal(job.totalCost, 0); assert.equal(job.estimateOutcome, 'estimate_pending');
  assert.equal(job.assignedTo, f.tech); assert.equal(job.assignedToUid, `${f.tech}-uid`); assert.match(job.serviceProperty.address, /20 Rental Street/); assert.doesNotMatch(job.serviceProperty.address, /Billing|FORGED/);
  assert.equal(job.propertyAccessInstructions, 'Synthetic gate 1234'); assert.equal(job.serviceProperty.unit, 'B');
  const inquiry = await db.doc(`rlInquiries/${f.inquiryId}`).get(); assert.equal(inquiry.get('appointmentId'), result.id); assert.equal(inquiry.get('status'), 'estimate_scheduled');
  assert.equal((await db.doc(`customers/${f.customerId}`).get()).get('lifecycle'), 'prospect');
});
test('concurrent and lost-ACK retries create one estimate appointment and one booking receipt', async () => {
  const f = await fixture(), payload = f.booking();
  const results = await Promise.all([f.api.manageJob(f.request(payload)), f.api.manageJob(f.request(payload)), f.api.manageJob(f.request(payload))]);
  assert.equal(new Set(results.map(row => row.id)).size, 1); assert.equal((await f.rows('jobs')).length, 1); assert.equal((await f.rows('rlScheduleOperations')).length, 1);
  const calls = f.googleCalls; assert.equal((await f.api.manageJob(f.request(payload))).replayed, true); assert.equal(f.googleCalls, calls);
  await assert.rejects(f.api.manageJob(f.request({ ...payload, job: { ...payload.job, time: '11:00' } })), { code: 'already-exists' });
});
test('a fresh operation cannot duplicate an inquiry’s existing appointment', async () => {
  const f = await fixture(); await f.api.manageJob(f.request(f.booking()));
  await assert.rejects(f.api.manageJob(f.request({ ...f.booking({ time: '11:00' }), operationId: `${f.id}-another-operation` })), error => error.code === 'already-exists' && !!error.details.appointmentId);
  assert.equal((await f.rows('jobs')).length, 1);
});
test('conflicts and unavailable staff return existing quarter-hour alternatives without partial inquiry changes', async () => {
  const f = await fixture(); await db.doc(`jobs/${f.id}-busy`).set({ companyId: f.id, assignedTo: f.tech, date: '2035-01-04', time: '09:00', estimatedDuration: 1, status: 'scheduled' });
  await assert.rejects(f.api.manageJob(f.request(f.booking())), error => { assert.equal(error.code, 'failed-precondition'); assert.equal(error.details.scheduling.available, false); assert.ok(error.details.scheduling.alternatives.length); assert.ok(error.details.scheduling.alternatives.every(slot => Number(slot.time.slice(-2)) % 15 === 0)); return true; });
  assert.equal((await db.doc(`rlInquiries/${f.inquiryId}`).get()).get('status'), 'new'); assert.equal((await f.rows('rlScheduleOperations')).length, 0);
  await db.doc(`jobs/${f.id}-busy`).delete();
  await availabilityRef(db, f.id, `${f.tech}-uid`).set({ companyId: f.id, fieldWorkEnabled: false, periods: [] });
  await assert.rejects(f.api.manageJob(f.request(f.booking())), { code: 'failed-precondition' });
});
test('technicians, foreign customers/properties/inquiries and fabricated relationships cannot schedule', async () => {
  const f = await fixture(), other = await fixture();
  await assert.rejects(f.api.manageJob(f.request(f.booking(), 'technician')), { code: 'permission-denied' });
  for (const patch of [{ customerId: other.customerId }, { servicePropertyId: 'foreign-property' }, { inquiryId: other.inquiryId }]) await assert.rejects(f.api.manageJob(f.request(f.booking(patch))));
  await db.doc(`customers/${f.customerId}`).update({ status: 'inactive' });
  await assert.rejects(f.api.manageJob(f.request(f.booking())), { code: 'failed-precondition' });
  assert.equal((await f.rows('jobs')).length, 0);
});
test('estimate classification cannot be rewritten into paid work or bypassed with implied fees/recurrence', async () => {
  const f = await fixture();
  await assert.rejects(f.api.manageJob(f.request(f.booking({ billable: true }))), { code: 'failed-precondition' });
  await assert.rejects(f.api.manageJob(f.request(f.booking({ totalCost: 75 }))), { code: 'failed-precondition' });
  await assert.rejects(f.api.manageJob(f.request(f.booking({ servicePropertyId: null, inquiryId: null }))), { code: 'invalid-argument' });
  await assert.rejects(f.api.manageJob(f.request({ ...f.booking(), recurring: { frequency: 'weekly' } })), { code: 'invalid-argument' });
  const result = await f.api.manageJob(f.request(f.booking()));
  await assert.rejects(f.api.manageJob(f.request({ action: 'update', id: result.id, job: { appointmentKind: 'service', totalCost: 75 } })), { code: 'failed-precondition' });
  await assert.rejects(f.api.manageJob(f.request({ action: 'update', id: result.id, job: { totalCost: 75 } })), { code: 'failed-precondition' });
  await assert.rejects(f.api.manageJob(f.request({ action: 'delete', id: result.id })), { code: 'failed-precondition' });
});
test('property edits preserve old appointment snapshots; new selections use the revised property', async () => {
  const f = await fixture(), result = await f.api.manageJob(f.request(f.booking())), original = await f.job(result.id);
  await db.doc(`customers/${f.customerId}`).update({ serviceProperties: [{ id: 'rental-a', label: 'rental', address: '99 New Property Street, Example, CA 93312', revision: 2 }] });
  await f.api.manageJob(f.request({ action: 'update', id: result.id, job: { notes: 'New instructions', customerId: f.customerId, servicePropertyId: 'rental-a', serviceProperty: original.serviceProperty } }));
  const revised = await f.job(result.id); assert.deepEqual(revised.serviceProperty, original.serviceProperty); assert.equal(revised.notes, 'New instructions');
  await assert.rejects(f.api.manageJob(f.request({ action: 'update', id: result.id, job: { servicePropertyId: 'rental-a', serviceProperty: { address: '50 Wrong Property Street' } } })), { code: 'failed-precondition' });
  const next = await f.api.manageJob(f.request({ ...f.booking({ inquiryId: null, time: '11:00' }), operationId: `${f.id}-revised-property-operation` }));
  assert.match((await f.job(next.id)).serviceProperty.address, /99 New Property Street/); assert.deepEqual((await f.job(result.id)).serviceProperty, original.serviceProperty);
  await db.doc(`rlInquiries/${f.inquiryId}`).update({ status: 'contacted' });
  await f.api.manageJob(f.request({ action: 'update', id: result.id, job: { notes: 'Unrelated note edit' } }));
  assert.equal((await db.doc(`rlInquiries/${f.inquiryId}`).get()).get('status'), 'contacted');
});
test('assigned offline completion preserves work, records quote-needed once and never activates a prospect', async () => {
  const f = await fixture(), result = await f.api.manageJob(f.request(f.booking())), original = await f.job(result.id);
  await db.doc(`photos/${f.id}-photo`).set({ companyId: f.id, jobId: result.id, caption: 'Preserve captured photo' });
  await db.doc(`rlJobVisits/${f.id}-arrival`).set({ companyId: f.id, jobId: result.id, type: 'arrived', note: 'Preserve arrival' });
  const apply = offlineHandler(db), data = { jobId: result.id, operationId: `${f.id}-complete-operation`, expectedVersion: original.updatedAt, patch: { status: 'completed', notes: 'Observed property conditions', actualWorkDone: 'Estimate inspection' } };
  const first = await apply(f.request(data, 'technician')), replay = await apply(f.request(data, 'technician')); assert.deepEqual(replay, first); assert.equal(first.estimateOutcome, 'quote_needed');
  const job = await f.job(result.id); assert.equal(job.workNotes, data.patch.notes); assert.equal(job.notes, 'Dispatcher instructions'); assert.equal(job.estimateOutcome, 'quote_needed');
  assert.equal((await db.doc(`rlInquiries/${f.inquiryId}`).get()).get('status'), 'estimate_completed'); assert.equal((await db.doc(`customers/${f.customerId}`).get()).get('lifecycle'), 'prospect');
  assert.equal((await f.rows('photos')).length, 1); assert.equal((await f.rows('rlJobVisits')).length, 1); assert.equal((await f.rows('rlOperations')).length, 1);
});
test('completed estimate visits reject ordinary invoice creation even if a stored billable flag is inconsistent', async () => {
  const f = await fixture(), result = await f.api.manageJob(f.request(f.booking()));
  await db.doc(`jobs/${result.id}`).update({ status: 'completed', billable: true });
  await assert.rejects(invoiceHandlers(db).handle(f.request({ action: 'preview', jobId: result.id })), error => error.code === 'failed-precondition' && /nonbillable/.test(error.message));
  assert.equal((await f.rows('invoices')).length, 0);
});
test('outcomes may be updated after completion by assigned staff, with revision conflict and reassignment protection', async () => {
  const f = await fixture(), result = await f.api.manageJob(f.request(f.booking())), apply = offlineHandler(db), job = await f.job(result.id);
  const first = await apply(f.request({ jobId: result.id, operationId: `${f.id}-complete-operation`, expectedVersion: job.updatedAt, patch: { status: 'completed' } }, 'technician'));
  const next = { jobId: result.id, operationId: `${f.id}-outcome-operation`, expectedVersion: first.version, patch: { estimateOutcome: 'customer_declined' } };
  assert.equal((await apply(f.request(next, 'technician'))).status, 'synced'); assert.equal((await f.job(result.id)).estimateOutcome, 'customer_declined');
  assert.equal((await apply(f.request({ ...next, operationId: `${f.id}-stale-operation` }, 'technician'))).status, 'conflict');
  await db.doc(`jobs/${result.id}`).update({ assignedTo: f.manager, assignedToUid: `${f.manager}-uid` });
  await assert.rejects(apply(f.request(next, 'technician')), { code: 'permission-denied' });
});
test('reassignment, rescheduling and cancellation reuse schedule checks and retain inquiry history', async () => {
  const f = await fixture(), result = await f.api.manageJob(f.request(f.booking()));
  await f.api.manageJob(f.request({ action: 'assign', id: result.id, memberId: f.manager }));
  await f.api.manageJob(f.request({ action: 'update', id: result.id, job: { time: '11:00' } }));
  await f.api.manageJob(f.request({ action: 'update', id: result.id, job: { status: 'cancelled' } }));
  const job = await f.job(result.id); assert.equal(job.assignedTo, f.manager); assert.equal(job.time, '11:00'); assert.equal(job.estimateOutcome, 'cancelled_no_access');
  const inquiry = await db.doc(`rlInquiries/${f.inquiryId}`).get(); assert.equal(inquiry.get('appointmentId'), result.id); assert.equal(inquiry.get('status'), 'contacted');
});
test('historical service jobs retain behavior and explicit paid engagement activates the same prospect', async () => {
  const f = await fixture();
  await db.doc(`jobs/${f.id}-history`).set({ userId: f.uid, companyId: f.id, status: 'completed', totalCost: 95, customerId: 'missing-historical-customer' });
  await f.api.manageJob(f.request({ action: 'update', id: `${f.id}-history`, job: { notes: 'Historical notes' } }));
  const historical = await f.job(`${f.id}-history`); assert.equal(historical.appointmentKind, undefined); assert.equal(historical.totalCost, 95);
  const payload = f.booking({ appointmentKind: 'service', inquiryId: null, totalCost: 95 });
  const result = await f.api.manageJob(f.request(payload)); assert.equal((await f.job(result.id)).customerId, f.customerId); assert.equal((await db.doc(`customers/${f.customerId}`).get()).get('lifecycle'), 'active'); assert.equal((await f.rows('customers')).length, 1);
});
test('normal field/management read models expose kind/outcome/property instructions without private inquiry data', async () => {
  const f = await fixture(), result = await f.api.manageJob(f.request(f.booking()));
  for (const role of ['manager', 'technician']) {
    const value = await f.api.read(f.request({ resource: 'jobs', id: result.id }, role));
    assert.equal(value.job.appointmentKind, 'estimate_visit'); assert.equal(value.job.inquiryId, f.inquiryId); assert.equal(value.job.propertyAccessInstructions, 'Synthetic gate 1234'); assert.equal(value.job.dispatchNotes, 'Dispatcher instructions');
    assert.equal(value.job.followUpDate, undefined); assert.equal(value.customer.lifecycle, role === 'technician' ? undefined : 'prospect');
  }
});
test('existing push outbox creates one assignment event for an estimate without delivering any real notification', async () => {
  const f = await fixture(), result = await f.api.manageJob(f.request(f.booking())), job = await f.job(result.id);
  await db.doc(`rlPushDevices/${f.id}-device`).set({ uid: `${f.tech}-uid`, companyId: f.id, membershipId: f.tech, role: 'technician', active: true, registrationSequence: 1, token: 'synthetic-not-a-provider-token' });
  const native = nativePushHandlers(db, { enabled: () => true });
  assert.equal((await native.enqueue(null, job, result.id, `${f.id}-event`)).queued, 1); await native.enqueue(null, job, result.id, `${f.id}-event`);
  const rows = await f.rows('rlPushDeliveries'); assert.equal(rows.length, 1); assert.equal(rows[0].get('kind'), 'assignment'); assert.equal(rows[0].get('jobId'), result.id); assert.equal(rows[0].get('state'), 'pending');
});
