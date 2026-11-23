// Booking acceptance uses disposable Firestore fixtures and an injected geocoder.
// It never contacts Google, sends messages, or modifies production records.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { workDataHandlers } = require('../functions/workData');
const { recurringHandlers } = require('../functions/recurring');
const { serviceAreaHandlers } = require('../functions/serviceAreas');
const { hash } = require('../functions/security');
const FIRST = '2035-01-04', NEXT = '2035-01-11', VERSION = '2026-11-15T00:00:00.000Z';
let app, db, sequence = 0;
const fixtures = [], paths = new Set();
const set = (path, data) => { paths.add(path); return db.doc(path).set(data); };
const get = async path => (await db.doc(path).get()).data();
before(() => {
  if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local Firestore emulator required.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'booking-tests'); db = getFirestore(app);
});
after(async () => {
  if (!db) return;
  for (const f of fixtures) {
    for (const collection of ['jobs', 'servicePlans', 'rlScheduleLocks', 'rlScheduleOperations', 'rlAudit', 'rlServiceAreaGeocodes']) {
      const docs = await db.collection(collection).where(f.solo ? 'userId' : 'companyId', '==', f.solo ? f.uid : f.id).get();
      for (const row of docs.docs) await row.ref.delete();
    }
    const audits = await db.collection('rlAudit').where('actorId', '==', f.uid).get(); for (const row of audits.docs) await row.ref.delete();
    const operations = await db.collection('rlScheduleOperations').where('actorId', '==', f.uid).get(); for (const row of operations.docs) await row.ref.delete();
    for (const uid of [f.uid, `${f.tech}-uid`, `${f.manager}-uid`]) for (const action of ['job-manage', 'generate-job']) await db.doc(`rlRateLimits/${hash(`${action}:${uid}`)}`).delete();
  }
  for (const path of paths) await db.doc(path).delete();
  await deleteApp(app);
});
async function fixture({ solo = false } = {}) {
  const id = `booking-${process.pid}-${++sequence}`, uid = `${id}-owner`, tech = `${id}-tech`, tech2 = `${id}-tech2`, manager = `${id}-manager`, customerId = `${id}-customer`;
  const f = { id, uid, tech, tech2, manager, customerId, solo }; fixtures.push(f);
  await set(`users/${uid}`, { name: 'Synthetic booking owner', ...(solo ? {} : { rlCompanyId: id }) });
  if (!solo) {
    await set(`companies/${id}`, { ownerId: uid, name: 'Synthetic booking company', timeZone: 'America/Los_Angeles', isActive: true });
    for (const [memberId, role] of [[tech, 'technician'], [tech2, 'technician'], [manager, 'manager']]) {
      await set(`teamMembers/${memberId}`, { companyId: id, uid: `${memberId}-uid`, role, name: role === 'manager' ? 'Synthetic manager' : memberId === tech ? 'Preferred technician' : 'Alternate technician', status: 'active' });
      await set(`users/${memberId}-uid`, { rlCompanyId: id });
    }
  }
  const customer = { userId: uid, ...(solo ? {} : { companyId: id }), name: 'Synthetic booking customer', address: '10 Original Street, Example, CA 93301', notes: 'Preserve customer history', totalSpent: 995, quickbooksId: 'preserved-map', updatedAt: VERSION };
  await set(`customers/${customerId}`, customer);
  const areas = serviceAreaHandlers(db, { geocode: async address => ({ formattedAddress: address, latitude: 35, longitude: -119, postalCode: '93312', countryCode: 'US', locationType: 'PREMISE', streetAddressVerified: true }) });
  f.api = workDataHandlers(db, { serviceAreas: areas });
  f.recurring = recurringHandlers(db, { serviceAreas: areas });
  f.request = (data, role = 'owner') => ({ data, auth: { uid: role === 'owner' ? uid : role === 'manager' ? `${manager}-uid` : `${tech}-uid`, token: { email_verified: true, email: 'synthetic-booking@example.test', ...(solo ? {} : { companyId: id, role, ...(role === 'owner' ? {} : { membershipId: role === 'manager' ? manager : tech }) }) } } });
  f.job = patch => ({ customerId, customerName: customer.name, serviceType: 'Synthetic inspection', date: FIRST, time: '09:00', estimatedDuration: 1, assignedTo: solo ? uid : tech, totalCost: 95, notes: 'Synthetic booking only', ...patch });
  f.booking = (patch = {}) => ({ action: 'create', operationId: 'synthetic-recurring-booking-001', job: f.job(), recurring: { recurrence: { frequency: 'weekly' }, preferredTechnicianId: solo ? uid : tech, assignmentFallback: 'unassigned' }, ...patch });
  f.rows = async collection => (await db.collection(collection).where(solo ? 'userId' : 'companyId', '==', solo ? uid : id).get()).docs;
  f.customerBefore = customer;
  return f;
}

