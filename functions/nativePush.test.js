const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Timestamp, FieldValue } = require('firebase-admin/firestore');
const { nativePushHandlers, jobEvents, EXPO_PROJECT_ID, preferenceId } = require('./nativePush');
const remove = FieldValue.delete();
const clone = value => value instanceof Date ? Timestamp.fromDate(value) : Array.isArray(value) ? value.map(clone) : value && value.constructor === Object ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value;
function memoryDb() {
  const records = new Map(); let transactions = Promise.resolve();
  const apply = (path, data, merge) => { const result = merge ? { ...records.get(path) } : {}; for (const [key, value] of Object.entries(data)) { if (value?.isEqual?.(remove)) delete result[key]; else result[key] = clone(value); } records.set(path, result); };
  const doc = path => ({ path, id: path.split('/').at(-1), get: async () => snapshot(path), set: async (data, options) => apply(path, data, options?.merge), update: async data => { assert.ok(records.has(path)); apply(path, data, true); }, create: async data => { if (records.has(path)) throw Object.assign(new Error('exists'), { code: 6 }); apply(path, data); } });
  const snapshot = path => ({ id: path.split('/').at(-1), ref: doc(path), exists: records.has(path), data: () => records.get(path), get: field => records.get(path)?.[field] });
  const comparable = value => value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : value;
  const query = (name, filters = [], maximum = Infinity) => ({
    doc: id => doc(`${name}/${id}`), where: (field, operator, value) => query(name, [...filters, [field, operator, value]], maximum), limit: value => query(name, filters, value),
    get: async () => { const docs = [...records.keys()].filter(path => path.startsWith(`${name}/`) && path.split('/').length === 2).map(snapshot).filter(record => filters.every(([field, operator, value]) => operator === '==' ? record.get(field) === value : record.get(field) !== undefined && comparable(record.get(field)) <= comparable(value))).slice(0, maximum); return { docs, size: docs.length }; },
  });
  return { records, collection: name => query(name), doc, runTransaction: work => { const result = transactions.then(() => work({ get: ref => ref.get(), set: (ref, data) => apply(ref.path, data), update: (ref, data) => apply(ref.path, data, true), create: (ref, data) => { assert.ok(!records.has(ref.path)); apply(ref.path, data); } })); transactions = result.catch(() => {}); return result; } };
}
const token = 'ExpoPushToken[test-token-123456789]', installationId = '11111111-1111-4111-8111-111111111111';
const request = (data, uid = 'tech', role = 'technician', membershipId = 'member', companyId = 'acme') => ({ auth: { uid, token: { email_verified: true, companyId, role, membershipId } }, data });
async function setup() {
  const db = memoryDb(), env = { now: Date.now(), enabled: true, requests: [], response: [{ status: 'ok', id: 'ticket' }], failure: null, httpStatus: 200 }; let sequence = 0;
  await db.collection('companies').doc('acme').set({ ownerId: 'owner' });
  await db.collection('teamMembers').doc('member').set({ uid: 'tech', companyId: 'acme', status: 'active', role: 'technician' });
  await db.collection('teamMembers').doc('manager').set({ uid: 'manager', companyId: 'acme', status: 'active', role: 'manager' });
  await db.collection('jobs').doc('job').set({ companyId: 'acme', assignedTo: 'member', status: 'scheduled', date: '2026-11-15', time: '09:00' });
  const api = nativePushHandlers(db, { enabled: () => env.enabled, now: () => env.now, getUser: async () => ({ emailVerified: true, disabled: false }), fetcher: async (url, options) => { const body = JSON.parse(options.body); env.requests.push({ url, body }); if (env.failure) throw env.failure; return { ok: env.httpStatus === 200, status: env.httpStatus, json: async () => ({ data: typeof env.response === 'function' ? await env.response(url, body) : env.response }) }; } });
  const register = async (uid = 'tech', member = 'member', role = 'technician', pushToken = token, install = installationId, platform = 'ios') => api.manage(request({ action: 'register', token: pushToken, platform, projectId: EXPO_PROJECT_ID, installationId: install, registrationSequence: ++sequence }, uid, role, member));
  return { db, env, api, register };
}
test('native event selection distinguishes assignment, schedule and important status changes', () => {
  const job = { companyId: 'acme', assignedTo: 'member', status: 'scheduled', date: '2026-11-15' };
  assert.deepEqual(jobEvents(null, job), ['assignment']); assert.deepEqual(jobEvents(job, { ...job, time: '10:00' }), ['schedule']); assert.deepEqual(jobEvents(job, { ...job, status: 'completed' }), ['status']); assert.deepEqual(jobEvents(job, job), []); assert.deepEqual(jobEvents(null, { assignedTo: 'member' }), []);
});
test('registration requires verified active same-company membership and preserves installation ownership', async () => {
  const { db, api, register } = await setup();
  const result = await register(); assert.equal(typeof result.deviceId, 'string'); assert.equal(result.token, undefined);
  await assert.rejects(register('tech', 'member', 'technician', token, '22222222-2222-4222-8222-222222222222'), { code: 'permission-denied' });
  await assert.rejects(api.manage(request({ action: 'register', token, platform: 'ios', projectId: 'other', installationId })), { code: 'invalid-argument' });
  await db.collection('teamMembers').doc('member').update({ status: 'pending' }); await assert.rejects(register(), { code: 'permission-denied' });
});
test('same physical installation can securely retarget a token without retaining previous recipient scope', async () => {
  const { db, register } = await setup(); const first = await register();
  await db.collection('teamMembers').doc('other').set({ uid: 'other', companyId: 'acme', status: 'active', role: 'technician' });
  const second = await register('other', 'other'); assert.equal(first.deviceId, second.deviceId); const saved = await db.collection('rlPushDevices').doc(second.deviceId).get(); assert.equal(saved.get('uid'), 'other'); assert.equal(saved.get('membershipId'), 'other');
});
test('rotation deactivates only superseded tokens for the same installation and rejects stale register/invalidate requests', async () => {
  const { db, api, register } = await setup(); const first = await register();
  const other = await register('tech', 'member', 'technician', 'ExpoPushToken[another-device-12345678]', '22222222-2222-4222-8222-222222222222');
  const latest = await register('tech', 'member', 'technician', 'ExpoPushToken[rotated-device-12345678]');
  assert.equal((await db.collection('rlPushDevices').doc(first.deviceId).get()).get('active'), false); assert.equal((await db.collection('rlPushDevices').doc(other.deviceId).get()).get('active'), true);
  await assert.rejects(api.manage(request({ action: 'register', token, platform: 'ios', projectId: EXPO_PROJECT_ID, installationId, registrationSequence: first.registrationSequence })), { code: 'aborted' });
  await api.manage(request({ action: 'invalidate', deviceId: latest.deviceId, installationId, registrationSequence: first.registrationSequence })); assert.equal((await db.collection('rlPushDevices').doc(latest.deviceId).get()).get('active'), true);
});
test('installation release fences a late old-account registration even when no local device record was saved', async () => {
  const { db, api, register } = await setup(); await register();
  await api.manage(request({ action: 'invalidate-installation', installationId, registrationSequence: 10 }));
  await assert.rejects(api.manage(request({ action: 'register', token: 'ExpoPushToken[late-server-token-1234]', platform: 'ios', projectId: EXPO_PROJECT_ID, installationId, registrationSequence: 9 })), { code: 'aborted' });
  assert.equal((await db.collection('rlPushDevices').get()).docs.filter(record => record.get('active')).length, 0);
});
test('duplicate triggers create one delivery and disabled preferences prevent enqueue', async () => {
  const { db, api, register } = await setup(); await register(); const job = (await db.collection('jobs').doc('job').get()).data();
  await Promise.all([api.enqueue(null, job, 'job', 'event'), api.enqueue(null, job, 'job', 'event')]); assert.equal((await db.collection('rlPushDeliveries').get()).size, 1);
  await api.manage(request({ action: 'preferences', preferences: { assignments: false } })); await api.enqueue(null, job, 'job', 'another'); assert.equal((await db.collection('rlPushDeliveries').get()).size, 1);
});
test('delivery revalidates job assignment and membership before exposing a notification', async () => {
  const { db, env, api, register } = await setup(); await register(); const job = (await db.collection('jobs').doc('job').get()).data(); await api.enqueue(null, job, 'job', 'event');
  await db.collection('jobs').doc('job').update({ assignedTo: 'manager' }); await api.drain(); assert.equal(env.requests.length, 0); assert.equal((await db.collection('rlPushDeliveries').get()).docs[0].get('state'), 'superseded');
});
test('bounded retries, leased duplicate guard and receipts do not resend accepted tickets', async () => {
  const { db, env, api, register } = await setup(); await register(); await api.enqueue(null, (await db.collection('jobs').doc('job').get()).data(), 'job', 'event');
  env.httpStatus = 429; await api.drain(); const ref = (await db.collection('rlPushDeliveries').get()).docs[0].ref; assert.equal((await ref.get()).get('state'), 'retry');
  env.now += 3600000; env.httpStatus = 200; await Promise.all([api.drain(), api.drain()]); assert.equal(env.requests.length, 2); assert.equal((await ref.get()).get('state'), 'receipt');
  env.now += 900000; env.response = { ticket: { status: 'ok' } }; await api.drain(); assert.equal((await ref.get()).get('state'), 'receipt-ok'); assert.equal(env.requests.filter(item => item.url.endsWith('/send')).length, 2);
  assert.equal(env.requests[1].body[0].data.recipientUid, 'tech'); assert.doesNotMatch(env.requests[1].body[0].body, /customer|address|phone/i);
});
test('ambiguous provider acceptance is recorded for review rather than sending duplicate background banners', async () => {
  const { db, env, api, register } = await setup(); await register(); const job = (await db.collection('jobs').doc('job').get()).data(); await api.enqueue(null, job, 'job', 'event');
  env.failure = new Error('Transport timed out after request dispatch'); await api.drain(); assert.equal((await db.collection('rlPushDeliveries').get()).docs[0].get('state'), 'uncertain-send');
  env.failure = null; env.now += 3600000; await api.enqueue(null, job, 'job', 'event'); await api.drain(); assert.equal(env.requests.length, 1);
});
test('dead token receipts invalidate only the matching current device binding', async () => {
  const { db, env, api, register } = await setup(); const registered = await register(); await api.enqueue(null, (await db.collection('jobs').doc('job').get()).data(), 'job', 'event'); await api.drain();
  env.now += 900000; env.response = { ticket: { status: 'error', details: { error: 'DeviceNotRegistered' } } }; await api.drain(); assert.equal((await db.collection('rlPushDevices').doc(registered.deviceId).get()).get('active'), false);
});
test('revoking a member and disabling delivery do not affect another tenant or web FCM tokens', async () => {
  const { db, env, api, register } = await setup(); await register(); await db.collection('deviceTokens').doc('web').set({ token: 'web-preserved' });
  await db.collection('rlPushDevices').doc('foreign').set({ uid: 'foreign', companyId: 'other', membershipId: 'other', active: true });
  await db.collection('teamMembers').doc('member').update({ status: 'inactive' }); await api.revokeMembership({ data: { data: () => ({ status: 'active' }) }, params: { id: 'member' } }); assert.equal((await db.collection('rlPushDevices').doc('foreign').get()).get('active'), true); assert.equal((await db.collection('deviceTokens').doc('web').get()).get('token'), 'web-preserved');
  env.enabled = false; assert.deepEqual(await api.drain(), { enabled: false, processed: 0 }); assert.equal(env.requests.length, 0);
});
test('unrefreshed registrations expire after thirty days without deleting work or customer records', async () => {
  const { db, env, api, register } = await setup(), result = await register(); await db.collection('customers').doc('customer').set({ name: 'Keep customer' }); env.now += 31 * 86400000; env.enabled = false; await api.drain();
  const device = await db.collection('rlPushDevices').doc(result.deviceId).get(); assert.equal(device.get('active'), false); assert.equal(device.get('invalidationReason'), 'registration-expired'); assert.equal(device.get('expiresAt'), undefined); assert.equal((await db.collection('customers').doc('customer').get()).get('name'), 'Keep customer'); assert.equal(env.requests.length, 0);
});
test('preferences are scoped to current role and tenant, and invalidation works after membership revocation', async () => {
  const { db, api, register } = await setup(), device = await register(); await api.manage(request({ action: 'preferences', preferences: { enabled: false } }));
  const scoped = await db.collection('rlPushPreferences').doc(preferenceId({ uid: 'tech', companyId: 'acme', membershipId: 'member', role: 'technician' })).get(); assert.equal(scoped.get('preferences').enabled, false);
  await db.collection('teamMembers').doc('member').update({ status: 'inactive' }); await api.manage(request({ action: 'invalidate', deviceId: device.deviceId, installationId, registrationSequence: device.registrationSequence })); assert.equal((await db.collection('rlPushDevices').doc(device.deviceId).get()).get('active'), false);
});

