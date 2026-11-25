const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateAlert, alertsForJob, alertIdentity, acknowledgmentId, missingCriticalAcknowledgments } = require('./operationalAlerts');

const alert = (id, severity = 'critical', version = 1, active = true) => ({ id, title: `Alert ${id}`, description: 'Review the service property before work.', category: 'safety', severity, version, active });
const customer = { serviceProperties: [{ id: 'home', address: '100 Example St', alerts: [alert('gate'), alert('old', 'important', 1, false)] }, { id: 'shop', address: '200 Example St', alerts: [alert('other')] }] };
const job = { id: 'visit-1', companyId: 'acme', customerId: 'customer-1', servicePropertyId: 'home', status: 'scheduled', operationalAlerts: [alert('temporary', 'important')] };

test('alerts stay on their service property and future recurring jobs inherit only current active versions', () => {
  assert.deepEqual(alertsForJob(job, customer).map(row => `${row.source}:${row.id}`), ['property:gate', 'job:temporary']);
  assert.deepEqual(alertsForJob({ ...job, id: 'future-recurring', operationalAlerts: [] }, customer).map(row => row.id), ['gate']);
  assert.deepEqual(alertsForJob({ ...job, servicePropertyId: 'shop', operationalAlerts: [] }, customer).map(row => row.id), ['other']);
  const captured = alertsForJob(job, customer);
  assert.deepEqual(alertsForJob({ ...job, status: 'completed', operationalAlertSnapshot: captured }, { serviceProperties: [] }), captured);
  assert.deepEqual(alertsForJob({ ...job, status: 'completed' }, customer), []);
  assert.deepEqual(alertsForJob({ ...job, status: 'cancelled' }, customer), []);
});

test('critical edits change acknowledgment identity while unchanged visits keep it', () => {
  const first = alertsForJob(job, customer)[0], revised = { ...first, version: 2 };
  assert.equal(alertIdentity(first), 'property:gate:1');
  assert.notEqual(acknowledgmentId('acme', job.id, 'tech', first), acknowledgmentId('acme', job.id, 'tech', revised));
  assert.equal(acknowledgmentId('acme', job.id, 'tech', first), acknowledgmentId('acme', job.id, 'tech', first));
  assert.notEqual(acknowledgmentId('acme', job.id, 'tech', first), acknowledgmentId('bls', job.id, 'tech', first));
  assert.notEqual(acknowledgmentId('acme', job.id, 'tech', first), acknowledgmentId('acme', 'visit-2', 'tech', first));
});

test('validation rejects unbounded or unsafe alert contents and accepts readable multiline descriptions', () => {
  const base = { title: 'Locked gate', description: 'Check with the office.\nDo not enter without permission.', category: 'access', severity: 'critical', active: true };
  assert.equal(validateAlert(base).description, base.description);
  for (const change of [{ title: '' }, { title: 'x'.repeat(121) }, { description: '\u0000secret' }, { category: 'finance' }, { severity: 'urgent' }, { active: 'yes' }]) assert.throws(() => validateAlert({ ...base, ...change }));
});

test('server acknowledgment gate reads only tenant, job, user and alert version identity', async () => {
  const first = alertsForJob(job, customer)[0];
  const ackId = acknowledgmentId('acme', job.id, 'tech', first);
  const reads = [];
  const db = { doc(path) { return { path }; } };
  const tx = { async get(ref) { reads.push(ref.path); return ref.path === 'customers/customer-1' ? { exists: true, get: key => key === 'companyId' ? 'acme' : undefined, data: () => customer } : { exists: ref.path === `rlJobAlertAcknowledgments/${ackId}` }; } };
  assert.deepEqual(await missingCriticalAcknowledgments(db, tx, job.id, job, 'acme', 'tech'), []);
  assert.ok(reads.includes(`rlJobAlertAcknowledgments/${ackId}`));
  assert.deepEqual((await missingCriticalAcknowledgments(db, { get: async ref => ref.path === 'customers/customer-1' ? tx.get(ref) : { exists: false } }, job.id, job, 'acme', 'tech')).map(row => row.id), ['gate']);
  await assert.rejects(missingCriticalAcknowledgments(db, { get: async ref => ref.path === 'customers/customer-1' ? { exists: true, get: () => 'bls', data: () => customer } : { exists: false } }, job.id, job, 'acme', 'tech'), /not in this company/);
});
