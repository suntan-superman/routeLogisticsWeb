const { HttpsError } = require('firebase-functions/v2/https');
const { randomUUID, createHash } = require('node:crypto');
const {
  documentId,
  normalizeEmail,
  requireAuth,
  requireAccountActive,
  requireStaff,
  rateLimit,
  validEmail,
} = require('./security');
const { workspaceStatus } = require('./workspace');
const capabilityPolicy = require('./shared/capabilities.json');

const PRODUCT = 'route-logistics';
const KNOWLEDGE_VERSION = '2026-11-18.1';
const MAX_MESSAGE_LENGTH = 1_000;
const MAX_SESSION_MESSAGES = 30;
const MAX_RETURNED_MESSAGES = 40;
const ALLOWED_ROUTES = Object.freeze({
  '/': { pageCategory: 'dashboard', capability: 'jobs.read' },
  '/my-work': { pageCategory: 'technician-work', capability: 'jobs.work' },
  '/dispatch': { pageCategory: 'dispatch', capability: 'dispatch.manage' },
  '/company-setup': { pageCategory: 'company', capability: 'company.read' },
  '/customers': { pageCategory: 'customers', capability: 'customers.read' },
  '/estimate-templates': { pageCategory: 'estimates', capability: 'estimates.manage' },
  '/estimates': { pageCategory: 'estimates', capabilities: ['estimates.manage', 'estimates.prepareAssigned'] },
  '/jobs': { pageCategory: 'scheduling', capability: 'jobs.schedule' },
  '/calendar': { pageCategory: 'scheduling', capability: 'jobs.schedule' },
  '/routes': { pageCategory: 'routes', capability: 'routes.read' },
  '/team-locations': { pageCategory: 'locations', capability: 'locations.viewTeam' },
  '/service-plans': { pageCategory: 'service-plans', capability: 'plans.manage' },
  '/invoices': { pageCategory: 'invoices', capability: 'invoices.read' },
  '/reports': { pageCategory: 'reports', capability: 'reports.operations' },
  '/integrations': { pageCategory: 'integrations', capability: 'integrations.read' },
  '/notifications': { pageCategory: 'notifications', capability: 'company.read' },
  '/reviews': { pageCategory: 'reviews', capability: 'reviews.manage' },
});

