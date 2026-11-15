const { test, before, after } = require('node:test');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc } = require('firebase/firestore');
const { ref, uploadBytes, getMetadata } = require('firebase/storage');
const fs = require('node:fs');
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-routelogistics', storage: { rules: fs.readFileSync('storage.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'companies/storage-co'), { ownerId: 'storage-owner' }); await setDoc(doc(ctx.firestore(), 'teamMembers/storage-member'), { companyId: 'storage-co', uid: 'storage-tech', status: 'active', role: 'technician' }); });
});
after(() => env.cleanup());
test('technicians cannot bypass authenticated photo delivery via Storage, including after removal', async () => {
  const storage = env.authenticatedContext('storage-tech', { companyId: 'storage-co', membershipId: 'storage-member', role: 'technician', email_verified: true }).storage();
  const file = ref(storage, 'companies/storage-co/jobs/test/photo.jpg');
  await env.withSecurityRulesDisabled(ctx => uploadBytes(ref(ctx.storage(), file.fullPath), new Uint8Array([1, 2]), { contentType: 'image/jpeg' }));
  await assertFails(uploadBytes(file, new Uint8Array([1, 2]), { contentType: 'image/jpeg' }));
  await assertFails(getMetadata(file));
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'teamMembers/storage-member'), { status: 'removed' }));
  await assertFails(getMetadata(file)); await assertFails(uploadBytes(file, new Uint8Array([3]), { contentType: 'image/jpeg' }));
  const owner = env.authenticatedContext('storage-owner', { companyId: 'storage-co', role: 'owner', email_verified: true }).storage(); await assertSucceeds(getMetadata(ref(owner, file.fullPath)));
  const legacy = ref(owner, 'users/storage-owner/jobs/legacy/photo.jpg');
  await assertSucceeds(uploadBytes(legacy, new Uint8Array([1, 2]), { contentType: 'image/jpeg' }));
  await assertSucceeds(getMetadata(legacy));
  await assertFails(getMetadata(ref(storage, legacy.fullPath)));
  const other = env.authenticatedContext('other', { companyId: 'other', role: 'owner' }).storage(); await assertFails(getMetadata(ref(other, file.fullPath)));
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'teamMembers/fake-owner'), { companyId: 'storage-co', uid: 'not-owner', status: 'active', role: 'owner' }));
  const fakeOwner = env.authenticatedContext('not-owner', { companyId: 'storage-co', membershipId: 'fake-owner', role: 'owner', email_verified: true }).storage();
  await assertFails(getMetadata(ref(fakeOwner, file.fullPath)));
});

test('account deletion markers immediately deny retained business Storage objects to stale owner and solo tokens', async () => {
  const owner = env.authenticatedContext('deleted-storage-owner', { companyId: 'deleted-storage-co', role: 'owner', email_verified: true }).storage();
  const solo = env.authenticatedContext('deleted-storage-solo', { email_verified: true }).storage();
  const ownerPath = 'companies/deleted-storage-co/jobs/history/photo.jpg', soloPath = 'users/deleted-storage-solo/jobs/history/photo.jpg';
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'companies/deleted-storage-co'), { ownerId: 'deleted-storage-owner' });
    await setDoc(doc(ctx.firestore(), 'users/deleted-storage-solo'), { name: 'Synthetic solo' });
    for (const path of [ownerPath, soloPath]) await uploadBytes(ref(ctx.storage(), path), new Uint8Array([1, 2]), { contentType: 'image/jpeg' });
  });
  await assertSucceeds(getMetadata(ref(owner, ownerPath))); await assertSucceeds(getMetadata(ref(solo, soloPath)));
  await env.withSecurityRulesDisabled(async ctx => {
    for (const uid of ['deleted-storage-owner', 'deleted-storage-solo']) await setDoc(doc(ctx.firestore(), `rlAccountDeletions/${uid}`), { status: 'deleted' });
  });
  await assertFails(getMetadata(ref(owner, ownerPath))); await assertFails(getMetadata(ref(solo, soloPath)));
  await assertFails(uploadBytes(ref(solo, soloPath), new Uint8Array([3]), { contentType: 'image/jpeg' }));
});

test('active administrators retain Storage access within its two-document Firestore lookup limit', async () => {
  const admin = env.authenticatedContext('storage-limit-admin', { companyId: 'storage-limit-co', membershipId: 'storage-limit-member', role: 'admin', email_verified: true }).storage();
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'companies/storage-limit-co'), { ownerId: 'storage-limit-owner' });
    await setDoc(doc(ctx.firestore(), 'teamMembers/storage-limit-member'), { uid: 'storage-limit-admin', companyId: 'storage-limit-co', role: 'admin', status: 'active' });
  });
  const file = ref(admin, 'companies/storage-limit-co/jobs/test/photo.jpg');
  await assertSucceeds(uploadBytes(file, new Uint8Array([1, 2]), { contentType: 'image/jpeg' }));
  await assertSucceeds(getMetadata(file));
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'rlAccountDeletions/storage-limit-admin'), { status: 'pending' }));
  await assertFails(getMetadata(file));
});
