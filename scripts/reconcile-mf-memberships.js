// One-time reconciliation using the existing rlMigrationRuns/originals convention.
const fs = require('node:fs');
const path = require('node:path');
const req = require('node:module').createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, applicationDefault } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { getAuth } = req('firebase-admin/auth');
const { hash, normalizeEmail } = require('../functions/security');
const { createInvitation, memberIdFor } = require('../functions/invitations');
const rolesAllowed = ['technician', 'manager', 'admin'];
const visible = (data) => !['removed', 'superseded'].includes(data.status);

async function reconcileIdentity(db, companyId, email, ownerUid, run) {
  return db.runTransaction(async (tx) => {
    const identity = db.doc(`rlMembershipIdentities/${memberIdFor(companyId, email)}`);
    const [company, lock, members] = await Promise.all([tx.get(db.doc(`companies/${companyId}`)), tx.get(identity), tx.get(db.collection('teamMembers').where('companyId', '==', companyId))]);
    if (company.get('ownerId') !== ownerUid) throw new Error('Owner changed; reconciliation stopped.');
    const matches = members.docs.filter((d) => normalizeEmail(d.get('email')) === email && visible(d.data()));
    const active = matches.filter((d) => d.get('status') === 'active');
    if (active.length > 1) throw new Error('Multiple active memberships require owner review; no privileges were changed.');
    const canonical = active[0] || matches.find((d) => d.id === lock.get('memberId')) || matches.find((d) => d.get('schemaVersion') === 2) || matches.sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!canonical || matches.length < 2) return { archived: 0 };
    for (const duplicate of matches.filter((d) => d.id !== canonical.id)) {
      tx.create(run.collection('originals').doc(hash(duplicate.ref.path)), { path: duplicate.ref.path, data: duplicate.data() });
      tx.update(duplicate.ref, { status: 'superseded', supersededBy: canonical.id, updatedAt: new Date().toISOString() });
    }
    tx.set(identity, { companyId, email, memberId: canonical.id, updatedAt: new Date() });
    return { archived: matches.length - 1, memberId: canonical.id };
  });
}
async function inventory(db, auth, companyId, baseline) {
  const company = await db.doc(`companies/${companyId}`).get();
  if (!company.exists || !company.get('ownerId')) throw new Error('Company owner is required.');
  const owner = await auth.getUser(company.get('ownerId'));
  const sources = {};
  for (const collection of ['teamMembers', 'invitations', 'users']) {
    const snap = await db.collection(collection).where('companyId', '==', companyId).get();
    sources[collection] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const originals = new Set((baseline?.invitations || []).map((i) => normalizeEmail(i.email)));
  const emails = new Set([...Object.values(sources).flat().map((r) => normalizeEmail(r.email)), ...originals]);
  emails.delete(''); emails.delete(normalizeEmail(owner.email));
  const candidates = [];
  for (const email of [...emails].sort()) {
    let account;
    try { const user = await auth.getUserByEmail(email); account = { uid: user.uid, emailVerified: user.emailVerified, disabled: user.disabled }; }
    catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    const records = Object.entries(sources).flatMap(([collection, rows]) => rows.filter((r) => normalizeEmail(r.email) === email).map((r) => ({ collection, id: r.id, companyId: r.companyId, uid: r.uid || (collection === 'users' ? r.id : null), email: r.email, role: r.role || null, status: r.status || null, schemaVersion: r.schemaVersion || null })));
    const members = records.filter((r) => r.collection === 'teamMembers' && visible(r));
    candidates.push({ email, originalCandidate: originals.has(email), account: account || null, records, activeCount: members.filter((r) => r.status === 'active').length, visibleMemberships: members.length, roleApprovalRequired: !members.some((r) => rolesAllowed.includes(r.role) && (r.status === 'active' || r.schemaVersion === 2)) });
  }
  return { companyId, ownerUid: owner.uid, ownerVerified: owner.emailVerified, candidates };
}
async function main(args) {
  const option = (key) => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1]; };
  const projectId = option('--project'), companyId = option('--company');
  if (!projectId || !/^[\w-]+$/.test(companyId || '')) throw new Error('Use --project PROJECT --company COMPANY [--baseline private-report.json] [--report private-output.json]. Default is dry-run. Apply with --duplicates-only or --roles approved-roles.json --owner-approved-by OWNER_UID --links private-links.json.');
  const apply = args.includes('--apply'), duplicatesOnly = args.includes('--duplicates-only');
  for (const flag of ['--report', '--links']) if (option(flag) && fs.existsSync(option(flag))) throw new Error(`${flag} output already exists; choose a new path.`);
  const baseline = option('--baseline') ? JSON.parse(fs.readFileSync(option('--baseline'), 'utf8')) : null;
  initializeApp({ projectId, credential: applicationDefault() });
  const db = getFirestore(), auth = getAuth();
  const report = await inventory(db, auth, companyId, baseline);
  const roles = option('--roles') ? JSON.parse(fs.readFileSync(option('--roles'), 'utf8')) : {};
  report.mode = apply ? 'apply' : 'dry-run';
  report.duplicateGroups = report.candidates.filter((c) => c.visibleMemberships > 1).length;
  report.originalCandidates = report.candidates.filter((c) => c.originalCandidate).length;
  report.ambiguousRoles = report.candidates.filter((c) => c.roleApprovalRequired).length;
  if (option('--report')) fs.writeFileSync(option('--report'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ mode: report.mode, candidates: report.candidates.length, originalCandidates: report.originalCandidates, duplicateGroups: report.duplicateGroups, ambiguousRoles: report.ambiguousRoles }));
  if (!apply) return;
  if (!report.ownerVerified || report.candidates.some((c) => c.activeCount > 1)) throw new Error('Verified owner and review of conflicting active memberships are required.');
  const invitees = duplicatesOnly ? [] : report.candidates.filter((c) => !c.activeCount);
  if (invitees.length && (option('--owner-approved-by') !== report.ownerUid || !option('--links') || invitees.some((c) => !rolesAllowed.includes(roles[c.email])))) throw new Error('Provide an explicit owner-approved role for every invitee and a private --links destination. Nothing changed.');
  if (!report.duplicateGroups && !invitees.length) { console.log('Membership identities already unique; no changes required.'); return; }
  const run = db.collection('rlMigrationRuns').doc();
  await run.create({ projectId, companyId, kind: 'membership-reconciliation', startedAt: new Date(), status: 'running' });
  const links = [];
  try {
    for (const candidate of report.candidates.filter((c) => c.visibleMemberships > 1)) await reconcileIdentity(db, companyId, candidate.email, report.ownerUid, run);
    for (const candidate of invitees) {
      const result = await createInvitation(db, { companyId, email: candidate.email, role: roles[candidate.email], invitedBy: report.ownerUid, appUrl: 'https://route-logistics.com', queueEmail: false });
      links.push({ email: candidate.email, role: roles[candidate.email], memberId: result.teamMemberId, inviteUrl: result.inviteUrl });
      await run.collection('invitations').doc(hash(candidate.email)).set({ memberId: result.teamMemberId, role: roles[candidate.email] });
    }
    const final = await inventory(db, auth, companyId, baseline);
    if (final.candidates.some((c) => c.visibleMemberships > 1)) throw new Error('Final uniqueness check failed; inspect the audit.');
    await run.update({ status: 'complete', completedAt: new Date() });
    console.log(`Verified membership identities. Audit: ${run.path}. No emails sent; acceptance still requires verified email.`);
  } finally {
    if (links.length) fs.writeFileSync(option('--links'), JSON.stringify(links, null, 2), { flag: 'wx', mode: 0o600 });
  }
}
if (require.main === module) main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { reconcileIdentity, inventory };
