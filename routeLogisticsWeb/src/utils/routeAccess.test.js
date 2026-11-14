import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mayOpenRoute, routeCapabilities } from './routeAccess.js';
const policy = createRequire(import.meta.url)('../../../functions/shared/capabilities.json');
test('direct URLs and navigation share explicit role capabilities', () => {
  const can = role => capability => (policy.roles[role] || []).includes(capability);
  for (const role of ['owner', 'admin', 'manager', 'technician']) {
    for (const route of ['/dispatch', '/customers', '/calendar', '/jobs', '/estimates']) assert.equal(mayOpenRoute(route, can(role)), role !== 'technician');
    for (const route of ['/invoices', '/integrations']) assert.equal(mayOpenRoute(route, can(role)), ['owner', 'admin'].includes(role));
    assert.equal(mayOpenRoute('/my-work', can(role)), true);
    assert.equal(mayOpenRoute('/routes', can(role)), true);
    assert.equal(mayOpenRoute('/reports', can(role)), role !== 'technician');
  }
  for (const path of Object.keys(routeCapabilities)) assert.equal(mayOpenRoute(path, () => false), false);
  assert.equal(mayOpenRoute('/unknown-admin-route', () => true), false);
  assert.equal(mayOpenRoute('/dispatch', can('dispatcher')), false);
});