test('one-off jobs are assigned before leaving scheduling and conflicts return selectable alternate times', async () => {
  const f = await fixture(), result = await f.api.manageJob(f.request({ action: 'create', job: f.job({ assignedToName: 'FORGED NAME', assignedToUid: 'forged-account', assignmentNeedsAttention: false, servicePlanId: 'foreign-plan' }) }));
  const job = await get(`jobs/${result.id}`);
  assert.equal(job.assignedTo, f.tech); assert.equal(job.assignedToUid, `${f.tech}-uid`); assert.equal(job.assignedToName, 'Preferred technician');
  assert.equal(job.servicePlanId, undefined); assert.equal((await f.rows('servicePlans')).length, 0);
  await f.api.manageJob(f.request({ action: 'update', id: result.id, job: { notes: 'A legitimate notes update', assignedToUid: 'forged-account', assignedToName: 'FORGED NAME', assignmentReview: 'FORGED REVIEW' } }));
  const edited = await get(`jobs/${result.id}`); assert.equal(edited.assignedToUid, `${f.tech}-uid`); assert.equal(edited.assignedToName, 'Preferred technician'); assert.equal(edited.assignmentReview, null);
  await assert.rejects(f.api.manageJob(f.request({ action: 'create', job: f.job({ time: '09:30' }) })), error => {
    assert.equal(error.code, 'failed-precondition'); assert.equal(error.details.scheduling.available, false); assert.equal(error.details.scheduling.alternatives[0].time, '10:00'); return true;
  });
  assert.equal((await f.rows('jobs')).length, 1); assert.deepEqual(await get(`customers/${f.customerId}`), f.customerBefore);
});

test('recurring first job and plan commit together and start generation at the next calendar occurrence', async () => {
  const f = await fixture(), result = await f.api.manageJob(f.request(f.booking()));
  const job = await get(`jobs/${result.id}`), plan = await get(`servicePlans/${result.servicePlanId}`);
  assert.equal(job.servicePlanId, result.servicePlanId); assert.equal(job.servicePlanDate, FIRST); assert.equal(job.assignedTo, f.tech);
  assert.equal(plan.preferredTechnicianId, f.tech); assert.equal(plan.assignmentFallback, 'unassigned'); assert.equal(plan.lastJobId, result.id); assert.equal(plan.lastGeneratedFor, FIRST); assert.equal(plan.nextServiceDate, NEXT);
  assert.equal(plan.recurrence.frequency, 'weekly'); assert.equal(plan.estimatedDuration, 1); assert.equal(plan.customerId, f.customerId);
  assert.equal((await f.rows('jobs')).length, 1); assert.equal((await f.rows('servicePlans')).length, 1);
  assert.deepEqual(await get(`customers/${f.customerId}`), f.customerBefore);
});

test('same-operation retries and concurrent submissions create exactly one plan, first job and booking receipt', async () => {
  const f = await fixture(), data = f.booking();
  const outcomes = await Promise.all([f.api.manageJob(f.request(data)), f.api.manageJob(f.request(data)), f.api.manageJob(f.request(data))]);
  assert.equal(new Set(outcomes.map(row => row.id)).size, 1); assert.equal(new Set(outcomes.map(row => row.servicePlanId)).size, 1);
  const replay = await f.api.manageJob(f.request(data)); assert.equal(replay.replayed, true); assert.equal(replay.id, outcomes[0].id);
  assert.equal((await f.rows('jobs')).length, 1); assert.equal((await f.rows('servicePlans')).length, 1);
  const operations = await db.collection('rlScheduleOperations').where('actorId', '==', f.uid).get(); assert.equal(operations.size, 1);
  const audits = await f.rows('rlAudit'); assert.equal(audits.filter(row => row.get('action') === 'job.create').length, 1); assert.equal(audits.filter(row => row.get('action') === 'servicePlan.create').length, 1);
});

