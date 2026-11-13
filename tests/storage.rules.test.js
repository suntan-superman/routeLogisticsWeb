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
  const other = env.authenticatedContext('other', { companyId: 'other', role: 'owner' }).storage(); await assertFails(getMetadata(ref(other, file.fullPath)));
});
