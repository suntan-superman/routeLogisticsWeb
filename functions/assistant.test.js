const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PRODUCT,
  assistantHandlers,
  containsRestrictedContent,
  normalizeRemoteMessages,
  normalizeRoute,
  routeAllowed,
  sanitizeContext,
} = require('./assistant');

class FakeSnapshot {
  constructor(data) { this._data = data; this.exists = data !== undefined; }
  data() { return this._data; }
  get(field) { return this._data?.[field]; }
}

class FakeRef {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').at(-1); }
  async get() { return new FakeSnapshot(this.db.data.get(this.path)); }
  async set(value, options = {}) {
    const current = this.db.data.get(this.path) || {};
    this.db.data.set(this.path, options.merge ? { ...current, ...value } : { ...value });
  }
  async update(value) {
    const current = this.db.data.get(this.path);
    if (!current) throw new Error('missing');
    this.db.data.set(this.path, { ...current, ...value });
  }
}

class FakeCollection {
  constructor(db, name) { this.db = db; this.name = name; }
  doc(id) { return new FakeRef(this.db, `${this.name}/${id || `auto_${++this.db.sequence}`}`); }
}

class FakeDb {
  constructor() { this.data = new Map(); this.sequence = 0; }
  collection(name) { return new FakeCollection(this, name); }
  async runTransaction(run) {
    const tx = {
      get: ref => ref.get(),
      set: (ref, value, options) => ref.set(value, options),
      update: (ref, value) => ref.update(value),
    };
    return run(tx);
  }
}

function request(data = {}, overrides = {}) {
  return {
    data,
    auth: {
      uid: overrides.uid || 'owner-a',
      token: {
        email: overrides.email || 'owner@example.com', email_verified: true,
        companyId: overrides.companyId || 'company-a', role: overrides.role || 'owner', membershipId: overrides.membershipId || null,
      },
    },
  };
}

function setup(overrides = {}) {
  const db = new FakeDb();
  db.data.set('companies/company-a', { ownerId: 'owner-a' });
  db.data.set('companies/company-b', { ownerId: 'owner-b' });
  const calls = [];
  const defaultRemoteRequest = async (path, options = {}) => {
    calls.push({ path, options });
    if (path === '/chat/public/session') return { session: { id: `remote_${calls.length}` }, messages: [
      { id: 'visitor-1', role: 'visitor', text: options.body.message, createdAt: '2026-11-17T00:00:00Z' },
      { id: 'assistant-1', role: 'assistant', text: 'Verified Route Logistics guidance.', createdAt: '2026-11-17T00:00:01Z' },
    ] };
    if (path.endsWith('/request-human')) {
      const remoteSessionId = path.match(/\/session\/([^/]+)\/request-human$/)?.[1];
      return { session: {
        id: remoteSessionId, product: PRODUCT, tenantId: 'company-a', status: 'escalated',
        transferState: 'transfer_requested', routingStatus: 'queued_no_agent_available',
        availabilityOutcome: 'no_available_agent',
      }, messages: [] };
    }
    if (options.method === 'POST') return { messages: [{ id: `assistant-${calls.length}`, role: 'assistant', text: 'Follow-up.', createdAt: '2026-11-17T00:00:02Z' }] };
    return { messages: [] };
  };
  const remoteRequest = overrides.remoteRequest || defaultRemoteRequest;
  return { db, calls, defaultRemoteRequest, handlers: assistantHandlers(db, { remoteRequest, now: () => '2026-11-17T00:00:00.000Z' }) };
}

test('sanitization accepts only registered routes and server-derived capabilities', () => {
  const principal = { role: 'technician', capabilities: ['jobs.read', 'jobs.work'] };
  assert.equal(sanitizeContext({ route: 'https://evil.example', role: 'owner', capabilities: ['invoices.manage'] }, principal).route, '/');
  assert.equal(normalizeRoute('/dispatch?company=other'), '/dispatch');
  assert.equal(routeAllowed('/invoices', principal.capabilities), false);
  assert.equal(containsRestrictedContent('token=abc'), true);
});