test('a reused recurring operation with changed payload is rejected without changing the saved booking', async () => {
  const f = await fixture(), data = f.booking(), result = await f.api.manageJob(f.request(data));
  const job = await get(`jobs/${result.id}`), plan = await get(`servicePlans/${result.servicePlanId}`);
  await assert.rejects(f.api.manageJob(f.request({ ...data, job: { ...data.job, time: '11:00' } })), { code: 'already-exists' });
  await assert.rejects(f.api.manageJob(f.request({ ...data, recurring: { ...data.recurring, assignmentFallback: 'auto' } })), { code: 'already-exists' });
  assert.deepEqual(await get(`jobs/${result.id}`), job); assert.deepEqual(await get(`servicePlans/${result.servicePlanId}`), plan);
});

test('the first recurring appointment cannot silently reserve a different future preferred technician', async () => {
  const f = await fixture(), data = f.booking();
  await assert.rejects(f.api.manageJob(f.request({ ...data, recurring: { ...data.recurring, preferredTechnicianId: f.tech2 } })), { code: 'invalid-argument' });
  await assert.rejects(f.api.manageJob(f.request({ ...data, job: f.job({ assignedTo: null }) })), { code: 'invalid-argument' });
  assert.equal((await f.rows('jobs')).length, 0); assert.equal((await f.rows('servicePlans')).length, 0);
});

test('a conflicting recurring request leaves no plan, receipt or permanent customer-address change', async () => {
  const f = await fixture(); await set(`jobs/${f.id}-busy`, { ...f.job(), userId: f.uid, companyId: f.id, status: 'scheduled' });
  const data = f.booking({ job: f.job({ serviceProperty: { address: '200 Changed Street, Example, CA 93312' } }), saveCustomerAddress: true, expectedCustomerVersion: VERSION });
  await assert.rejects(f.api.manageJob(f.request(data)), error => error.code === 'failed-precondition' && error.details.scheduling.available === false);
  assert.equal((await f.rows('jobs')).length, 1); assert.equal((await f.rows('servicePlans')).length, 0);
  assert.equal((await db.collection('rlScheduleOperations').where('actorId', '==', f.uid).get()).size, 0);
  assert.deepEqual(await get(`customers/${f.customerId}`), f.customerBefore);
});

test('technicians and foreign customer or technician targets cannot create or link recurring bookings', async () => {
  const f = await fixture();
  await assert.rejects(f.api.manageJob(f.request(f.booking(), 'technician')), { code: 'permission-denied' });
  await set(`customers/${f.id}-foreign`, { userId: 'foreign-owner', companyId: 'foreign-company', name: 'Other tenant' });
  await assert.rejects(f.api.manageJob(f.request(f.booking({ job: f.job({ customerId: `${f.id}-foreign` }) }))), { code: 'permission-denied' });
  await set(`teamMembers/${f.id}-foreign-tech`, { uid: 'foreign-user', companyId: 'foreign-company', role: 'technician', status: 'active' });
  await assert.rejects(f.api.manageJob(f.request(f.booking({ job: f.job({ assignedTo: `${f.id}-foreign-tech` }) }))), { code: 'failed-precondition' });
  assert.equal((await f.rows('jobs')).length, 0); assert.equal((await f.rows('servicePlans')).length, 0);
});

test('generation never recreates the initial job and retrying the next occurrence advances only once', async () => {
  const f = await fixture(), created = await f.api.manageJob(f.request(f.booking()));
  const staleFirst = await f.recurring.generateServicePlanJob(f.request({ planId: created.servicePlanId, expectedDate: FIRST })); assert.equal(staleFirst.skipped, true);
  assert.equal((await f.rows('jobs')).length, 1);
  const generated = await f.recurring.generateServicePlanJob(f.request({ planId: created.servicePlanId, expectedDate: NEXT }));
  assert.notEqual(generated.jobId, created.id); assert.equal((await get(`jobs/${generated.jobId}`)).servicePlanDate, NEXT);
  const replayNext = await f.recurring.generateServicePlanJob(f.request({ planId: created.servicePlanId, expectedDate: NEXT })); assert.equal(replayNext.skipped, true);
  assert.equal((await f.rows('jobs')).length, 2); assert.equal((await get(`servicePlans/${created.servicePlanId}`)).nextServiceDate, '2035-01-18');
});

