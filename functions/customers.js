const { HttpsError } = require('firebase-functions/v2/https');
const { requireAuth, requireManager, rateLimit, hash, normalizeEmail, validEmail } = require('./security');
const FIELDS = ['name', 'email', 'phone', 'address', 'city', 'state', 'zipCode', 'notes'];
function cleanCustomer(row) {
  if (!row || typeof row !== 'object') throw new HttpsError('invalid-argument', 'Invalid customer row.');
  const data = Object.fromEntries(FIELDS.map((key) => [key, String(row[key] || '').trim()]));
  data.email = normalizeEmail(data.email);
  if (!data.name || data.name.length > 200 || (data.email && !validEmail(data.email)) || FIELDS.some((key) => data[key].length > (key === 'notes' ? 4000 : 500))) throw new HttpsError('invalid-argument', 'A customer name or email is invalid, or a field is too long.');
  return { ...data, emailNormalized: data.email };
}
function customerHandlers(db) {
  return {
    bulkImportCustomers: async (request) => {
      const { uid, token } = requireAuth(request);
      const scope = token.companyId ? { companyId: token.companyId } : { userId: uid };
      await requireManager(db, request, { userId: uid, ...scope });
      await rateLimit(db, 'customer-import', uid, 60);
      if (!Array.isArray(request.data?.customers) || !request.data.customers.length || request.data.customers.length > 100) throw new HttpsError('invalid-argument', 'Import between 1 and 100 customers per batch.');
      const rows = request.data.customers.map(cleanCustomer);
      let created = 0, skipped = 0;
      for (const row of rows) {
        const identity = row.email || [row.name, row.phone, row.address].join('|').toLowerCase();
        const id = `rl_import_${hash(`${Object.values(scope)[0]}:${identity}`)}`;
        const added = await db.runTransaction(async (tx) => {
          const ref = db.collection('customers').doc(id);
          const old = await tx.get(ref);
          if (old.exists) return false;
          if (row.email) {
            const existing = await tx.get(db.collection('customers').where(Object.keys(scope)[0], '==', Object.values(scope)[0]).where('email', '==', row.email).limit(1));
            if (!existing.empty) return false;
          }
          tx.create(ref, { ...row, userId: uid, ...scope, isActive: true, totalJobs: 0, totalSpent: 0, lastServiceDate: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'rl-csv' });
          return true;
        });
        if (added) created++; else skipped++;
      }
      return { created, skipped };
    },
  };
}
module.exports = { cleanCustomer, customerHandlers };