const androidToken = 'ExpoPushToken[synthetic-android-device-12345678]';
const androidInstallation = '22222222-2222-4222-8222-222222222222';
async function registerOtherTenant(db, api) {
  await db.collection('companies').doc('other').set({ ownerId: 'other-owner' });
  await db.collection('teamMembers').doc('other-member').set({ uid: 'tech', companyId: 'other', status: 'active', role: 'technician' });
  // The same UID can leave a previous tenant's device record behind. Its exact
  // company/member scope must still prevent an unrelated assignment delivery.
  return api.manage(request({ action: 'register', token: 'ExpoPushToken[synthetic-other-tenant-12345678]', platform: 'android', projectId: EXPO_PROJECT_ID, installationId: '33333333-3333-4333-8333-333333333333', registrationSequence: 1 }, 'tech', 'technician', 'other-member', 'other'));
}

test('one assignment fans out once to iOS and Android in the exact member scope, excluding stale roles and other tenants', async () => {
  const { db, env, api, register } = await setup();
  const ios = await register(), android = await register('tech', 'member', 'technician', androidToken, androidInstallation, 'android');
  const foreign = await registerOtherTenant(db, api);
  await db.collection('rlPushDevices').doc('stale-role').set({ uid: 'tech', companyId: 'acme', membershipId: 'member', role: 'manager', platform: 'android', active: true, token: 'ExpoPushToken[synthetic-stale-role-12345678]' });
  const job = (await db.collection('jobs').doc('job').get()).data();
  await Promise.all([api.enqueue(null, job, 'job', 'mixed-event'), api.enqueue(null, job, 'job', 'mixed-event')]);
  let rows = (await db.collection('rlPushDeliveries').get()).docs;
  assert.equal(rows.length, 2); assert.deepEqual(new Set(rows.map(row => row.get('deviceId'))), new Set([ios.deviceId, android.deviceId]));
  for (const row of rows) assert.deepEqual(['uid', 'companyId', 'membershipId', 'role'].map(key => row.get(key)), ['tech', 'acme', 'member', 'technician']);
  assert.equal((await db.collection('rlPushDevices').doc(ios.deviceId).get()).get('platform'), 'ios');
  assert.equal((await db.collection('rlPushDevices').doc(android.deviceId).get()).get('platform'), 'android');
  env.response = (url, body) => url.endsWith('/send') ? [{ status: 'ok', id: body[0].to === androidToken ? 'android-ticket' : 'ios-ticket' }] : Object.fromEntries(body.ids.map(id => [id, { status: 'ok' }]));
  await api.drain();
  const sends = env.requests.filter(item => item.url.endsWith('/send'));
  assert.equal(sends.length, 2); assert.deepEqual(new Set(sends.map(item => item.body[0].to)), new Set([token, androidToken]));
  for (const { body: [message] } of sends) {
    assert.equal(message.channelId, 'work-updates'); assert.equal(message.priority, 'high'); assert.equal(message.sound, 'default'); assert.equal(message.ttl, 3600);
    assert.equal(message.data.recipientUid, 'tech'); assert.equal(message.data.companyId, 'acme'); assert.equal(message.data.membershipId, 'member'); assert.equal(message.data.role, 'technician');
  }
  await api.enqueue(null, job, 'job', 'mixed-event'); env.now += 900000; await api.drain();
  rows = (await db.collection('rlPushDeliveries').get()).docs;
  assert.equal(rows.length, 2); assert.ok(rows.every(row => row.get('state') === 'receipt-ok'));
  assert.equal(env.requests.filter(item => item.url.endsWith('/send')).length, 2);
  assert.equal((await db.collection('rlPushDevices').doc(foreign.deviceId).get()).get('active'), true);
});

