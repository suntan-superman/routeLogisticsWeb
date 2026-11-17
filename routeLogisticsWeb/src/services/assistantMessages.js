const MAX_ASSISTANT_MESSAGES = 40;

function validMessage(message) {
  return Boolean(message?.id && message?.text && message?.role);
}

export function createClientMessageId() {
  return crypto.randomUUID();
}

export function optimisticVisitorMessage(clientMessageId, text, createdAt = new Date().toISOString()) {
  return {
    id: `client:${clientMessageId}:visitor`,
    clientMessageId,
    role: 'visitor',
    text,
    createdAt,
    optimistic: true,
    deliveryState: 'sending',
  };
}

export function localAssistantMessage(text, { clientMessageId = '', fallback = false, createdAt = new Date().toISOString() } = {}) {
  return {
    id: clientMessageId ? `client:${clientMessageId}:fallback` : crypto.randomUUID(),
    ...(clientMessageId ? { clientMessageId } : {}),
    role: 'assistant',
    text,
    createdAt,
    ...(fallback ? { fallback: true } : {}),
  };
}

function acknowledgementMap(acknowledgments = []) {
  return new Map((Array.isArray(acknowledgments) ? acknowledgments : [acknowledgments])
    .filter(item => item?.clientMessageId)
    .map(item => [item.clientMessageId, item]));
}

export function reconcileAssistantMessages(current = [], incoming = [], { acknowledgments = [] } = {}) {
  const serverMessages = (incoming || []).filter(validMessage);
  const serverIds = new Set(serverMessages.map(message => message.id));
  const acknowledged = acknowledgementMap(acknowledgments);
  const retained = (current || []).filter(validMessage).flatMap(message => {
    const acknowledgment = message.clientMessageId ? acknowledged.get(message.clientMessageId) : null;
    if (!acknowledgment) return [message];
    const remoteId = message.role === 'visitor'
      ? acknowledgment.visitorMessageId
      : acknowledgment.assistantMessageId;
    if (remoteId && serverIds.has(remoteId)) return [];
    return [{ ...message, optimistic: false, deliveryState: 'acknowledged' }];
  });
  const byId = new Map();
  [...retained, ...serverMessages].forEach(message => byId.set(message.id, message));
  return [...byId.values()].slice(-MAX_ASSISTANT_MESSAGES);
}

export function markAssistantAttempt(messages = [], clientMessageId, deliveryState) {
  return messages.map(message => message.clientMessageId === clientMessageId
    ? { ...message, deliveryState }
    : message);
}

export function supportLifecycleMessage(status) {
  switch (status) {
    case 'requesting': return 'Connecting your request to Workside Support. Use Refresh to check again shortly.';
    case 'waiting_for_agent': return 'Workside Support has received your request. It is waiting for a representative; an immediate live reply is not promised.';
    case 'assigned_to_support': return 'A Workside Support representative has accepted your request and is assigned to the conversation.';
    case 'human_conversation_active': return 'Your conversation with a Workside Support representative is active.';
    case 'closed': return 'Your support conversation has ended. Start a new conversation to contact Workside Support again.';
    default: return 'Workside Support has received your request. Use Refresh to check for supported follow-up; an immediate live reply is not promised.';
  }
}

export { MAX_ASSISTANT_MESSAGES };