function safeText(value, maxLength = MAX_MESSAGE_LENGTH) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeRoute(value) {
  const candidate = String(value || '/').split(/[?#]/, 1)[0] || '/';
  return Object.prototype.hasOwnProperty.call(ALLOWED_ROUTES, candidate) ? candidate : '/';
}

function containsRestrictedContent(value) {
  const text = String(value || '');
  return /(?:\b(?:password|passcode|api[_ -]?key|secret|token|card number|cvv)\b\s*[:=]|\b\d{13,19}\b)/i.test(text);
}

function capabilitiesForRole(role) {
  return [...(capabilityPolicy.roles[role] || [])];
}

function routeAllowed(route, capabilities) {
  const config = ALLOWED_ROUTES[route];
  if (!config) return false;
  const required = config.capabilities || [config.capability];
  return required.some((capability) => capabilities.includes(capability));
}

function sanitizeContext(data, principal) {
  const route = normalizeRoute(data?.route);
  const allowedRoute = routeAllowed(route, principal.capabilities) ? route : '/';
  return {
    product: PRODUCT,
    route: allowedRoute,
    pageCategory: ALLOWED_ROUTES[allowedRoute]?.pageCategory || 'dashboard',
    role: principal.role,
    capabilities: principal.capabilities,
    featureAvailability: Object.entries(ALLOWED_ROUTES)
      .filter(([candidate]) => routeAllowed(candidate, principal.capabilities))
      .map(([candidate, config]) => `${config.pageCategory}:${candidate}`)
      .slice(0, 24),
    knowledgeVersion: KNOWLEDGE_VERSION,
  };
}

function pseudonymousUserReference(uid) {
  return `rlu_${createHash('sha256').update(String(uid)).digest('hex').slice(0, 20)}`;
}

function normalizeRemoteMessage(message) {
  const role = ['visitor', 'assistant', 'agent', 'system'].includes(message?.role)
    ? message.role
    : ['visitor', 'assistant', 'agent', 'system'].includes(message?.sender)
      ? message.sender
      : 'system';
  const text = safeText(message?.text || message?.body, 2_000);
  if (!text) return null;
  return {
    id: safeText(message?.id, 200) || randomUUID(),
    role,
    text,
    createdAt: safeText(message?.createdAt, 80) || new Date().toISOString(),
  };
}

function normalizeRemoteMessages(payload) {
  return (Array.isArray(payload?.messages) ? payload.messages : [])
    .map(normalizeRemoteMessage)
    .filter(Boolean)
    .slice(-MAX_RETURNED_MESSAGES);
}

function normalizeClientMessageId(value) {
  const id = safeText(value, 100);
  return /^[A-Za-z0-9_-]{16,100}$/.test(id) ? id : '';
}

function messageAcknowledgment(clientMessageId, messages = []) {
  if (!clientMessageId) return null;
  let visitorMessageId = null, assistantMessageId = null;
  for (const message of messages) {
    if (message.role === 'visitor') visitorMessageId = message.id;
    if (message.role === 'assistant' || message.role === 'agent') assistantMessageId = message.id;
  }
  return { clientMessageId, visitorMessageId, assistantMessageId };
}

function operationDocumentId(principal, clientMessageId) {
  return createHash('sha256')
    .update(`${principal.uid}:${principal.workspaceReference}:${clientMessageId}`)
    .digest('hex');
}

function persistedSupportReceipt(payload, tenantId, messages = []) {
  const support = payload?.session || {};
  const supportSessionId = safeText(support.id || support.sessionId, 200);
  const transferState = safeText(support.transferState || support.handoff?.state, 80);
  const supportProduct = safeText(support.product, 100);
  const supportTenantId = safeText(support.tenantId, 200);
  if (!supportSessionId || supportProduct !== PRODUCT || supportTenantId !== tenantId) return null;
  const isClosed = transferState === 'closed' || safeText(support.status, 80) === 'closed';
  if (isClosed) {
    return {
      supportSessionId,
      supportProduct,
      supportTenantId,
      supportTransferState: 'closed',
      supportStatus: 'closed',
      supportRoutingStatus: safeText(support.routingStatus, 80) || 'closed',
      supportAvailabilityOutcome: safeText(support.availabilityOutcome, 100) || null,
      acknowledgment: null,
    };
  }
  if (!['transfer_requested', 'human_takeover'].includes(transferState)) return null;
  const routingStatus = safeText(support.routingStatus, 80) || 'queued';
  const supportStatus = transferState === 'human_takeover'
    ? messages.some(message => message.role === 'agent') ? 'human_conversation_active' : 'assigned_to_support'
    : routingStatus === 'queued_no_agent_available' ? 'waiting_for_agent'
      : routingStatus === 'assigned' ? 'assigned_to_support' : 'received';
  const acknowledgment = supportStatus === 'waiting_for_agent'
    ? 'Your support request has been received by Workside Support and is waiting for a representative. An immediate live reply is not promised.'
    : supportStatus === 'assigned_to_support'
      ? 'Your support request has been received and assigned to a representative. An immediate live reply is not promised.'
      : 'Your support request has been received by Workside Support. An immediate live reply is not promised.';
  return {
    supportSessionId,
    supportProduct,
    supportTenantId,
    supportTransferState: transferState,
    supportStatus,
    supportRoutingStatus: routingStatus,
    supportAvailabilityOutcome: safeText(support.availabilityOutcome, 100) || null,
    acknowledgment,
  };
}

function messageFingerprint(text) {
  return createHash('sha256').update(text).digest('hex');
}

function assistantEnabled() {
  return process.env.RL_AI_ASSISTANT_ENABLED !== 'false';
}

function remoteBaseUrl() {
  return String(process.env.RL_SUPPORT_API_BASE_URL || 'https://api.merxus.ai/api').replace(/\/+$/, '');
}

async function defaultRemoteRequest(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${remoteBaseUrl()}${path}`, {
      method,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
    if (!response.ok) {
      const error = new Error(safeText(payload?.error?.message || payload?.message, 240) || 'Support service unavailable.');
      error.status = response.status;
      error.code = safeText(payload?.error?.code || payload?.code, 80);
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function publicServiceError(error) {
  console.error('Route Logistics assistant provider request failed', {
    status: Number(error?.status) || null,
    code: safeText(error?.code, 80) || null,
    name: safeText(error?.name, 80) || null,
  });
  if (error?.status === 429) throw new HttpsError('resource-exhausted', 'The assistant is busy. Please wait a moment and try again.');
  throw new HttpsError('unavailable', 'AI help is temporarily unavailable. Verified help topics and Workside Support remain available.');
}

async function resolvePrincipal(db, request) {
  const { uid, token } = requireAuth(request, true);
  await requireAccountActive(db, uid);
  const tokenCompanyId = safeText(token.companyId, 200);
  if (tokenCompanyId) {
    const staff = await requireStaff(db, request, tokenCompanyId);
    const role = staff.role;
    return {
      uid,
      role,
      companyId: tokenCompanyId,
      workspaceReference: tokenCompanyId,
      capabilities: capabilitiesForRole(role),
      verifiedEmail: normalizeEmail(token.email),
    };
  }
  const workspace = await workspaceStatus(db, {
    uid,
    email: normalizeEmail(token.email),
    emailVerified: token.email_verified === true,
  }, null);
  if (workspace.status !== 'solo') throw new HttpsError('permission-denied', 'An active Route Logistics workspace is required.');
  return {
    uid,
    role: 'owner',
    companyId: null,
    workspaceReference: `solo_${createHash('sha256').update(uid).digest('hex').slice(0, 20)}`,
    capabilities: capabilitiesForRole('owner'),
    verifiedEmail: normalizeEmail(token.email),
  };
}

function assertSessionOwner(snapshot, principal) {
  if (!snapshot.exists) throw new HttpsError('not-found', 'This assistant conversation is no longer available. Start a new conversation.');
  const session = snapshot.data();
  if (session.userId !== principal.uid || session.workspaceReference !== principal.workspaceReference || session.product !== PRODUCT) {
    throw new HttpsError('permission-denied', 'This assistant conversation belongs to another workspace.');
  }
  if (session.closedAt) throw new HttpsError('failed-precondition', 'This conversation is closed. Start a new conversation.');
  return session;
}

function remoteSessionBody({ text, context, principal, localSessionId }) {
  return {
    product: PRODUCT,
    tenantId: principal.workspaceReference,
    tenantType: 'field_service',
    source: 'authenticated_route_logistics',
    sourceApp: 'route_logistics_web',
    sourceUrl: `https://route-logistics.com${context.route}`,
    visitorId: `rl_${localSessionId}`,
    initialIntent: 'support',
    message: text,
    route: context.route,
    pageCategory: context.pageCategory,
    role: context.role,
    capabilities: context.capabilities,
    featureAvailability: context.featureAvailability,
    knowledgeVersion: context.knowledgeVersion,
    verifiedUserReference: pseudonymousUserReference(principal.uid),
    companyReference: principal.workspaceReference,
  };
}

async function incrementMessageCount(db, ref, principal) {
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const session = assertSessionOwner(snapshot, principal);
    const count = Number(session.messageCount) || 0;
    if (count >= MAX_SESSION_MESSAGES) throw new HttpsError('resource-exhausted', 'Start a new conversation to continue.');
    tx.update(ref, { messageCount: count + 1, updatedAt: new Date().toISOString() });
  });
}