for (const stage of ['ticket', 'receipt']) test(`Android InvalidCredentials at ${stage} is recorded without disabling or resending a working iOS device`, async () => {
  const { db, env, api, register } = await setup();
  const ios = await register(), android = await register('tech', 'member', 'technician', androidToken, androidInstallation, 'android');
  const jobRef = db.collection('jobs').doc('job'), memberRef = db.collection('teamMembers').doc('member');
  const jobBefore = (await jobRef.get()).data(), memberBefore = (await memberRef.get()).data();
  env.response = (url, body) => {
    if (url.endsWith('/send')) return body[0].to === androidToken && stage === 'ticket' ? [{ status: 'error', details: { error: 'InvalidCredentials' } }] : [{ status: 'ok', id: body[0].to === androidToken ? 'android-ticket' : 'ios-ticket' }];
    return Object.fromEntries(body.ids.map(id => [id, id === 'android-ticket' ? { status: 'error', details: { error: 'InvalidCredentials' } } : { status: 'ok' }]));
  };
  await api.enqueue(null, jobBefore, 'job', `credentials-${stage}`); await api.drain(); env.now += 900000; await api.drain();
  const rows = (await db.collection('rlPushDeliveries').get()).docs;
  const androidDelivery = rows.find(row => row.get('deviceId') === android.deviceId), iosDelivery = rows.find(row => row.get('deviceId') === ios.deviceId);
  assert.equal(androidDelivery.get('state'), stage === 'ticket' ? 'blocked' : 'failed'); assert.equal(androidDelivery.get('errorCode'), 'InvalidCredentials');
  assert.equal(iosDelivery.get('state'), 'receipt-ok'); assert.equal(iosDelivery.get('errorCode'), undefined);
  assert.equal((await db.collection('rlPushDevices').doc(ios.deviceId).get()).get('active'), true);
  assert.equal((await db.collection('rlPushDevices').doc(android.deviceId).get()).get('active'), true);
  env.now += 3600000; await api.enqueue(null, jobBefore, 'job', `credentials-${stage}`); await api.drain();
  assert.equal(env.requests.filter(item => item.url.endsWith('/send')).length, 2); assert.equal((await db.collection('rlPushDeliveries').get()).size, 2);
  assert.deepEqual((await jobRef.get()).data(), jobBefore); assert.deepEqual((await memberRef.get()).data(), memberBefore);
});

