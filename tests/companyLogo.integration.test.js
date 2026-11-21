// Firestore emulator only. Uses an in-memory Storage bucket and synthetic tenants.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { companyLogoHandler, loadLogo } = require('../functions/companyLogo');
let app, db;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=', 'base64');
before(() => {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Firestore emulator required. Production access forbidden.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'company-logo-tests'); db = getFirestore(app);
});
after(() => app && deleteApp(app));
const bucket = () => {
  const objects = new Map();
  return { objects, file: name => ({
    save: async (bytes, options) => objects.set(name, { bytes: Buffer.from(bytes), contentType: options.contentType }),
    delete: async () => objects.delete(name),
    getMetadata: async () => { const item = objects.get(name); if (!item) throw Error('Missing object'); return [{ size: item.bytes.length, contentType: item.contentType }]; },
    download: async () => [objects.get(name).bytes],
  }) };
};
const actor = (uid, companyId, role, membershipId) => ({ uid, token: { companyId, role, membershipId, email_verified: true, email: `${uid}@example.invalid` } });

test('owner/admin can upload, preview, replace and remove; technicians and other tenants cannot', async () => {
  const id = `logo-${process.pid}-${Date.now()}`, foreign = `${id}-foreign`, owner = `${id}-owner`, admin = `${id}-admin`, manager = `${id}-manager`, tech = `${id}-tech`;
  await db.doc(`companies/${id}`).set({ ownerId: owner, name: 'Synthetic Company', isActive: true, logo: 'https://example.invalid/old-logo.png' });
  await db.doc(`companies/${foreign}`).set({ ownerId: `${foreign}-owner`, name: 'Foreign Company', isActive: true });
  for (const [uid, role] of [[admin, 'admin'], [manager, 'manager'], [tech, 'technician']]) await db.doc(`teamMembers/${uid}`).set({ uid, role, status: 'active', companyId: id });
  for (const uid of [owner, admin, manager, tech]) await db.doc(`users/${uid}`).set({ email: `${uid}@example.invalid` });
  const memory = bucket(), handle = companyLogoHandler(db, { bucket: () => memory });
  const call = (auth, data) => handle({ auth, data });
  const own = actor(owner, id, 'owner'), management = actor(admin, id, 'admin', admin), reader = actor(manager, id, 'manager', manager), technician = actor(tech, id, 'technician', tech);
  assert.equal((await call(own, { action: 'read' })).preview, 'https://example.invalid/old-logo.png');
  await assert.rejects(call(technician, { action: 'upload', contentType: 'image/png', base64: png.toString('base64') }), { code: 'permission-denied' });
  await assert.rejects(call(own, { action: 'upload', contentType: 'image/png', base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64') }), { code: 'invalid-argument' });
  assert.equal((await call(actor(`${foreign}-owner`, foreign, 'owner'), { action: 'read', companyId: id })).logo, '');
  const uploaded = await call(own, { action: 'upload', contentType: 'image/png', base64: png.toString('base64') });
  assert.match(uploaded.logo, new RegExp(`^rlCompanyLogos/${id}/`));
  assert.equal((await db.doc(`companies/${id}`).get()).get('logo'), uploaded.logo);
  assert.equal((await call(management, { action: 'read' })).preview, uploaded.preview);
  assert.equal((await call(reader, { action: 'read' })).preview, uploaded.preview);
  await assert.rejects(call(reader, { action: 'remove' }), { code: 'permission-denied' });
  assert.equal((await loadLogo(uploaded.logo, id, memory)).bytes.equals(png), true);
  assert.equal(await loadLogo(uploaded.logo, foreign, memory), null);
  const replaced = await call(management, { action: 'upload', contentType: 'image/png', base64: png.toString('base64') });
  assert.notEqual(replaced.logo, uploaded.logo);
  assert.ok(memory.objects.has(uploaded.logo)); // immutable issued PDFs may still reference the prior logo
  await call(management, { action: 'remove' });
  assert.equal((await db.doc(`companies/${id}`).get()).get('logo'), '');
  assert.ok(memory.objects.has(replaced.logo));
  await call(own, { action: 'url', url: 'https://example.invalid/legacy-logo.png' });
  assert.equal((await db.doc(`companies/${id}`).get()).get('logo'), 'https://example.invalid/legacy-logo.png');
  await assert.rejects(call(own, { action: 'url', url: 'http://example.invalid/logo.png' }), { code: 'invalid-argument' });
});