function assistantHandlers(db, { remoteRequest = defaultRemoteRequest, now = () => new Date().toISOString() } = {}) {
  const collection = db.collection('rlAssistantSessions');
  const operations = db.collection('rlAssistantMessageOperations');

  async function beginMessageOperation(principal, clientMessageId, text, requestedSessionId) {
    const ref = operations.doc(operationDocumentId(principal, clientMessageId));
    const fingerprint = messageFingerprint(text);
    return db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.exists) {
        const existing = snapshot.data();
        if (existing.userId !== principal.uid || existing.workspaceReference !== principal.workspaceReference || existing.messageFingerprint !== fingerprint) {
          throw new HttpsError('invalid-argument', 'This message identity cannot be reused for different content.');
        }
        if (existing.status === 'completed') return { state: 'completed', ref, operation: existing };
        if (existing.status === 'processing') return { state: 'processing', ref, operation: existing };
      }
      tx.set(ref, {
        product: PRODUCT,
        userId: principal.uid,
        workspaceReference: principal.workspaceReference,
        clientMessageId,
        messageFingerprint: fingerprint,
        requestedSessionId: requestedSessionId || null,
        status: 'processing',
        attempts: Number(snapshot.data()?.attempts || 0) + 1,
        updatedAt: now(),
        createdAt: snapshot.data()?.createdAt || now(),
      });
      return { state: 'started', ref };
    });
  }

  async function completeMessageOperation(ref, sessionId, acknowledgment) {
    await ref.set({ status: 'completed', sessionId, acknowledgment, completedAt: now(), updatedAt: now() }, { merge: true });
  }

  async function failMessageOperation(ref, error) {
    await ref.set({
      status: 'failed',
      failureCode: safeText(error?.code || error?.name, 80) || 'unavailable',
      failedAt: now(),
      updatedAt: now(),
    }, { merge: true }).catch(() => {});
  }

  async function recordMessageAcknowledgment(ref, principal, acknowledgment) {
    if (!acknowledgment) return [];
    return db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const session = assertSessionOwner(snapshot, principal);
      const acknowledgments = (Array.isArray(session.messageAcknowledgments) ? session.messageAcknowledgments : [])
        .filter(item => item?.clientMessageId !== acknowledgment.clientMessageId)
        .concat(acknowledgment)
        .slice(-MAX_SESSION_MESSAGES);
      tx.update(ref, { messageAcknowledgments: acknowledgments, updatedAt: now() });
      return acknowledgments;
    });
  }

  async function replayCompletedOperation(operation, principal) {
    const ref = collection.doc(documentId(operation.sessionId, 'assistant session'));
    const session = assertSessionOwner(await ref.get(), principal);
    let payload;
    try { payload = await remoteRequest(`/chat/public/session/${encodeURIComponent(session.remoteSessionId)}/messages`); }
    catch (error) { return publicServiceError(error); }
    return {
      sessionId: ref.id,
      messages: normalizeRemoteMessages(payload),
      acknowledgment: operation.acknowledgment || null,
      acknowledgments: session.messageAcknowledgments || [],
      replayed: true,
      knowledgeVersion: KNOWLEDGE_VERSION,
    };
  }

  async function createRemoteSession(principal, context, text, clientMessageId) {
    const ref = collection.doc();
    let payload;
    try {
      payload = await remoteRequest('/chat/public/session', {
        method: 'POST',
        body: remoteSessionBody({ text, context, principal, localSessionId: ref.id }),
      });
    } catch (error) { return publicServiceError(error); }
    const remoteSessionId = safeText(payload?.session?.id, 200);
    if (!remoteSessionId) throw new HttpsError('unavailable', 'The support service returned an invalid session.');
    const createdAt = now();
    const messages = normalizeRemoteMessages(payload);
    const acknowledgment = messageAcknowledgment(clientMessageId, messages);
    await ref.set({
      product: PRODUCT,
      userId: principal.uid,
      verifiedUserReference: pseudonymousUserReference(principal.uid),
      companyId: principal.companyId,
      workspaceReference: principal.workspaceReference,
      role: principal.role,
      route: context.route,
      pageCategory: context.pageCategory,
      knowledgeVersion: KNOWLEDGE_VERSION,
      remoteSessionId,
      messageCount: 1,
      messageAcknowledgments: acknowledgment ? [acknowledgment] : [],
      escalationState: 'not_requested',
      createdAt,
      updatedAt: createdAt,
    });
    return { sessionId: ref.id, messages, acknowledgment };
  }

  async function sendMessage(request, principal) {
    if (!assistantEnabled()) return { disabled: true, fallback: true, knowledgeVersion: KNOWLEDGE_VERSION };
    const text = safeText(request.data?.message);
    if (!text) throw new HttpsError('invalid-argument', 'Enter a question.');
    if (String(request.data?.message || '').length > MAX_MESSAGE_LENGTH) throw new HttpsError('invalid-argument', `Questions are limited to ${MAX_MESSAGE_LENGTH} characters.`);
    if (containsRestrictedContent(text)) throw new HttpsError('invalid-argument', 'Do not include passwords, credentials, payment card details, or access tokens.');
    const context = sanitizeContext(request.data, principal);
    const sessionId = safeText(request.data?.sessionId, 200);
    const clientMessageId = normalizeClientMessageId(request.data?.clientMessageId) || randomUUID();
    const operation = await beginMessageOperation(principal, clientMessageId, text, sessionId);
    if (operation.state === 'completed') return replayCompletedOperation(operation.operation, principal);
    if (operation.state === 'processing') throw new HttpsError('aborted', 'This question is still being processed. Retry in a moment.');
    try {
      await rateLimit(db, 'assistant-message', principal.uid, 12, 60_000);
      if (!sessionId) {
        const created = await createRemoteSession(principal, context, text, clientMessageId);
        await completeMessageOperation(operation.ref, created.sessionId, created.acknowledgment);
        return {
          sessionId: created.sessionId,
          messages: created.messages,
          acknowledgment: created.acknowledgment,
          acknowledgments: created.acknowledgment ? [created.acknowledgment] : [],
          knowledgeVersion: KNOWLEDGE_VERSION,
        };
      }
      const ref = collection.doc(documentId(sessionId, 'assistant session'));
      const session = assertSessionOwner(await ref.get(), principal);
      await incrementMessageCount(db, ref, principal);
      let payload;
      payload = await remoteRequest(`/chat/public/session/${encodeURIComponent(session.remoteSessionId)}/messages`, {
        method: 'POST',
        body: {
          message: text,
          route: context.route,
          pageCategory: context.pageCategory,
          role: context.role,
          capabilities: context.capabilities,
          featureAvailability: context.featureAvailability,
          knowledgeVersion: context.knowledgeVersion,
          visitorId: `rl_${ref.id}`,
          clientMessageId,
        },
      });
      const messages = normalizeRemoteMessages(payload);
      const acknowledgment = messageAcknowledgment(clientMessageId, messages);
      const acknowledgments = await recordMessageAcknowledgment(ref, principal, acknowledgment);
      await ref.set({ route: context.route, pageCategory: context.pageCategory, updatedAt: now() }, { merge: true });
      await completeMessageOperation(operation.ref, ref.id, acknowledgment);
      return { sessionId: ref.id, messages, acknowledgment, acknowledgments, knowledgeVersion: KNOWLEDGE_VERSION };
    } catch (error) {
      await failMessageOperation(operation.ref, error);
      if (error instanceof HttpsError) throw error;
      return publicServiceError(error);
    }
  }

  async function history(request, principal) {
    const sessionId = safeText(request.data?.sessionId, 200);
    if (!sessionId) return { sessionId: null, messages: [] };
    const ref = collection.doc(documentId(sessionId, 'assistant session'));
    const session = assertSessionOwner(await ref.get(), principal);
    let payload;
    try { payload = await remoteRequest(`/chat/public/session/${encodeURIComponent(session.remoteSessionId)}/messages`); }
    catch (error) { return publicServiceError(error); }
    const messages = normalizeRemoteMessages(payload);
    const receipt = persistedSupportReceipt(payload, principal.workspaceReference, messages);
    if (receipt) {
      await ref.set({
        ...receipt,
        escalationState: receipt.supportStatus === 'closed' ? 'closed' : 'requested',
        escalatedAt: session.escalatedAt || now(),
        updatedAt: now(),
      }, { merge: true });
    }
    return {
      sessionId: ref.id,
      supportSessionId: receipt?.supportSessionId || session.supportSessionId || null,
      supportStatus: receipt?.supportStatus || session.supportStatus || null,
      messages,
      acknowledgments: session.messageAcknowledgments || [],
      escalationState: receipt?.supportStatus === 'closed' ? 'closed' : receipt || (session.escalationState === 'requested' && session.supportSessionId
        && session.supportProduct === PRODUCT && session.supportTenantId === principal.workspaceReference)
        ? 'requested'
        : session.escalationState === 'requesting' ? 'requesting' : 'not_requested',
    };
  }

  async function close(request, principal) {
    const sessionId = safeText(request.data?.sessionId, 200);
    if (!sessionId) return { closed: true };
    const ref = collection.doc(documentId(sessionId, 'assistant session'));
    const session = assertSessionOwner(await ref.get(), principal);
    try {
      await remoteRequest(`/chat/public/session/${encodeURIComponent(session.remoteSessionId)}/timeout`, {
        method: 'POST',
        body: { reason: 'visitor_ended_chat', visitorId: `rl_${ref.id}` },
      });
    } catch (error) { return publicServiceError(error); }
    await ref.set({ closedAt: now(), updatedAt: now() }, { merge: true });
    return { closed: true };
  }

  async function escalate(request, principal) {
    await rateLimit(db, 'assistant-escalation', principal.uid, 3, 60 * 60_000);
    const operationId = documentId(safeText(request.data?.operationId, 100), 'operation');
    const contactName = safeText(request.data?.contactName, 120);
    const contactEmail = normalizeEmail(request.data?.contactEmail);
    const summary = safeText(request.data?.summary, 160);
    const details = safeText(request.data?.details, 1_500);
    const issueCategory = safeText(request.data?.issueCategory || 'support', 80);
    const taskAttempted = safeText(request.data?.taskAttempted, 300);
    const expectedResult = safeText(request.data?.expectedResult, 500);
    const actualResult = safeText(request.data?.actualResult, 500);
    const errorMessage = safeText(request.data?.errorMessage, 300);
    if (contactName.length < 3) throw new HttpsError('invalid-argument', 'Enter your name for support follow-up.');
    if (!validEmail(contactEmail) || contactEmail !== principal.verifiedEmail) throw new HttpsError('invalid-argument', 'Use the email address for your signed-in account.');
    if (!summary || (!details && !actualResult)) throw new HttpsError('invalid-argument', 'Add a short summary and description.');
    const combined = [summary, details, taskAttempted, expectedResult, actualResult, errorMessage].join(' ');
    if (containsRestrictedContent(combined)) throw new HttpsError('invalid-argument', 'Remove passwords, credentials, payment card details, or access tokens.');
    const context = sanitizeContext(request.data, principal);
    let sessionId = safeText(request.data?.sessionId, 200);
    let ref;
    let session;
    if (!sessionId) {
      const created = await createRemoteSession(principal, context, `Support request: ${summary}`);
      sessionId = created.sessionId;
      ref = collection.doc(sessionId);
      session = (await ref.get()).data();
    } else {
      ref = collection.doc(documentId(sessionId, 'assistant session'));
      session = assertSessionOwner(await ref.get(), principal);
      if (session.supportStatus === 'closed' || session.supportTransferState === 'closed') {
        const created = await createRemoteSession(principal, context, `Support request: ${summary}`);
        sessionId = created.sessionId;
        ref = collection.doc(documentId(sessionId, 'assistant session'));
        session = (await ref.get()).data();
      }
    }
    if (session.escalationState === 'requested' && session.supportSessionId
      && session.supportProduct === PRODUCT && session.supportTenantId === principal.workspaceReference) {
      let latestReceipt = null;
      try {
        const latest = await remoteRequest(`/chat/public/session/${encodeURIComponent(session.remoteSessionId)}/messages`);
        latestReceipt = persistedSupportReceipt(latest, principal.workspaceReference, normalizeRemoteMessages(latest));
      } catch (error) { return publicServiceError(error); }
      if (latestReceipt?.supportStatus === 'closed') {
        const created = await createRemoteSession(principal, context, `Support request: ${summary}`);
        sessionId = created.sessionId;
        ref = collection.doc(documentId(sessionId, 'assistant session'));
        session = (await ref.get()).data();
      } else {
        if (latestReceipt) {
          await ref.set({ ...latestReceipt, updatedAt: now() }, { merge: true });
        }
        return {
          sessionId,
          supportSessionId: latestReceipt?.supportSessionId || session.supportSessionId,
          escalated: true,
          persisted: true,
          idempotent: true,
          supportStatus: latestReceipt?.supportStatus || session.supportStatus || 'received',
          acknowledgment: latestReceipt?.acknowledgment || session.acknowledgment,
        };
      }
    }
    if (session.escalationState === 'requesting' && session.lastEscalationOperationId === operationId) {
      return {
        sessionId, escalated: false, persisted: false, idempotent: true,
        supportStatus: 'requesting',
        acknowledgment: 'Connecting your request to Workside Support. Please check again shortly.',
      };
    }
    await ref.set({ escalationState: 'requesting', lastEscalationOperationId: operationId, updatedAt: now() }, { merge: true });
    const description = [
      `Route Logistics ${issueCategory} request`,
      `Summary: ${summary}`,
      details ? `Details: ${details}` : null,
      taskAttempted ? `Task attempted: ${taskAttempted}` : null,
      expectedResult ? `Expected result: ${expectedResult}` : null,
      actualResult ? `Actual result: ${actualResult}` : null,
      errorMessage ? `Error message: ${errorMessage}` : null,
      `Page: ${context.route}`,
      `Role: ${principal.role}`,
      `App build: ${safeText(request.data?.appVersion, 80) || 'not supplied'}`,
    ].filter(Boolean).join('\n');
    let payload;
    try {
      payload = await remoteRequest(`/chat/public/session/${encodeURIComponent(session.remoteSessionId)}/request-human`, {
        method: 'POST',
        body: {
          visitorId: `rl_${ref.id}`,
          leadName: contactName,
          leadEmail: contactEmail,
          reason: issueCategory === 'problem_report' ? 'support_issue' : 'user_requested_human',
          intent: 'support',
          message: description,
          operationId,
          product: PRODUCT,
          tenantId: principal.workspaceReference,
        },
      });
    } catch (error) {
      await ref.set({ escalationState: 'failed', updatedAt: now() }, { merge: true });
      return publicServiceError(error);
    }
    const receipt = persistedSupportReceipt(payload, principal.workspaceReference);
    if (!receipt) {
      await ref.set({ escalationState: 'failed', updatedAt: now() }, { merge: true });
      throw new HttpsError('unavailable', 'Workside Support could not confirm that your request was received. Please retry.');
    }
    await ref.set({
      ...receipt,
      escalationState: 'requested',
      escalatedAt: now(),
      updatedAt: now(),
    }, { merge: true });
    return {
      sessionId,
      supportSessionId: receipt.supportSessionId,
      escalated: true,
      persisted: true,
      idempotent: payload?.idempotent === true,
      supportStatus: receipt.supportStatus,
      transferState: receipt.supportTransferState,
      routingStatus: receipt.supportRoutingStatus,
      availabilityOutcome: receipt.supportAvailabilityOutcome,
      messages: normalizeRemoteMessages(payload),
      acknowledgment: receipt.acknowledgment,
    };
  }

  async function handle(request) {
    const principal = await resolvePrincipal(db, request);
    const action = safeText(request.data?.action, 40);
    if (action === 'message') return sendMessage(request, principal);
    if (action === 'history') return history(request, principal);
    if (action === 'close') return close(request, principal);
    if (action === 'escalate') return escalate(request, principal);
    if (action === 'status') return { enabled: assistantEnabled(), product: PRODUCT, knowledgeVersion: KNOWLEDGE_VERSION };
    throw new HttpsError('invalid-argument', 'Unsupported assistant action.');
  }

  return { handle, resolvePrincipal, sendMessage, history, close, escalate };
}

module.exports = {
  ALLOWED_ROUTES,
  KNOWLEDGE_VERSION,
  MAX_MESSAGE_LENGTH,
  MAX_SESSION_MESSAGES,
  PRODUCT,
  assistantHandlers,
  capabilitiesForRole,
  containsRestrictedContent,
  normalizeRemoteMessages,
  normalizeRoute,
  routeAllowed,
  safeText,
  sanitizeContext,
};
