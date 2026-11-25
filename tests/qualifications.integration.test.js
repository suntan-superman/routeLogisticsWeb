// Local emulator fixtures only; this suite must never use production Firestore.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { qualificationHandlers, staffRef } = require('../functions/qualifications');
const { schedulingHandlers } = require('../functions/scheduling');
const { hash } = require('../functions/security');

let app, db;
const id = `qualification-${process.pid}`, owner = `${id}-owner`, tech = `${id}-tech`, techUid = `${tech}-uid`;
const refs = [];
const put = async (path, data) => { refs.push(path); await db.doc(path).set(data); };
const request = (action, data = {}, role = 'owner') => ({
  auth: { uid: role === 'owner' ? owner : techUid, token: { email_verified: true, companyId: id, role, ...(role === 'owner' ? {} : { membershipId: tech }) } },
  data: { action, companyId: id, ...data },
});
before(async () => {
  if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local Firestore emulator required.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, `qualifications-${process.pid}`); db = getFirestore(app);
  await put(`companies/${id}`, { ownerId: owner, name: 'Synthetic qualification tenant', isActive: true, serviceCategories: ['Inspection'] });
  await put(`users/${owner}`, { rlCompanyId: id });
  await put(`users/${techUid}`, { rlCompanyId: id });
  await put(`teamMembers/${tech}`, { uid: techUid, companyId: id, role: 'technician', status: 'active', name: 'Synthetic technician' });
});
after(async () => {
  if (!db) return;
  for (const name of ['rlQualifications', 'rlStaffQualifications', 'rlServiceQualificationRequirements', 'rlQualificationAudit', 'jobs', 'rlScheduleLocks']) {
    const rows = await db.collection(name).where('companyId', '==', id).get();
    for (const row of rows.docs) await row.ref.delete();
  }
  for (const path of refs) await db.doc(path).delete();
  for (const uid of [owner, techUid]) for (const label of ['qualification-management', 'schedule-check']) await db.doc(`rlRateLimits/${hash(`${label}:${uid}`)}`).delete();
  await deleteApp(app);
});

test('qualifications gate manual assignment, rescheduling and recurring fallback without touching historical work', async () => {
  const management = qualificationHandlers(db), scheduling = schedulingHandlers(db), base = { companyId: id, userId: owner, assignedTo: tech, serviceType: 'Inspection', date: '2030-01-03', time: '09:00', estimatedDuration: 1, status: 'scheduled' };
  const unconfigured = await scheduling.handle(request('check', { memberId: tech, ...base }));
  assert.equal(unconfigured.available, true);
  const { id: qualificationId } = await management(request('catalog-save', { name: 'Inspection skill', description: 'Internal demonstration skill', type: 'internal_skill', active: true, tracksExpiration: true }));
  await management(request('requirements-save', { serviceName: 'Inspection', qualificationIds: [qualificationId] }));
  const missing = await scheduling.handle(request('check', { memberId: tech, ...base }));
  assert.equal(missing.available, false); assert.match(missing.reason, /Qualification required/);
  await assert.rejects(db.runTransaction(async tx => scheduling.prepare(tx, { uid: owner, role: 'owner', companyId: id }, base, { before: {} })), { code: 'failed-precondition' });
  await management(request('staff-save', { memberId: tech, qualificationId, effectiveDate: '2030-01-01', expiresAt: '2030-01-04', verificationStatus: 'management_recorded', active: true }));
  assert.equal((await scheduling.handle(request('check', { memberId: tech, ...base }))).available, true);
  assert.equal((await scheduling.handle(request('check', { memberId: tech, ...base, date: '2030-01-05' }))).available, false);
  const historical = `${id}-completed`;
  await put(`jobs/${historical}`, { ...base, date: '2025-01-03', status: 'completed', assignedToUid: techUid });
  assert.equal((await db.doc(`jobs/${historical}`).get()).get('assignedTo'), tech);
  const unassigned = await db.runTransaction(tx => scheduling.choose(tx, { uid: owner, role: 'owner', companyId: id }, { ...base, date: '2030-01-05' }, { preferredTechnicianId: tech, assignmentFallback: 'unassigned' }));
  assert.equal(unassigned.assignedTo, null); assert.equal(unassigned.assignmentNeedsAttention, true);
  await db.doc(staffRef(db, id, techUid, qualificationId).path).update({ active: false });
  assert.equal((await scheduling.handle(request('check', { memberId: tech, ...base }))).available, false);
});

test('tenant isolation and role checks protect qualification catalog and internal references', async () => {
  const management = qualificationHandlers(db);
  await assert.rejects(management(request('catalog-save', { name: 'Unauthorized', type: 'training', active: true, tracksExpiration: false }, 'technician')), { code: 'permission-denied' });
  await assert.rejects(management(request('list', { companyId: 'another-company' })), { code: 'permission-denied' });
  const listing = await management(request('list'));
  assert.equal(JSON.stringify(listing).includes('another-company-private'), false);
});

test('future assignment review pages beyond 100 jobs without mixing tenants', async () => {
  const batch = db.batch();
  for (let index = 0; index < 101; index++) batch.set(db.doc(`jobs/${id}-future-${String(index).padStart(3, '0')}`), { companyId: id, date: '2030-01-03', status: 'scheduled', assignedTo: tech, assignedToUid: techUid, serviceType: 'Inspection' });
  await batch.commit();
  const management = qualificationHandlers(db);
  const first = await management(request('attention'));
  assert.ok(first.nextAfterJobId);
  const second = await management(request('attention', { afterJobId: first.nextAfterJobId }));
  assert.equal(second.nextAfterJobId, null);
  assert.equal(new Set([...first.attention, ...second.attention].map(row => row.jobId)).size, 101);
  assert.ok([...first.attention, ...second.attention].every(row => row.jobId.startsWith(id)));
});
