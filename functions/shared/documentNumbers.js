const { HttpsError } = require('firebase-functions/v2/https');
const { createHash } = require('node:crypto');

function localDocumentDay(value, timeZone = 'America/Los_Angeles') {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new HttpsError('invalid-argument', 'A valid document date is required.');
  let parts;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date).map(part => [part.type, part.value]));
  } catch {
    throw new HttpsError('failed-precondition', 'The company time zone is invalid. Correct it before issuing documents.');
  }
  return `${parts.year}${parts.month}${parts.day}`;
}

async function allocateDocumentNumber(tx, db, { companyId, userId, kind, timeZone, date }) {
  if (!['E', 'I'].includes(kind)) throw new HttpsError('invalid-argument', 'Unsupported document type.');
  const tenant = companyId ? `company:${companyId}` : `solo:${userId}`;
  if (tenant.endsWith('undefined')) throw new HttpsError('failed-precondition', 'Document tenant is missing.');
  const day = localDocumentDay(date, timeZone);
  const id = createHash('sha256').update(`${tenant}:${kind}:${day}`).digest('hex');
  const ref = db.doc(`rlDocumentSequences/${id}`);
  const row = await tx.get(ref);
  const next = row.exists ? row.get('last') + 1 : 1;
  if (!Number.isSafeInteger(next) || next < 1) throw new HttpsError('failed-precondition', 'Document numbering needs review.');
  tx.set(ref, { tenant, companyId: companyId || null, kind, day, last: next, updatedAt: new Date(date) });
  return `${day}-${kind}${String(next).padStart(3, '0')}`;
}

module.exports = { localDocumentDay, allocateDocumentNumber };