test('Android token rotation and installation release preserve iOS, foreign-tenant registrations and queued work', async () => {
  const { db, env, api, register } = await setup();
  const ios = await register(), oldAndroid = await register('tech', 'member', 'technician', androidToken, androidInstallation, 'android');
  const foreign = await registerOtherTenant(db, api), original = (await db.collection('jobs').doc('job').get()).data();
  await api.enqueue(null, original, 'job', 'before-rotation');
  const rotatedToken = 'ExpoPushToken[synthetic-android-rotated-12345678]';
  const latestAndroid = await register('tech', 'member', 'technician', rotatedToken, androidInstallation, 'android');
  assert.equal((await db.collection('rlPushDevices').doc(oldAndroid.deviceId).get()).get('active'), false);
  assert.equal((await db.collection('rlPushDevices').doc(ios.deviceId).get()).get('active'), true);
  assert.equal((await db.collection('rlPushDevices').doc(foreign.deviceId).get()).get('active'), true);
  const next = { ...original, time: '11:00' }; await db.collection('jobs').doc('next-job').set(next); await api.enqueue(null, next, 'next-job', 'after-rotation');
  env.response = () => [{ status: 'ok', id: `ticket-${env.requests.length}` }]; await api.drain();
  const sends = env.requests.filter(item => item.url.endsWith('/send'));
  assert.equal(sends.length, 3); assert.equal(sends.filter(item => item.body[0].to === token).length, 2); assert.equal(sends.filter(item => item.body[0].to === rotatedToken).length, 1);
  assert.equal(sends.some(item => item.body[0].to === androidToken), false); assert.ok(sends.every(item => item.body[0].data.companyId === 'acme'));
  const prior = (await db.collection('rlPushDeliveries').get()).docs.find(row => row.get('deviceId') === oldAndroid.deviceId); assert.equal(prior.get('state'), 'superseded');
  await api.manage(request({ action: 'invalidate-installation', installationId: androidInstallation, registrationSequence: latestAndroid.registrationSequence + 1 }));
  assert.equal((await db.collection('rlPushDevices').doc(latestAndroid.deviceId).get()).get('active'), false);
  assert.equal((await db.collection('rlPushDevices').doc(ios.deviceId).get()).get('active'), true); assert.equal((await db.collection('rlPushDevices').doc(foreign.deviceId).get()).get('active'), true);
  assert.deepEqual((await db.collection('jobs').doc('job').get()).data(), original); assert.deepEqual((await db.collection('jobs').doc('next-job').get()).data(), next);
});

