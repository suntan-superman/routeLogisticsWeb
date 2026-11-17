const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const widget = fs.readFileSync(path.join(root, 'routeLogisticsWeb/src/features/assistant/RouteLogisticsAssistant.jsx'), 'utf8');
const layout = fs.readFileSync(path.join(root, 'routeLogisticsWeb/src/components/Layout.jsx'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'routeLogisticsWeb/src/contexts/AuthContext.jsx'), 'utf8');

test('authenticated layout contains the persistent assistant launcher', () => {
  assert.match(layout, /<RouteLogisticsAssistant \/>/);
  assert.match(widget, /aria-label="Route Logistics Assistant"/);
  assert.match(widget, /Help with this page/);
  assert.match(widget, /Report problem/);
  assert.match(widget, /New/);
});

test('widget has responsive, keyboard, loading, error and retry behavior', () => {
  assert.match(widget, /event\.key === 'Escape'/);
  assert.match(widget, /sm:h-\[min\(720px/);
  assert.match(widget, /role="status"/);
  assert.match(widget, /role="alert"/);
  assert.match(widget, />Retry</);
});

test('widget uses correlation ids and a synchronous submission guard for optimistic reconciliation', () => {
  assert.match(widget, /createClientMessageId\(\)/);
  assert.match(widget, /submissionRef\.current/);
  assert.match(widget, /reconcileAssistantMessages/);
  assert.match(widget, /clientMessageId: attempt\.clientMessageId/);
  assert.doesNotMatch(widget, /message\.role.*message\.text.*dedup|consecutive identical/i);
});

test('support form captures the required sanitized problem fields', () => {
  for (const field of ['taskAttempted', 'expectedResult', 'actualResult', 'errorMessage']) assert.match(widget, new RegExp(`name="${field}"`));
  assert.match(widget, /Do not include customer details, passwords, payment information, private notes, or photos/);
});

test('logout clears user-specific assistant state', () => {
  assert.match(auth, /startsWith\('rl-assistant:'\)/);
});

test('assistant never renders model-provided HTML or arbitrary links', () => {
  assert.doesNotMatch(widget, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(widget, /window\.location\s*=/);
  assert.match(widget, /authorizedActions\(\[action\.id\]/);
});
