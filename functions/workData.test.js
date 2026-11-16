const { test } = require('node:test');
const assert = require('node:assert/strict');
const { projectJob, projectCustomer } = require('./workData');
test('assigned-job projection keeps shared dispatch instructions separate from technician work notes and private/pricing fields', () => {
  const data = { companyId: 'test-company', assignedTo: 'test-technician', notes: 'Gate 2468; keep pets indoors', workNotes: 'Technician inspected the side gate', totalCost: 150, invoiceBalance: 80, privateNotes: 'PRIVATE BILLING', billingNotes: 'PRIVATE FINANCE', internalNotes: 'PRIVATE INTERNAL', description: 'PRIVATE PRICING DESCRIPTION', scopeOfWork: 'PRIVATE PRICING SCOPE', revisions: [{ price: 500 }] };
  const original = JSON.stringify(data), view = projectJob('test-job', data, 'technician');
  assert.equal(view.dispatchNotes, data.notes); assert.equal(view.workNotes, data.workNotes); assert.equal(view.notes, data.workNotes);
  for (const key of ['totalCost', 'invoiceBalance', 'privateNotes', 'billingNotes', 'internalNotes', 'description', 'scopeOfWork', 'revisions']) assert.equal(view[key], undefined);
  assert.equal(JSON.stringify(view).includes('PRIVATE'), false); assert.equal(JSON.stringify(data), original);
});
test('dispatch instructions are projected for management without expanding manager financial access', () => {
  const data = { notes: 'Gate code provided by dispatcher', workNotes: 'Technician visit log', totalCost: 150, invoiceBalance: 80, privateNotes: 'PRIVATE', billingNotes: 'PRIVATE' };
  const manager = projectJob('test-job', data, 'manager'); assert.equal(manager.dispatchNotes, data.notes); assert.equal(manager.notes, data.notes); assert.equal(manager.totalCost, 150); assert.equal(manager.invoiceBalance, undefined); assert.equal(manager.privateNotes, undefined); assert.equal(manager.billingNotes, undefined);
  for (const role of ['owner', 'admin']) { const view = projectJob('test-job', data, role); assert.equal(view.dispatchNotes, data.notes); assert.equal(view.invoiceBalance, 80); }
});
test('missing or nonscalar dispatch notes do not fall back to customer/private/work notes', () => {
  for (const notes of [undefined, null, false, 42, { privateFinancialNotes: 'PRIVATE' }]) {
    const view = projectJob('test-job', { notes, workNotes: 'Work log', privateNotes: 'PRIVATE', customerNotes: 'PRIVATE' }, 'technician');
    assert.equal(view.dispatchNotes, ''); assert.equal(view.notes, 'Work log'); assert.equal(JSON.stringify(view).includes('PRIVATE'), false);
  }
  assert.equal(projectJob('test-job', { notes: 'Dispatch instructions' }, 'technician').notes, '');
});
test('customer service instructions remain available while private customer notes and balances stay hidden', () => {
  const view = projectCustomer('test-customer', { name: 'Synthetic customer', notes: 'PRIVATE BILLING', serviceInstructions: 'Keep the gate closed', invoiceBalance: 50, history: ['PRIVATE'] }, 'technician');
  assert.equal(view.serviceInstructions, 'Keep the gate closed'); assert.equal(view.notes, undefined); assert.equal(view.invoiceBalance, undefined); assert.equal(view.history, undefined);
});
