import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRouteLogisticsSupport } from '../scripts/assistant/routeLogisticsKnowledgeBase.js';

test('generated assistant guides authorized staff to the portal invitation control', () => {
  const result = resolveRouteLogisticsSupport('Where do I find customer portal access?', {
    role: 'manager', capabilities: ['customers.manage'], route: '/customers',
  });
  assert.equal(result.answerAuthority.knowledgeId, 'PORTAL-01');
  assert.match(result.reply, /eye icon.*Customer Details/);
  assert.match(result.reply, /Email portal invitation/);
});

test('generated assistant separates customer connection from staff invitation', () => {
  const result = resolveRouteLogisticsSupport('How does a customer connect a provider?', {
    role: 'manager', capabilities: ['customers.manage'], route: '/customers',
  });
  assert.equal(result.answerAuthority.knowledgeId, 'PORTAL-02');
  assert.match(result.reply, /single-use provider invitation/);
  assert.match(result.reply, /email code/);
});

test('generated assistant does not offer staff portal invitations without authorization', () => {
  const result = resolveRouteLogisticsSupport('How do I invite a customer to the portal?', {
    role: 'technician', capabilities: ['customers.read'], route: '/customers',
  });
  assert.equal(result.answerAuthority.knowledgeId, 'PORTAL-01');
  assert.match(result.reply, /cannot email customer portal invitations/);
});