test('an unassociated personal account cannot create a recurring booking', async () => {
  const f = await fixture({ solo: true }), data = f.booking();
  await assert.rejects(f.api.manageJob(f.request(data)), { code: 'permission-denied' });
  assert.equal((await f.rows('jobs')).length, 0); assert.equal((await f.rows('servicePlans')).length, 0);
  assert.deepEqual(await get(`customers/${f.customerId}`), f.customerBefore);
});

test('invalid recurring operation IDs cannot leave partially created records', async () => {
  const f = await fixture();
  for (const operationId of ['', 'short', 'invalid/operation-id']) await assert.rejects(f.api.manageJob(f.request(f.booking({ operationId }))), { code: 'invalid-argument' });
  assert.equal((await f.rows('jobs')).length, 0); assert.equal((await f.rows('servicePlans')).length, 0);
});

test('managers can cancel scheduled appointments while technicians and started or completed work cannot be cancelled', async () => {
  const f = await fixture(), created = await f.api.manageJob(f.request({ action: 'create', job: f.job() }));
  await assert.rejects(f.api.manageJob(f.request({ action: 'cancel', id: created.id }, 'technician')), { code: 'permission-denied' });
  const cancelled = await f.api.manageJob(f.request({ action: 'cancel', id: created.id, reason: 'Synthetic customer request', expectedVersion: created.updatedAt }, 'manager'));
  const saved = await get(`jobs/${created.id}`); assert.equal(saved.status, 'cancelled'); assert.equal(saved.cancellationReason, 'Synthetic customer request'); assert.equal(saved.cancelledBy, `${f.manager}-uid`); assert.ok(saved.cancelledAt); assert.equal(cancelled.id, created.id);
  const audit = (await f.rows('rlAudit')).find(row => row.get('action') === 'job.cancel'); assert.equal(audit.get('reason'), 'Synthetic customer request');
  await assert.rejects(f.api.manageJob(f.request({ action: 'update', id: created.id, job: { status: 'scheduled' } }, 'manager')), { code: 'failed-precondition' });

  const started = await f.api.manageJob(f.request({ action: 'create', job: f.job({ time: '11:00' }) })); await db.doc(`jobs/${started.id}`).update({ status: 'in-progress' });
  await assert.rejects(f.api.manageJob(f.request({ action: 'cancel', id: started.id }, 'manager')), { code: 'failed-precondition' });
  await assert.rejects(f.api.manageJob(f.request({ action: 'delete', id: started.id }, 'manager')), { code: 'failed-precondition' });
  await db.doc(`jobs/${started.id}`).update({ status: 'completed' });
  await assert.rejects(f.api.manageJob(f.request({ action: 'cancel', id: started.id }, 'manager')), { code: 'failed-precondition' });
});

test('permanent job deletion requires management cancellation access, rejects stale changes and preserves an audit record', async () => {
  const f = await fixture(), created = await f.api.manageJob(f.request({ action: 'create', job: f.job() }));
  await assert.rejects(f.api.manageJob(f.request({ action: 'delete', id: created.id }, 'technician')), { code: 'permission-denied' });
  await assert.rejects(f.api.manageJob(f.request({ action: 'delete', id: created.id, expectedVersion: 'stale' }, 'manager')), { code: 'aborted' });
  const invoicePath = `invoices/${f.id}-linked-invoice`;
  await set(invoicePath, { companyId: f.id, userId: f.uid, customerId: f.customerId, jobId: created.id, status: 'draft', total: 95 });
  await assert.rejects(f.api.manageJob(f.request({ action: 'delete', id: created.id, expectedVersion: created.updatedAt }, 'manager')), error => error.code === 'failed-precondition' && /invoice/.test(error.message));
  await db.doc(invoicePath).delete();
  await f.api.manageJob(f.request({ action: 'delete', id: created.id, expectedVersion: created.updatedAt }, 'manager'));
  assert.equal((await db.doc(`jobs/${created.id}`).get()).exists, false);
  assert.ok((await f.rows('rlAudit')).some(row => row.get('action') === 'job.delete' && row.get('jobId') === created.id));
});
