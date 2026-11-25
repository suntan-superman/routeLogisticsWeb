const { test } = require('node:test');
const assert = require('node:assert/strict');
const { projectJob, projectCustomer } = require('./workData');
const { publicJob, publicProperty, publicInvoice } = require('./portal');
const { publicSnapshot } = require('./shared/invoiceV2');
const { calculateTotals } = require('./shared/invoiceMath');
const { cleanDraft } = require('./estimates');
const { validatePatch } = require('./offline');
const { renderMessage, DEFAULT_SETTINGS } = require('./sms');
const { invoiceMessage } = require('./invoiceEmail');
const { missingCriticalAcknowledgments } = require('./shared/operationalAlerts');

test('existing private and field notes stay in their established role projections', () => {
  const job = { notes: 'Gate code 1234', workNotes: 'Internal visit note', completionNotes: 'Internal completion note', propertyAccessInstructions: 'Use the side gate', privateNotes: 'Management secret', operationalAlerts: [] };
  const technician = projectJob('job', job, 'technician');
  assert.equal(technician.dispatchNotes, job.notes);
  assert.equal(technician.workNotes, job.workNotes);
  assert.equal(technician.notes, job.workNotes); // Submitted iOS contract.
  assert.equal(technician.privateNotes, undefined);
  assert.equal(projectCustomer('customer', { notes: 'Management customer note', serviceInstructions: 'Use the side gate' }, 'technician').notes, undefined);
  assert.equal(projectCustomer('customer', { notes: 'Management customer note' }, 'manager').notes, 'Management customer note');
});

test('customer portal projections omit legacy notes, alerts, access instructions and identifiers', () => {
  const privateFields = { notes: 'PRIVATE', workNotes: 'PRIVATE', completionNotes: 'PRIVATE', dispatchNotes: 'PRIVATE', operationalAlerts: [{ title: 'PRIVATE' }], accessInstructions: 'PRIVATE', customerId: 'PRIVATE' };
  const job = publicJob('job', { ...privateFields, serviceType: 'Service', date: '2026-11-24', status: 'scheduled' });
  const property = publicProperty({ id: 'property', label: 'Home', address: 'Synthetic address', ...privateFields });
  const invoice = publicInvoice('invoice', { financialVersion: 2, status: 'issued', issuedSnapshot: { invoiceNumber: 'TEST-I001', totalCents: 5000, lineItems: [{ description: 'Service', quantity: 1, unitPriceCents: 5000, amountCents: 5000 }] }, ...privateFields });
  for (const output of [job, property, invoice]) assert.doesNotMatch(JSON.stringify(output), /PRIVATE/);
});

test('issued invoice snapshot explicitly selects customer-facing summary and terms', () => {
  const invoice = { financialVersion: 2, status: 'draft', companyId: 'company', customerName: 'Synthetic Customer', invoiceNumber: 'TEST-I001', ...calculateTotals([{ description: 'Service', quantity: 1, unitPrice: 50 }], 0), customerFacingSummary: 'Approved service summary', paymentTerms: 'Due on receipt', notes: 'PRIVATE MANAGEMENT', workNotes: 'PRIVATE TECHNICIAN', operationalAlerts: [{ title: 'PRIVATE ALERT' }] };
  const snapshot = publicSnapshot(invoice, { name: 'Synthetic Service' });
  assert.equal(snapshot.serviceSummary, 'Approved service summary');
  assert.equal(snapshot.paymentTerms, 'Due on receipt');
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE/);
  assert.doesNotMatch(invoiceMessage({ issuedSnapshot: snapshot, balanceCents: 5000 }, 'Synthetic Service', false, 'https://example.test').text, /PRIVATE/);
});

test('offline work notes cannot choose or change their audience', () => {
  assert.deepEqual(validatePatch({ notes: 'Internal work note' }), { notes: 'Internal work note' });
  for (const patch of [{ notes: 'Internal', visibility: 'customer' }, { notes: 'Internal', notesVisibility: 'customer' }, { notes: { text: 'Internal', visibility: 'customer' } }]) assert.throws(() => validatePatch(patch), { code: 'invalid-argument' });
  const draft = cleanDraft({ title: 'Synthetic', serviceType: 'Service', notes: 'Approved customer note', technicianNotes: 'PRIVATE TECHNICIAN', internalReviewNotes: 'PRIVATE MANAGEMENT', visibility: 'customer', lineItems: [{ kind: 'service', description: 'Service', quantity: 1, unitPrice: 50 }] });
  assert.equal(draft.notes, 'Approved customer note');
  assert.equal(draft.visibility, undefined);
});

test('SMS templates never interpolate private job notes or alerts', () => {
  const message = renderMessage({ name: 'Synthetic Service' }, DEFAULT_SETTINGS, { date: '2026-11-24', time: '09:00', notes: 'PRIVATE', completionNotes: 'PRIVATE', operationalAlerts: [{ title: 'PRIVATE' }] }, 'pre-visit');
  assert.doesNotMatch(message, /PRIVATE/);
});

test('jobs without critical alerts do not require an acknowledgment from submitted iOS clients', async () => {
  const missing = await missingCriticalAcknowledgments({ doc() { throw Error('Unexpected read'); } }, { get() { throw Error('Unexpected read'); } }, 'job', { operationalAlerts: [] }, 'company', 'user');
  assert.deepEqual(missing, []);
});