test('remote messages are bounded and reduced to safe text fields', () => {
  const messages = normalizeRemoteMessages({ messages: Array.from({ length: 50 }, (_, index) => ({ id: `${index}`, role: 'assistant', text: `<b>${index}</b>`, secret: 'no' })) });
  assert.equal(messages.length, 40);
  assert.deepEqual(Object.keys(messages[0]).sort(), ['createdAt', 'id', 'role', 'text']);
});

test('message creation attributes Route Logistics and ignores forged role/company context', async () => {
  const { calls, handlers } = setup();
  const result = await handlers.handle(request({ action: 'message', message: 'How do I create an inquiry?', route: '/customers', role: 'technician', companyId: 'company-b' }));
  assert.ok(result.sessionId);
  assert.equal(calls[0].options.body.product, PRODUCT);
  assert.equal(calls[0].options.body.tenantId, 'company-a');
  assert.equal(calls[0].options.body.role, 'owner');
  assert.equal(calls[0].options.body.sourceApp, 'route_logistics_web');
});

test('message operation identity acknowledges stable upstream ids and replays without a second persistence request', async () => {
  const { calls, handlers } = setup();
  const payload = { action: 'message', message: 'How do I create an inquiry?', route: '/customers', clientMessageId: 'client-message-0001' };
  const first = await handlers.handle(request(payload));
  const replay = await handlers.handle(request(payload));
  assert.deepEqual(first.acknowledgment, {
    clientMessageId: 'client-message-0001',
    visitorMessageId: 'visitor-1',
    assistantMessageId: 'assistant-1',
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.sessionId, first.sessionId);
  assert.equal(calls.filter(call => call.path === '/chat/public/session' && call.options.method === 'POST').length, 1);
});

test('message identity cannot be reused for different text and distinct identical questions remain distinct', async () => {
  const { calls, handlers } = setup();
  await handlers.handle(request({ action: 'message', message: 'Same question', clientMessageId: 'client-message-0001' }));
  await assert.rejects(
    handlers.handle(request({ action: 'message', message: 'Different question', clientMessageId: 'client-message-0001' })),
    error => error.code === 'invalid-argument',
  );
  await handlers.handle(request({ action: 'message', message: 'Same question', clientMessageId: 'client-message-0002' }));
  assert.equal(calls.filter(call => call.path === '/chat/public/session' && call.options.method === 'POST').length, 2);
});

test('history returns correlation acknowledgments for page refresh reconciliation', async () => {
  const { handlers } = setup();
  const created = await handlers.handle(request({ action: 'message', message: 'Refresh-safe question', clientMessageId: 'client-message-0001' }));
  const history = await handlers.handle(request({ action: 'history', sessionId: created.sessionId }));
  assert.equal(history.acknowledgments.length, 1);
  assert.equal(history.acknowledgments[0].clientMessageId, 'client-message-0001');
});

test('history repairs missing local handoff correlation from a persisted same-tenant support session', async () => {
  const remoteRequest = async path => {
    if (path === '/chat/public/session') return { session: { id: 'remote-history-repair' }, messages: [] };
    if (path.endsWith('/messages')) return { session: {
      id: 'remote-history-repair', product: PRODUCT, tenantId: 'company-a',
      transferState: 'transfer_requested', routingStatus: 'queued_no_agent_available',
      availabilityOutcome: 'no_available_agent',
    }, messages: [] };
    return { messages: [] };
  };
  const { db, handlers } = setup({ remoteRequest });
  const created = await handlers.handle(request({ action: 'message', message: 'Refresh-safe support request' }));
  const key = `rlAssistantSessions/${created.sessionId}`;
  db.data.set(key, { ...db.data.get(key), escalationState: 'requested' });
  const history = await handlers.handle(request({ action: 'history', sessionId: created.sessionId }));
  assert.equal(history.escalationState, 'requested');
  assert.equal(history.supportSessionId, 'remote-history-repair');
  assert.equal(history.supportStatus, 'waiting_for_agent');
  assert.equal(db.data.get(key).supportSessionId, 'remote-history-repair');
});

test('history refresh follows authoritative support lifecycle and keeps closed transcript readable', async () => {
  let remoteSessionCount = 0;
  let remoteState = {
    session: {
      id: 'remote-lifecycle', product: PRODUCT, tenantId: 'company-a',
      status: 'escalated', transferState: 'transfer_requested', routingStatus: 'queued_no_agent_available',
    },
    messages: [{ id: 'visitor-request', role: 'visitor', text: 'Please help', createdAt: '2026-11-17T00:00:01Z' }],
  };
  const remoteRequest = async (path) => {
    if (path === '/chat/public/session') {
      remoteSessionCount += 1;
      return { session: { id: remoteSessionCount === 1 ? 'remote-lifecycle' : `remote-lifecycle-${remoteSessionCount}` }, messages: [] };
    }
    if (path.endsWith('/request-human')) {
      const remoteId = path.match(/\/session\/([^/]+)\/request-human$/)?.[1];
      if (remoteId !== 'remote-lifecycle') return { session: {
        id: remoteId, product: PRODUCT, tenantId: 'company-a', status: 'escalated',
        transferState: 'transfer_requested', routingStatus: 'queued_no_agent_available',
      }, messages: [] };
      return remoteState;
    }
    if (path.endsWith('/messages')) return remoteState;
    return { messages: [] };
  };
  const { handlers } = setup({ remoteRequest });
  const created = await handlers.handle(request({ action: 'message', message: 'Need a person' }));
  await handlers.handle(request({
    action: 'escalate', sessionId: created.sessionId, operationId: 'lifecycle-operation-1',
    contactName: 'Owner User', contactEmail: 'owner@example.com', summary: 'Synthetic test', details: 'Lifecycle test.',
  }));

  let history = await handlers.handle(request({ action: 'history', sessionId: created.sessionId }));
  assert.equal(history.supportStatus, 'waiting_for_agent');
  assert.equal(history.escalationState, 'requested');

  remoteState = {
    session: { ...remoteState.session, status: 'active_human', transferState: 'human_takeover', routingStatus: 'assigned' },
    messages: remoteState.messages,
  };
  history = await handlers.handle(request({ action: 'history', sessionId: created.sessionId }));
  assert.equal(history.supportStatus, 'assigned_to_support');

  remoteState = {
    session: remoteState.session,
    messages: [...remoteState.messages, { id: 'agent-reply', role: 'agent', text: 'I am here to help', createdAt: '2026-11-17T00:00:02Z' }],
  };
  history = await handlers.handle(request({ action: 'history', sessionId: created.sessionId }));
  assert.equal(history.supportStatus, 'human_conversation_active');
  assert.equal(history.messages.at(-1).text, 'I am here to help');

  remoteState = {
    session: { ...remoteState.session, status: 'closed', transferState: 'closed', routingStatus: 'closed' },
    messages: [...remoteState.messages, { id: 'visitor-final', role: 'visitor', text: 'Thanks', createdAt: '2026-11-17T00:00:03Z' }],
  };
  history = await handlers.handle(request({ action: 'history', sessionId: created.sessionId }));
  assert.equal(history.supportStatus, 'closed');
  assert.equal(history.escalationState, 'closed');
  assert.equal(history.supportSessionId, 'remote-lifecycle');
  assert.deepEqual(history.messages.map(message => message.id), ['visitor-request', 'agent-reply', 'visitor-final']);
  const nextRequest = await handlers.handle(request({
    action: 'escalate', sessionId: created.sessionId, operationId: 'lifecycle-operation-2',
    contactName: 'Owner User', contactEmail: 'owner@example.com', summary: 'New request', details: 'Follow-up.',
  }));
  assert.equal(nextRequest.persisted, true);
  assert.notEqual(nextRequest.sessionId, created.sessionId);
  assert.notEqual(nextRequest.supportSessionId, 'remote-lifecycle');
});

test('a conversation cannot be read or written from another tenant', async () => {
  const { db, handlers } = setup();
  const created = await handlers.handle(request({ action: 'message', message: 'Help', route: '/' }));
  db.data.set('teamMembers/member-b', { uid: 'user-b', companyId: 'company-b', status: 'active', role: 'manager' });
  await assert.rejects(
    handlers.handle(request({ action: 'history', sessionId: created.sessionId }, { uid: 'user-b', email: 'b@example.com', companyId: 'company-b', role: 'manager', membershipId: 'member-b' })),
    error => error.code === 'permission-denied',
  );
});

test('revoked or missing membership is rejected even when the client forges claims', async () => {
  const { handlers } = setup();
  await assert.rejects(
    handlers.handle(request({ action: 'status' }, { uid: 'former-user', email: 'former@example.com', companyId: 'company-a', role: 'manager', membershipId: 'missing' })),
    error => error.code === 'permission-denied',
  );
});

test('support escalation is idempotent and includes only explicit support metadata', async () => {
  const { calls, handlers } = setup();
  const created = await handlers.handle(request({ action: 'message', message: 'I need help', route: '/dispatch' }));
  const payload = {
    action: 'escalate', sessionId: created.sessionId, operationId: 'operation-1', contactName: 'Owner User',
    contactEmail: 'owner@example.com', summary: 'Synthetic UI issue', details: 'The control did not respond.', route: '/dispatch',
  };
  const first = await handlers.handle(request(payload));
  const second = await handlers.handle(request(payload));
  assert.equal(first.escalated, true);
  assert.equal(first.persisted, true);
  assert.equal(first.supportSessionId, 'remote_1');
  assert.equal(first.supportStatus, 'waiting_for_agent');
  assert.match(first.acknowledgment, /received by Workside Support/);
  assert.equal(second.idempotent, true);
  assert.equal(second.persisted, true);
  assert.equal(second.supportSessionId, first.supportSessionId);
  assert.equal(calls.filter(call => call.path.endsWith('/request-human')).length, 1);
  const body = calls.find(call => call.path.endsWith('/request-human')).options.body;
  assert.match(body.message, /Page: \/dispatch/);
  assert.equal(body.product, PRODUCT);
  assert.equal(body.tenantId, 'company-a');
  const history = await handlers.handle(request({ action: 'history', sessionId: created.sessionId }));
  assert.equal(history.escalationState, 'requested');
  assert.equal(history.supportSessionId, first.supportSessionId);
});

test('a 2xx response without a persisted same-product same-tenant support session is not acknowledged', async () => {
  const { db, handlers } = setup({ remoteRequest: async (path, options = {}) => {
    if (path === '/chat/public/session') return { session: { id: 'remote-unconfirmed' }, messages: [] };
    if (path.endsWith('/request-human')) return { ok: true, session: { status: 'escalated' }, messages: [] };
    return { messages: [] };
  } });
  const created = await handlers.handle(request({ action: 'message', message: 'Need support', route: '/dispatch' }));
  await assert.rejects(handlers.handle(request({
    action: 'escalate', sessionId: created.sessionId, operationId: 'operation-unconfirmed',
    contactName: 'Owner User', contactEmail: 'owner@example.com', summary: 'Synthetic handoff', details: 'Test persistence confirmation.',
  })), error => error.code === 'unavailable');
  const stored = db.data.get(`rlAssistantSessions/${created.sessionId}`);
  assert.equal(stored.escalationState, 'failed');
  assert.equal(stored.supportSessionId, undefined);
});

test('a support session for a different product or tenant is rejected', async () => {
  const { handlers } = setup({ remoteRequest: async (path, options = {}) => {
    if (path === '/chat/public/session') return { session: { id: 'remote-mismatch' }, messages: [] };
    if (path.endsWith('/request-human')) return { session: {
      id: 'support-other-tenant', product: PRODUCT, tenantId: 'company-b', transferState: 'transfer_requested',
    }, messages: [] };
    return { messages: [] };
  } });
  const created = await handlers.handle(request({ action: 'message', message: 'Need support', route: '/dispatch' }));
  await assert.rejects(handlers.handle(request({
    action: 'escalate', sessionId: created.sessionId, operationId: 'operation-tenant-mismatch',
    contactName: 'Owner User', contactEmail: 'owner@example.com', summary: 'Synthetic handoff', details: 'Test tenant isolation.',
  })), error => error.code === 'unavailable');
});

test('invalid provider responses fail safely without persisting a local session', async () => {
  const { db, handlers } = setup({ remoteRequest: async () => ({ session: {}, messages: [] }) });
  await assert.rejects(
    handlers.handle(request({ action: 'message', message: 'Help with scheduling', route: '/jobs' })),
    error => error.code === 'unavailable',
  );
  assert.equal([...db.data.keys()].some(key => key.startsWith('rlAssistantSessions/')), false);
});

test('a failed support handoff remains retryable and does not duplicate a successful handoff', async () => {
  let handoffAttempts = 0;
  const calls = [];
  const remoteRequest = async (path, options = {}) => {
    calls.push({ path, options });
    if (path === '/chat/public/session') {
      return { session: { id: 'remote-retry' }, messages: [{ id: 'a', role: 'assistant', text: 'Ready.', createdAt: '2026-11-17T00:00:00Z' }] };
    }
    if (path.endsWith('/request-human')) {
      handoffAttempts += 1;
      if (handoffAttempts === 1) {
        const error = new Error('temporary outage');
        error.status = 503;
        throw error;
      }
      return { session: {
        id: 'remote-retry', product: PRODUCT, tenantId: 'company-a', status: 'escalated',
        transferState: 'transfer_requested', routingStatus: 'queued_no_agent_available',
        availabilityOutcome: 'no_available_agent',
      }, messages: [] };
    }
    return { messages: [] };
  };
  const { handlers } = setup({ remoteRequest });
  const created = await handlers.handle(request({ action: 'message', message: 'I need help', route: '/dispatch' }));
  const payload = {
    action: 'escalate', sessionId: created.sessionId, operationId: 'operation-retry', contactName: 'Owner User',
    contactEmail: 'owner@example.com', summary: 'Synthetic UI issue', details: 'The control did not respond.', route: '/dispatch',
  };
  await assert.rejects(handlers.handle(request(payload)), error => error.code === 'unavailable');
  const retried = await handlers.handle(request(payload));
  const repeated = await handlers.handle(request(payload));
  assert.equal(retried.escalated, true);
  assert.equal(retried.supportSessionId, 'remote-retry');
  assert.equal(repeated.idempotent, true);
  assert.equal(repeated.supportSessionId, 'remote-retry');
  assert.equal(handoffAttempts, 2);
});

test('the server kill switch disables provider messages while keeping deterministic fallback available', async () => {
  const previous = process.env.RL_AI_ASSISTANT_ENABLED;
  process.env.RL_AI_ASSISTANT_ENABLED = 'false';
  try {
    const { calls, handlers } = setup();
    const result = await handlers.handle(request({ action: 'message', message: 'Help with this page', route: '/customers' }));
    assert.deepEqual(result, { disabled: true, fallback: true, knowledgeVersion: '2026-11-17.2' });
    assert.equal(calls.length, 0);
  } finally {
    if (previous === undefined) delete process.env.RL_AI_ASSISTANT_ENABLED;
    else process.env.RL_AI_ASSISTANT_ENABLED = previous;
  }
});
