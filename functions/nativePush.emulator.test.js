const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { nativePushHandlers, EXPO_PROJECT_ID } = require('./nativePush');
const emulator = /^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '');
test('emulator: atomic duplicate enqueue, reassignment denial and server-only native push records', { skip: !emulator }, async () => {
  const { initializeApp, getApps } = require('firebase-admin/app'), { getFirestore } = require('firebase-admin/firestore');
  const app = getApps().find(item => item.name === 'native-push-tests') || initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-route-logistics' }, 'native-push-tests'), db = getFirestore(app);
  const suffix = randomUUID(), companyId = `push-company-${suffix}`, membershipId = `push-member-${suffix}`, uid = `push-user-${suffix}`, jobId = `push-job-${suffix}`;
  const cleanup = [];
  const put = async (collection, id, data) => { const ref = db.collection(collection).doc(id); await ref.set(data); cleanup.push(ref); return ref; };
  const api = nativePushHandlers(db, { enabled: () => true, getUser: async () => ({ emailVerified: true }), fetcher: async () => { throw new Error('Reassigned work must not send.'); } });
  try {
    await put('companies', companyId, { ownerId: 'separate-owner' }); await put('teamMembers', membershipId, { uid, companyId, status: 'active', role: 'technician' });
    const job = { companyId, assignedTo: membershipId, status: 'scheduled' }, jobRef = await put('jobs', jobId, job);
    const registration = await api.manage({ auth: { uid, token: { email_verified: true, companyId, membershipId, role: 'technician' } }, data: { action: 'register', token: `ExpoPushToken[${suffix.replaceAll('-', '')}]`, installationId: suffix, registrationSequence: 1, platform: 'ios', projectId: EXPO_PROJECT_ID } }); cleanup.push(db.collection('rlPushDevices').doc(registration.deviceId));
    await Promise.all([api.enqueue(null, job, jobId, suffix), api.enqueue(null, job, jobId, suffix)]);
    const deliveries = await db.collection('rlPushDeliveries').where('jobId', '==', jobId).get(); cleanup.push(...deliveries.docs.map(item => item.ref)); assert.equal(deliveries.size, 1);
    await jobRef.update({ assignedTo: 'another-member' }); await api.processDelivery(deliveries.docs[0].ref); assert.equal((await deliveries.docs[0].ref.get()).get('state'), 'superseded');
  } finally { await Promise.all(cleanup.map(ref => ref.delete())); }
});
