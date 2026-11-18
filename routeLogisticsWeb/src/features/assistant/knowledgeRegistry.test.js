import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionIsAuthorized,
  assistantActions,
  containsSensitiveQuestion,
  deterministicHelp,
  pageKnowledge,
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