test('reassignment requests notify only management with stable deduplication and no private explanation in push',async()=>{
 const {db,env,api,register}=await setup();await register();
 await db.doc('teamMembers/legacy-owner').set({uid:'owner',companyId:'acme',status:'active',role:'admin'});
 const manager=await register('manager','manager','manager','ExpoPushToken[synthetic-manager-123456789]',androidInstallation,'android');
 const owner=await register('owner',null,'owner','ExpoPushToken[synthetic-owner-123456789]','44444444-4444-4444-8444-444444444444');
 const before=(await db.doc('jobs/job').get()).data(),after={...before,reassignmentRequest:{id:'request-one',status:'pending',reason:'vehicle',notes:'PRIVATE vehicle and medical explanation'}};await db.doc('jobs/job').set(after);
 await api.enqueue(before,after,'job','event-request');await api.enqueue(before,after,'job','redelivered-event-with-different-id');
 const rows=(await db.collection('rlPushDeliveries').get()).docs;assert.equal(rows.length,2);assert.deepEqual(new Set(rows.map(row=>row.get('deviceId'))),new Set([manager.deviceId,owner.deviceId]));assert.ok(rows.every(row=>row.get('kind')==='reassignment-request'&&row.get('eventId')==='job-exception:request-one'));
 await api.drain();assert.equal(env.requests.length,2);for(const message of env.requests.map(row=>row.body[0])){assert.equal(message.data.type,'job-reassignment-request');assert.equal(message.title,'Reassignment requested');assert.doesNotMatch(JSON.stringify(message),/PRIVATE|medical|vehicle/);}
});

