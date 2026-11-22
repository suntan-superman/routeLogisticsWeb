const { HttpsError } = require('firebase-functions/v2/https');
const { accessScope } = require('./access');
const { propertiesFor, normalized } = require('./shared/customerLifecycle');

const DAY = 86400000;
const at = value => value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value || '');
const addressKey = property => {
  // A legacy primary address may also be saved as a newer property record.
  // Count the physical address once within this provider, including its unit.
  const address = normalized(String(property.address || '').replace(/\b(\d{5})-\d{4}\b/g, '$1').replace(/\b(?:usa|united states)\s*$/i, ''))
    .replace(/\b(st|street)\b/g, 'street').replace(/\b(rd|road)\b/g, 'road').replace(/\b(ave|avenue)\b/g, 'avenue').replace(/\b(dr|drive)\b/g, 'drive').replace(/\b(ln|lane)\b/g, 'lane');
  return address ? `${address}|${normalized(property.unit)}` : '';
};
const deleted = row => !!row.deletedAt || ['deleted'].includes(row.status);
const lifecycle = row => {
  if (row.isActive === false || ['inactive', 'archived'].includes(row.status) || row.lifecycle === 'inactive') return 'inactive';
  if (row.lifecycle === 'prospect') return 'prospect';
  if (row.lifecycle === 'active' || row.isActive === true || row.status === 'active') return 'active';
  return 'unclassified';
};
function summarizeCompany(customers, members, jobs, now = Date.now()) {
  const retained = customers.filter(row => !deleted(row));
  const identities = new Set(retained.map(row => row.id));
  const physical = new Set();
  let propertyRecords = 0, multiPropertyCustomers = 0, maxPropertiesPerCustomer = 0;
  const propertyDistribution = { none: 0, one: 0, two: 0, threeOrMore: 0 };
  const classes = { active: 0, inactive: 0, prospect: 0, unclassified: 0 };
  for (const customer of retained) {
    classes[lifecycle(customer)]++;
    const keys = new Set(propertiesFor(customer).map(addressKey).filter(Boolean));
    propertyRecords += keys.size;
    propertyDistribution[keys.size === 0 ? 'none' : keys.size === 1 ? 'one' : keys.size === 2 ? 'two' : 'threeOrMore']++;
    keys.forEach(key => physical.add(key));
    if (keys.size > 1) multiPropertyCustomers++;
    maxPropertiesPerCustomer = Math.max(maxPropertiesPerCustomer, keys.size);
  }
  const recentCustomers = new Set(), monthlyVisits = {};
  const earliestTrendMonth = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - 11, 1)).toISOString().slice(0, 7);
  let completedVisits30Days = 0;
  const start30 = now - 30 * DAY, start90 = now - 90 * DAY;
  for (const job of jobs) {
    if (deleted(job) || job.status !== 'completed' || job.appointmentKind === 'estimate_visit') continue;
    const completed = at(job.completedAt);
    if (!Number.isFinite(completed) || completed > now) continue;
    if (completed >= start30) completedVisits30Days++;
    if (completed >= start90 && identities.has(job.customerId)) recentCustomers.add(job.customerId);
    const month = new Date(completed).toISOString().slice(0, 7);
    if (month >= earliestTrendMonth) monthlyVisits[month] = (monthlyVisits[month] || 0) + 1;
  }
  return {
    totalCustomers: retained.length, activeCustomers: classes.active, inactiveCustomers: classes.inactive,
    prospectCustomers: classes.prospect, unclassifiedCustomers: classes.unclassified,
    servicedCustomers90Days: recentCustomers.size, distinctServiceProperties: physical.size,
    providerPropertyRecords: propertyRecords, multiPropertyCustomers, propertyDistribution,
    averagePropertiesPerCustomer: retained.length ? Number((propertyRecords / retained.length).toFixed(2)) : 0,
    maxPropertiesPerCustomer, activeTechnicians: new Set(members.filter(row => row.status === 'active' && row.role === 'technician' && row.uid).map(row => row.uid)).size,
    completedVisits30Days, monthlyVisits,
  };
}
const fields = {
  customers: ['companyId', 'lifecycle', 'isActive', 'status', 'deletedAt', 'serviceProperties', 'primaryPropertyId', 'address', 'city', 'state', 'zipCode', 'postalCode'],
  teamMembers: ['companyId', 'status', 'role', 'uid'],
  jobs: ['companyId', 'status', 'appointmentKind', 'completedAt', 'customerId', 'deletedAt'],
};
async function companyRows(db, companyId) {
  const query = collection => db.collection(collection).where('companyId', '==', companyId).select(...fields[collection]).get();
  const [customers, members, jobs] = await Promise.all([query('customers'), query('teamMembers'), db.collection('jobs').where('companyId', '==', companyId).where('status', '==', 'completed').select(...fields.jobs).get()]);
  return [customers, members, jobs].map(snapshot => snapshot.docs.map(row => ({ id: row.id, ...row.data() })));
}
function companyUsageHandler(db, requireAdmin, clock = () => Date.now()) {
  return async request => {
    const action = request.data?.action;
    if (action === 'company') {
      const scope = await accessScope(db, request);
      if (!scope.companyId || !['owner', 'admin'].includes(scope.role)) throw new HttpsError('permission-denied', 'Company owner or administrator access required.');
      return { companyId: scope.companyId, metrics: summarizeCompany(...await companyRows(db, scope.companyId), clock()), calculatedAt: new Date(clock()).toISOString() };
    }
    await requireAdmin(request);
    if (action === 'detail') {
      const id = request.data?.companyId;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new HttpsError('invalid-argument', 'Choose a valid company.');
      const company = await db.doc(`companies/${id}`).get();
      if (!company.exists) throw new HttpsError('not-found', 'Company not found.');
      return { company: { id, name: company.get('businessName') || company.get('name') || 'Unnamed company' }, metrics: summarizeCompany(...await companyRows(db, id), clock()), calculatedAt: new Date(clock()).toISOString() };
    }
    if (action !== 'platform') throw new HttpsError('invalid-argument', 'Choose a usage view.');
    // Explicit, on-demand snapshot; no scheduled scans or customer-level data in the response.
    const companies = await db.collection('companies').select('name', 'businessName', 'deletedAt', 'status').get();
    const items = [];
    for (const company of companies.docs) {
      if (company.get('deletedAt') || company.get('status') === 'deleted') continue;
      items.push({ company: { id: company.id, name: company.get('businessName') || company.get('name') || 'Unnamed company' }, metrics: summarizeCompany(...await companyRows(db, company.id), clock()) });
    }
    const totals = Object.fromEntries(['totalCustomers','activeCustomers','inactiveCustomers','prospectCustomers','unclassifiedCustomers','servicedCustomers90Days','distinctServiceProperties','providerPropertyRecords','multiPropertyCustomers','activeTechnicians','completedVisits30Days'].map(key => [key, items.reduce((sum, item) => sum + item.metrics[key], 0)]));
    totals.averagePropertiesPerCustomer = totals.totalCustomers ? Number((totals.providerPropertyRecords / totals.totalCustomers).toFixed(2)) : 0;
    totals.maxPropertiesPerCustomer = Math.max(0, ...items.map(item => item.metrics.maxPropertiesPerCustomer));
    totals.propertyDistribution = Object.fromEntries(['none','one','two','threeOrMore'].map(key => [key, items.reduce((sum, item) => sum + item.metrics.propertyDistribution[key], 0)]));
    return { items, totals, calculatedAt: new Date(clock()).toISOString() };
  };
}
module.exports = { summarizeCompany, companyUsageHandler, addressKey };
