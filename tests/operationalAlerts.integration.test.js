// Synthetic Firestore emulator records only. Never run against production.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { operationalAlertHandlers } = require('../functions/operationalAlerts');
const { offlineHandler } = require('../functions/offline');
const { workDataHandlers } = require('../functions/workData');
const { publicJob, publicProperty } = require('../functions/portal');
const { hash } = require('../functions/security');

let db, app, handler, apply, work;
const id = `operational-alerts-${process.pid}`;
const company = `${id}-company`, otherCompany = `${id}-other`, customer = `${id}-customer`, job = `${id}-job`;
const owner = `${id}-owner`, manager = `${id}-manager`, technician = `${id}-technician`, member = `${id}-member`;
const written = [];
async function set(path, data) { written.push(path); await db.doc(path).set(data); }
const auth = (uid, role, companyId = company, membershipId = null) => ({ uid, token: { companyId, role, email_verified: true, ...(membershipId ? { membershipId } : {}) } });
const request = (data, actor = auth(owner, 'owner')) => ({ data, auth: actor });
const alert = (description = 'Call manager before entering') => ({ title: 'Unsafe access', description, category: 'safety', severity: 'critical', active: true });

before(async () => {
  if (!/^(?:localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local Firestore emulator required.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, id); db = getFirestore(app);
  handler = operationalAlertHandlers(db); apply = offlineHandler(db); work = workDataHandlers(db);
  await set(`companies/${company}`, { ownerId: owner, name: 'Synthetic provider' });
  await set(`companies/${otherCompany}`, { ownerId: `${id}-other-owner` });
  await set(`teamMembers/${id}-manager-member`, { companyId: company, uid: manager, role: 'manager', status: 'active' });
  await set(`teamMembers/${member}`, { companyId: company, uid: technician, role: 'technician', status: 'active' });
  await set(`customers/${customer}`, { companyId: company, name: 'Synthetic customer', serviceProperties: [{ id: 'front', address: '100 Example St' }, { id: 'back', address: '200 Example St' }] });
  await set(`jobs/${job}`, { companyId: company, customerId: customer, servicePropertyId: 'front', assignedTo: member, assignedToUid: technician, status: 'scheduled', updatedAt: '2030-01-01T00:00:00.000Z', date: '2030-01-01' });
});
after(async () => {
  if (!db) return;
  for (const collection of ['rlAlertOperations', 'rlJobAlertAcknowledgments', 'rlAudit', 'rlOperations']) {
    const rows = await db.collection(collection).where('companyId', '==', company).get();
    for (const row of rows.docs) await row.ref.delete();
  }
  for (const [action, actor] of [['operational-alerts', owner], ['operational-alerts', manager], ['operational-alerts', technician], ['operational-alerts', `${id}-other-owner`], ['offline-job', technician]]) await db.doc(`rlRateLimits/${hash(`${action}:${actor}`)}`).delete();
  for (const path of written.reverse()) await db.doc(path).delete();
  await deleteApp(app);
});

test('property alerts remain isolated, editable by management, and absent from customer surfaces', async () => {
  const saved = await handler(request({ action: 'save', target: 'property', customerId: customer, propertyId: 'front', operationId: 'property-alert-operation-001', alert: alert() }));
  const again = await handler(request({ action: 'save', target: 'property', customerId: customer, propertyId: 'front', operationId: 'property-alert-operation-001', alert: alert() }));
  assert.deepEqual(again, saved);
  const front = await handler(request({ action: 'list', target: 'property', customerId: customer, propertyId: 'front' }));
  const back = await handler(request({ action: 'list', target: 'property', customerId: customer, propertyId: 'back' }));
  assert.equal(front.alerts.length, 1); assert.equal(back.alerts.length, 0);
  const detail = await work.read(request({ resource: 'jobs', id: job }, auth(technician, 'technician', company, member)));
  assert.equal(detail.job.operationalAlerts[0].id, saved.alert.id);
  assert.equal(publicJob(job, detail.job).operationalAlerts, undefined);
  assert.equal(publicProperty({ id: 'front', address: '100 Example St', alerts: front.alerts }).alerts, undefined);
  await assert.rejects(handler(request({ action: 'save', target: 'property', customerId: customer, propertyId: 'front', operationId: 'property-alert-operation-002', alert: alert() }, auth(technician, 'technician', company, member))), { code: 'permission-denied' });
  await assert.rejects(handler(request({ action: 'list', target: 'property', customerId: customer, propertyId: 'front' }, auth(`${id}-other-owner`, 'owner', otherCompany))), { code: 'permission-denied' });
});

test('acknowledgment is versioned and idempotent; reassignment and critical edits require new action', async () => {
  const tech = auth(technician, 'technician', company, member);
  const managerActor = auth(manager, 'manager', company, `${id}-manager-member`);
  const initial = await handler(request({ action: 'status', jobId: job }, tech));
  assert.equal(initial.alerts.length, 1); assert.equal(initial.acknowledgments.length, 0);
  const managementBefore = await handler(request({ action: 'list', target: 'job', jobId: job }, managerActor));
  assert.equal(managementBefore.acknowledgmentStatus.assigned, true);
  assert.deepEqual(managementBefore.acknowledgmentStatus.records, []);
  assert.equal(managementBefore.alerts[0].source, 'property');
  await assert.rejects(handler(request({ action: 'list', target: 'job', jobId: job }, tech)), { code: 'permission-denied' });
  await assert.rejects(handler(request({ action: 'list', target: 'job', jobId: job }, auth(`${id}-other-owner`, 'owner', otherCompany))), { code: 'permission-denied' });
  await assert.rejects(apply(request({ jobId: job, operationId: 'critical-work-operation-001', expectedVersion: '2030-01-01T00:00:00.000Z', patch: { status: 'in-progress' } }, tech)), { code: 'failed-precondition' });
  const originalTime = new Date().toISOString();
  const acknowledgment = { action: 'acknowledge', jobId: job, alertKey: `property:${initial.alerts[0].id}:1`, operationId: 'critical-ack-operation-001', occurredAt: originalTime };
  const receipt = await handler(request(acknowledgment, tech));
  assert.equal(receipt.status, 'synced'); assert.equal((await handler(request(acknowledgment, tech))).occurredAt, originalTime);
  assert.equal((await handler(request({ action: 'status', jobId: job }, tech))).acknowledgments.length, 1);
  const managementAfter = await handler(request({ action: 'list', target: 'job', jobId: job }, managerActor));
  assert.deepEqual(managementAfter.acknowledgmentStatus.records, [{ alertKey: acknowledgment.alertKey, occurredAt: originalTime, receivedAt: receipt.receivedAt }]);
  const synced = await apply(request({ jobId: job, operationId: 'critical-work-operation-001', expectedVersion: '2030-01-01T00:00:00.000Z', patch: { status: 'in-progress' } }, tech));
  assert.equal(synced.status, 'synced');
  await db.doc(`jobs/${job}`).update({ assignedTo: `${id}-manager-member`, assignedToUid: manager });
  assert.deepEqual((await handler(request({ action: 'list', target: 'job', jobId: job }, managerActor))).acknowledgmentStatus.records, []);
  await db.doc(`jobs/${job}`).update({ assignedTo: member, assignedToUid: technician });
  assert.equal((await handler(request({ action: 'list', target: 'job', jobId: job }, managerActor))).acknowledgmentStatus.records.length, 1);
  const edited = await handler(request({ action: 'save', target: 'property', customerId: customer, propertyId: 'front', alertId: initial.alerts[0].id, expectedVersion: 1, operationId: 'property-alert-operation-003', alert: alert('Revised: call manager before entering') }, managerActor));
  assert.equal(edited.alert.version, 2);
  assert.equal((await handler(request({ action: 'status', jobId: job }, tech))).acknowledgments.length, 0);
  assert.deepEqual((await handler(request({ action: 'list', target: 'job', jobId: job }, managerActor))).acknowledgmentStatus.records, []);
  await assert.rejects(handler(request(acknowledgment, tech)), { code: 'failed-precondition' });
  await db.doc(`jobs/${job}`).update({ assignedTo: `${id}-manager-member`, assignedToUid: manager });
  await assert.rejects(handler(request({ action: 'status', jobId: job }, tech)), { code: 'permission-denied' });
  const managerStatus = await handler(request({ action: 'status', jobId: job }, managerActor));
  assert.equal(managerStatus.alerts[0].version, 2);
  assert.deepEqual((await handler(request({ action: 'list', target: 'job', jobId: job }, managerActor))).acknowledgmentStatus.records, []);
});

test('job-specific alerts do not spread to other jobs and inactive alerts leave the current view', async () => {
  const secondJob = `${id}-separate-job`;
  await set(`jobs/${secondJob}`, { companyId: company, customerId: customer, servicePropertyId: 'back', assignedTo: member, assignedToUid: technician, status: 'scheduled', updatedAt: '2030-01-02T00:00:00.000Z', date: '2030-01-02' });
  const managerActor = auth(manager, 'manager', company, `${id}-manager-member`);
  const created = await handler(request({ action: 'save', target: 'job', jobId: secondJob, operationId: 'separate-job-alert-001', alert: { title: 'Vehicle access', description: 'Use the marked work gate.', category: 'access', severity: 'important', active: true } }, managerActor));
  const tech = auth(technician, 'technician', company, member);
  assert.equal((await handler(request({ action: 'status', jobId: secondJob }, tech))).alerts.length, 1);
  assert.equal((await handler(request({ action: 'status', jobId: job }, managerActor))).alerts.some(row => row.id === created.alert.id), false);
  assert.equal((await work.read(request({ resource: 'jobs', id: secondJob }, tech))).job.operationalAlerts[0].source, 'job');
  await assert.rejects(handler(request({ action: 'save', target: 'job', jobId: secondJob, operationId: 'foreign-job-alert-001', alert: alert() }, auth(`${id}-other-owner`, 'owner', otherCompany))), { code: 'permission-denied' });
  await handler(request({ action: 'save', target: 'job', jobId: secondJob, alertId: created.alert.id, expectedVersion: 1, operationId: 'separate-job-alert-002', alert: { ...alert(), active: false } }, managerActor));
  assert.equal((await handler(request({ action: 'status', jobId: secondJob }, tech))).alerts.length, 0);
  const stored = await handler(request({ action: 'list', target: 'job', jobId: secondJob }, managerActor));
  assert.equal(stored.alerts[0].active, false);
  assert.equal(stored.alerts[0].version, 2);
});
