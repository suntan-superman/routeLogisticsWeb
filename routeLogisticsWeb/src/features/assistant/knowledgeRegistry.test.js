import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionIsAuthorized,
  assistantActions,
  containsSensitiveQuestion,
  deterministicHelp,
  pageKnowledge,
  portalGuidanceProcedure,
  validateRegistry,
} from './knowledgeRegistry.js';

const capabilities = new Set();
const context = role => ({ role, pathname: '/', workspaceReady: true, can: capability => capabilities.has(capability) });

test('assistant knowledge registry references only verified routes and actions', () => {
  assert.deepEqual(validateRegistry(), []);
  assert.equal(actionIsAuthorized({ ...assistantActions.customers, route: 'https://evil.example' }, () => true, true), false);
});

test('new inquiry guidance points authorized managers to Customers', () => {
  capabilities.clear(); capabilities.add('customers.read'); capabilities.add('customers.manage');
  const result = deterministicHelp('How do I create a request for an estimate for a new or prospective customer?', context('manager'));
  assert.equal(result.knowledgeId, 'customer-intake');
  assert.match(result.text, /New Inquiry/);
  assert.match(result.text, /Create inquiry for a new prospect/);
  assert.match(result.text, /Schedule Estimate/);
  assert.match(result.text, /remains a prospect until conversion is appropriate/);
  assert.doesNotMatch(result.text, /Open Estimates or the assigned estimate visit/);
  assert.deepEqual(result.actions.map(action => action.id), ['customers']);
});

test('customer portal guidance follows Customer Details and invitation-only linking', () => {
  capabilities.clear(); capabilities.add('customers.manage');
  const question = 'Where do I find customer portal access and email a customer invitation?';
  assert.equal(portalGuidanceProcedure(question), 'PORTAL-01');
  const staff = deterministicHelp(question, context('manager'));
  assert.equal(staff.verifiedProcedureId, 'PORTAL-01');
  assert.match(staff.text, /eye icon.*Customer Details/i);
  assert.match(staff.text, /Email portal invitation/);
  assert.deepEqual(staff.actions.map(action => action.id), ['customers']);
  const customer = deterministicHelp('How does a customer accept a provider invitation and connect in the customer portal?', context('manager'));
  assert.equal(customer.verifiedProcedureId, 'PORTAL-02');
  assert.match(customer.text, /email code/);
  assert.match(customer.text, /Matching an email or phone number alone does not grant provider access/);
});

test('technicians receive a portal invitation permission boundary', () => {
  capabilities.clear(); capabilities.add('customers.read');
  const result = deterministicHelp('How can I invite a customer to the portal?', context('technician'));
  assert.equal(result.verifiedProcedureId, 'PORTAL-01');
  assert.match(result.text, /cannot email customer portal invitations/);
  assert.deepEqual(result.actions, []);
});

test('estimate guidance covers visit, management review, approval and approved work', () => {
  capabilities.clear(); capabilities.add('estimates.manage'); capabilities.add('customers.read');
  const result = deterministicHelp('How does management review and approve an estimate before scheduling approved work?', context('manager'));
  assert.match(result.text, /exact version/i);
  assert.match(result.text, /estimate conversion workflow/i);
});

test('approved estimate scheduling uses conversion first and assigns a technician afterward', () => {
  capabilities.clear(); capabilities.add('estimates.manage'); capabilities.add('customers.manage'); capabilities.add('jobs.schedule');
  const result = deterministicHelp('How do I schedule work after a customer approves an estimate?', context('manager'));
  assert.equal(result.knowledgeId, 'approved-estimate-scheduling');
  assert.match(result.text, /Approved — scheduling needed/);
  assert.match(result.text, /Convert approved estimate to job/);
  assert.match(result.text, /unassigned job linked to the immutable approved estimate/);
  assert.match(result.text, /Technician selection is not currently part of the conversion dialog/);
  assert.doesNotMatch(result.text, /create or edit an appointment/i);
  assert.deepEqual(result.actions.map(action => action.id), ['estimates']);
});

test('technician invoice question explains the restriction without an invoice action', () => {
  capabilities.clear(); capabilities.add('jobs.work');
  const result = deterministicHelp('How do I generate an invoice?', context('technician'));
  assert.match(result.text, /does not have invoice access/i);
  assert.equal(result.actions.length, 0);
});

test('offline work and job reassignment guidance remains technician-safe', () => {
  capabilities.clear(); capabilities.add('jobs.work'); capabilities.add('routes.read');
  const result = deterministicHelp('My offline work notes need to sync and I need reassignment', context('technician'));
  assert.match(result.text, /remain on the device until synchronization is confirmed/i);
  assert.ok(result.actions.every(action => ['myWork', 'routes'].includes(action.id)));
});

test('page help resolves Dispatch to scheduling and exception guidance', () => {
  capabilities.clear(); capabilities.add('dispatch.manage'); capabilities.add('jobs.schedule');
  const entry = pageKnowledge('/dispatch', { ...context('manager'), pathname: '/dispatch' });
  assert.equal(entry.id, 'scheduling-dispatch');
  assert.match(entry.description, /dispatch exceptions/i);
});

test('planned marketplace is identified as unavailable', () => {
  capabilities.clear();
  const result = deterministicHelp('Where is the public provider marketplace?', context('owner'));
  assert.match(result.text, /planned, not currently implemented/i);
  assert.equal(result.actions.length, 0);
});

test('sensitive user questions are rejected before transport', () => {
  assert.equal(containsSensitiveQuestion('My api key: secret-value'), true);
  assert.equal(containsSensitiveQuestion('Email customer@example.com about this'), true);
  assert.equal(containsSensitiveQuestion('How do I schedule an estimate?'), false);
});

test('verified fallback explains cancellation and permanent deletion without inventing actions', () => {
  capabilities.clear(); capabilities.add('jobs.schedule'); capabilities.add('jobs.cancel');
  const cancellation = deterministicHelp('How do I cancel an appointment?', context('manager'));
  assert.equal(cancellation.verifiedProcedureId, 'JSD-06');
  assert.match(cancellation.text, /retained in history/i);
  assert.match(cancellation.text, /in-progress or completed work cannot be cancelled/i);
  const deletion = deterministicHelp('How do I permanently delete a test job?', context('manager'));
  assert.equal(deletion.verifiedProcedureId, 'JSD-07');
  assert.match(deletion.text, /Permanently delete/);
});

test('verified fallback states that live card payments are disabled', () => {
  capabilities.clear(); capabilities.add('invoices.read'); capabilities.add('invoices.manage');
  const result = deterministicHelp('Can Route Logistics collect live card payments now?', context('owner'));
  assert.equal(result.verifiedProcedureId, 'BIL-06');
  assert.match(result.text, /Live payments remain disabled/);
  assert.match(result.text, /cannot enable payments/);
  assert.equal(result.actions.length, 0);
});

test('verified fallback enforces manager invoice and invitation restrictions', () => {
  capabilities.clear(); capabilities.add('jobs.schedule'); capabilities.add('company.read');
  const invoice = deterministicHelp('How do I create an invoice from a completed job?', context('manager'));
  assert.match(invoice.text, /does not have invoice access/i);
  assert.equal(invoice.actions.length, 0);
  const invitation = deterministicHelp('How does the owner invite a technician or manager?', context('manager'));
  assert.match(invitation.text, /Only the company owner/);
  assert.equal(invitation.actions.length, 0);
});