test('resolved reassignment requests are superseded before send and status preference disables request alerts',async()=>{
 const {db,env,api,register}=await setup();await register('manager','manager','manager','ExpoPushToken[synthetic-manager-123456789]',androidInstallation,'android');
 const before=(await db.doc('jobs/job').get()).data(),after={...before,reassignmentRequest:{id:'pending-request',status:'pending'}};await db.doc('jobs/job').set(after);await api.enqueue(before,after,'job','request-event');await db.doc('jobs/job').update({reassignmentRequest:null});await api.drain();assert.equal(env.requests.length,0);assert.equal((await db.collection('rlPushDeliveries').get()).docs[0].get('state'),'superseded');
 await api.manage(request({action:'preferences',preferences:{status:false}},'manager','manager','manager'));await db.doc('jobs/job').set(after);await api.enqueue(before,{...after,reassignmentRequest:{id:'next-request',status:'pending'}},'job','next-event');assert.equal((await db.collection('rlPushDeliveries').get()).size,1);
});

test('reassignment sends old assignee a removal and new assignee an assignment without leaking work notes',async()=>{
 const {db,env,api,register}=await setup();const old=await register(),next=await register('manager','manager','manager','ExpoPushToken[synthetic-manager-123456789]',androidInstallation,'android');
 const before=(await db.doc('jobs/job').get()).data(),after={...before,assignedTo:'manager',assignedToUid:'manager',workNotes:'PRIVATE observations'};await db.doc('jobs/job').set(after);assert.deepEqual(jobEvents(before,after),['removal','assignment']);await api.enqueue(before,after,'job','reassignment-event');await api.drain();
 const rows=(await db.collection('rlPushDeliveries').get()).docs;assert.equal(rows.length,2);assert.equal(rows.find(row=>row.get('deviceId')===old.deviceId).get('kind'),'removal');assert.equal(rows.find(row=>row.get('deviceId')===next.deviceId).get('kind'),'assignment');
 const messages=env.requests.map(row=>row.body[0]);assert.ok(messages.some(message=>message.data.type==='job-removal'&&message.data.recipientUid==='tech'));assert.ok(messages.some(message=>message.data.type==='job-assignment'&&message.data.recipientUid==='manager'));assert.doesNotMatch(JSON.stringify(messages),/PRIVATE|observations/);
});
