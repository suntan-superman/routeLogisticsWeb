#!/usr/bin/env node
// Run from the RL checkout. This script never reads or writes the MF source folder.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const requireFunctions = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, applicationDefault } = requireFunctions('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore');
const { getAuth } = requireFunctions('firebase-admin/auth');
const { createInvitation } = require('../functions/invitations');
const { normalizeEmail, hash } = require('../functions/security');
const COLLECTIONS = ['customers', 'jobs', 'appointments', 'photos', 'estimates', 'estimateTemplates', 'invoices', 'servicePlans', 'serviceLogs'];

function migrationPatch(collection, data, companyId, ownerId) {
  if (data.companyId && data.companyId !== companyId) throw new Error('Refusing to move a record belonging to another company.');
  const patch = {};
  if (!data.companyId) patch.companyId = companyId;
  if (!data.userId) patch.userId = ownerId;
  if (collection === 'customers') {
    const email = normalizeEmail(data.email);
    if (email && data.emailNormalized !== email) patch.emailNormalized = email;
  }
  return patch;
}

async function main(args) {
  const option = (key) => { const i = args.indexOf(key); return i >= 0 ? args[i + 1] : null; };
  if (args.includes('--help') || !option('--company')) {
    console.log('Usage: node scripts/migrate-mf-companies.js --project PROJECT --company COMPANY_ID [--roles roles.json] [--report report.json] [--data-only] [--apply]\nDry-run by default. Role file: {"member@example.com":"technician"}. Apply requires explicit roles for every legacy member, or --data-only to skip invitations. Never silently converts MF roles. Uses Application Default Credentials.');
    return;
  }
  const companyId = option('--company');
  if (!/^[\w-]+$/.test(companyId)) throw new Error('Invalid company ID.');
  const projectId = option('--project');
  if (!projectId) throw new Error('Specify --project explicitly.');
  const apply = args.includes('--apply');
  const dataOnly = args.includes('--data-only');
  const roles = option('--roles') ? JSON.parse(fs.readFileSync(option('--roles'), 'utf8')) : {};
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const company = await db.collection('companies').doc(companyId).get();
  if (!company.exists || !company.get('ownerId')) throw new Error('Company must have an existing, verified ownerId. Recover ownership separately if absent.');
  const owner = await getAuth().getUser(company.get('ownerId'));
  if (apply && !owner.emailVerified) throw new Error('The company owner must verify their email before applying a migration.');
  const [members, invitations, profiles] = await Promise.all([
    db.collection('teamMembers').where('companyId', '==', companyId).get(),
    db.collection('invitations').where('companyId', '==', companyId).get(),
    db.collection('users').where('companyId', '==', companyId).get(),
  ]);
  const emails = new Set([...members.docs, ...invitations.docs, ...profiles.docs].map((d) => normalizeEmail(d.get('email'))).filter(Boolean));
  emails.delete(normalizeEmail(owner.email));
  const activeEmails = new Set(members.docs.filter((d) => d.get('uid') && d.get('status') === 'active' && ['admin', 'manager', 'technician'].includes(d.get('role'))).map((d) => normalizeEmail(d.get('email'))));
  const invitePlan = [...emails].filter((email) => !activeEmails.has(email)).sort().map((email) => ({ email, role: roles[email] || null }));
  const report = { projectId, companyId, ownerUid: owner.uid, mode: apply ? 'apply' : 'dry-run', dataOnly, invitations: invitePlan, updates: [], review: [] };
  const writes = [];
  for (const name of COLLECTIONS) {
    const scoped = await db.collection(name).where('companyId', '==', companyId).get();
    const solo = await db.collection(name).where('userId', '==', owner.uid).get();
    const docs = new Map([...scoped.docs, ...solo.docs.filter((d) => !d.get('companyId'))].map((d) => [d.id, d]));
    for (const doc of docs.values()) {
      const data = doc.data();
      if (name === 'jobs' && data.status && !['scheduled', 'in-progress', 'completed', 'cancelled'].includes(data.status)) report.review.push({ path: doc.ref.path, reason: `Unsupported job status: ${data.status}` });
      if (name === 'invoices' && data.status && !['draft', 'sent', 'paid', 'void'].includes(data.status)) report.review.push({ path: doc.ref.path, reason: `Unsupported invoice status: ${data.status}` });
      if (name === 'jobs' && (!data.date || !data.customerId)) report.review.push({ path: doc.ref.path, reason: 'Review missing RL date/customerId fields' });
      const patch = migrationPatch(name, data, companyId, owner.uid);
      if (Object.keys(patch).length) { writes.push({ ref: doc.ref, patch }); report.updates.push({ path: doc.ref.path, fields: Object.keys(patch) }); }
    }
  }
  if (option('--report')) fs.writeFileSync(option('--report'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ mode: report.mode, companyId, updates: writes.length, invites: invitePlan.length, rolesRequired: invitePlan.filter((i) => !i.role).length, reviewRequired: report.review.length }, null, 2));
  if (!apply) return;
  if (report.review.length) throw new Error('Resolve the unsupported records listed in the dry-run report before applying. No changes made.');
  if (!dataOnly && invitePlan.some((i) => !['technician', 'manager', 'admin'].includes(i.role))) throw new Error('Assign an explicit RL role to every invitee using --roles, or use --data-only to migrate records independently. No changes made.');
  const run = db.collection('rlMigrationRuns').doc();
  await run.create({ companyId, projectId, startedAt: new Date(), status: 'running', dataOnly, plannedUpdates: writes.length });
  // Each original is backed up in the same transaction as its additive update.
  for (const item of writes) {
    await db.runTransaction(async (tx) => {
      const original = await tx.get(item.ref);
      if (!original.exists) throw new Error(`Record disappeared: ${item.ref.path}`);
      const patch = migrationPatch(item.ref.parent.id, original.data(), companyId, owner.uid);
      if (!Object.keys(patch).length) return;
      tx.create(run.collection('originals').doc(hash(item.ref.path)), { path: item.ref.path, data: original.data() });
      tx.update(item.ref, patch);
    });
  }
  for (const invite of dataOnly ? [] : invitePlan) {
    const marker = run.collection('invitations').doc(hash(invite.email));
    const result = await createInvitation(db, { ...invite, companyId, companyName: company.get('name'), invitedBy: owner.uid, appUrl: process.env.RL_APP_URL || 'https://route-logistics.com', queueEmail: false });
    await marker.set({ memberId: result.teamMemberId, email: invite.email, role: invite.role });
  }
  await run.update({ status: 'complete', completedAt: new Date() });
  console.log(`Migration complete. Audit and originals: ${run.path}. ${dataOnly ? 'Data only: no invitations created or sent.' : 'Members must accept their invitations.'} Owners should sign in to refresh claims.`);
}
if (require.main === module) main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { migrationPatch };
