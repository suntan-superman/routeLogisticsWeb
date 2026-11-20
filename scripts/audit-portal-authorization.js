// Read-only production preflight. Prints counts only; never prints customer data.
const { createRequire } = require('node:module');
const path = require('node:path');
const { createHash } = require('node:crypto');
const req = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, applicationDefault } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { getAuth } = req('firebase-admin/auth');

const PROJECT = 'mi-factotum-field-service';
const hash = value => createHash('sha256').update(value).digest('hex');

async function main() {
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROJECT) throw Error('Production project guard failed.');
  const ownerEmails = (process.env.RL_OWNER_PORTAL_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!ownerEmails.length) throw Error('Set RL_OWNER_PORTAL_EMAILS to the owner-controlled portal test inboxes.');
  const knownEmails = new Set(ownerEmails);
  const knownUids = new Set(ownerEmails.map(email => `rl_customer_${hash(email)}`));
  const app = initializeApp({ projectId: PROJECT, credential: applicationDefault() }, 'portal-authorization-audit');
  const db = getFirestore(app), auth = getAuth(app);
  const [links, invites, challenges] = await Promise.all([
    db.collection('rlPortalLinks').limit(501).get(),
    db.collection('rlPortalLinkInvites').limit(501).get(),
    db.collection('rlPortalChallenges').where('consumed', '==', true).limit(501).get(),
  ]);
  const counts = { activeLinks: 0, ownerActiveLinks: 0, unexpectedActiveLinks: 0, pendingInvites: 0, unexpectedPendingInvites: 0, consumedCodes: challenges.size, ownerConsumedCodes: 0, unexpectedConsumedCodes: 0, portalAuthUsers: 0, ownerPortalAuthUsers: 0, unexpectedPortalAuthUsers: 0, truncated: [links, invites, challenges].some(rows => rows.size === 501) };
  for (const row of links.docs) if (row.get('status') === 'active') {
    counts.activeLinks++;
    if (knownEmails.has(String(row.get('email') || '').toLowerCase())) counts.ownerActiveLinks++;
    else counts.unexpectedActiveLinks++;
  }
  for (const row of invites.docs) if (row.get('status') === 'pending' && row.get('expiresAt')?.toMillis?.() > Date.now()) {
    counts.pendingInvites++;
    if (!knownEmails.has(String(row.get('email') || '').toLowerCase())) counts.unexpectedPendingInvites++;
  }
  for (const row of challenges.docs) {
    if (knownEmails.has(String(row.get('email') || '').toLowerCase())) counts.ownerConsumedCodes++;
    else counts.unexpectedConsumedCodes++;
  }
  let nextPageToken;
  do {
    const page = await auth.listUsers(1000, nextPageToken);
    for (const user of page.users) if (user.uid.startsWith('rl_customer_')) {
      counts.portalAuthUsers++;
      if (knownUids.has(user.uid)) counts.ownerPortalAuthUsers++;
      else counts.unexpectedPortalAuthUsers++;
    }
    nextPageToken = page.pageToken;
    if (counts.portalAuthUsers > 10000) { counts.truncated = true; break; }
  } while (nextPageToken);
  console.log(JSON.stringify({ project: PROJECT, readOnly: true, counts }, null, 2));
  if (counts.truncated || counts.unexpectedActiveLinks || counts.unexpectedPendingInvites || counts.unexpectedConsumedCodes || counts.unexpectedPortalAuthUsers) process.exitCode = 2;
}

main().catch(error => { console.error(`Portal authorization audit could not complete (${error.code || 'unknown error'}).`); process.exitCode = 1; });
