import test from 'node:test';
import assert from 'node:assert/strict';
import {
  localAssistantMessage,
  markAssistantAttempt,
  optimisticVisitorMessage,
  reconcileAssistantMessages,
  supportLifecycleMessage,
} from './assistantMessages.js';

const serverPair = (suffix, text = 'How do I create an invoice?') => [
  { id: `visitor-${suffix}`, role: 'visitor', text, createdAt: `2026-11-17T10:00:0${suffix}Z` },
  { id: `assistant-${suffix}`, role: 'assistant', text: `Answer ${suffix}`, createdAt: `2026-11-17T10:00:1${suffix}Z` },
];
const acknowledgment = suffix => ({ clientMessageId: `client-${suffix}`, visitorMessageId: `visitor-${suffix}`, assistantMessageId: `assistant-${suffix}` });

test('one optimistic question reconciles to one server user message and one assistant response', () => {
  const optimistic = optimisticVisitorMessage('client-1', 'How do I create an invoice?');
  const result = reconcileAssistantMessages([optimistic], serverPair('1'), { acknowledgments: [acknowledgment('1')] });
  assert.deepEqual(result.map(message => message.id), ['visitor-1', 'assistant-1']);
});

test('history refresh and navigation remount do not duplicate stable server messages', () => {
  const first = reconcileAssistantMessages([], serverPair('1'));
  const refreshed = reconcileAssistantMessages(first, serverPair('1'));
  assert.deepEqual(refreshed.map(message => message.id), ['visitor-1', 'assistant-1']);
});

test('a fallback from a timed-out attempt is replaced by the acknowledged server response on retry', () => {
  const current = [
    optimisticVisitorMessage('client-1', 'How do I create an invoice?'),
    localAssistantMessage('Verified fallback.', { clientMessageId: 'client-1', fallback: true }),
  ];
  const retrying = markAssistantAttempt(current, 'client-1', 'sending');
  const result = reconcileAssistantMessages(retrying, serverPair('1'), { acknowledgments: [acknowledgment('1')] });
  assert.deepEqual(result.map(message => message.id), ['visitor-1', 'assistant-1']);
});

test('two legitimate identical questions remain distinct because their identities differ', () => {
  const first = reconcileAssistantMessages([optimisticVisitorMessage('client-1', 'Same question')], serverPair('1', 'Same question'), { acknowledgments: [acknowledgment('1')] });
  const second = reconcileAssistantMessages([...first, optimisticVisitorMessage('client-2', 'Same question')], serverPair('2', 'Same question'), { acknowledgments: [acknowledgment('2')] });
  assert.equal(second.filter(message => message.role === 'visitor' && message.text === 'Same question').length, 2);
  assert.deepEqual(second.map(message => message.id), ['visitor-1', 'assistant-1', 'visitor-2', 'assistant-2']);
});

test('an unacknowledged optimistic message survives unrelated history refreshes', () => {
  const pending = optimisticVisitorMessage('client-pending', 'Pending question');
  const result = reconcileAssistantMessages([...serverPair('1'), pending], serverPair('1'));
  assert.equal(result.at(-1).id, pending.id);
  assert.equal(result.at(-1).deliveryState, 'sending');
});

test('support lifecycle copy distinguishes waiting, assigned, active, and closed refresh states', () => {
  assert.match(supportLifecycleMessage('waiting_for_agent'), /waiting for a representative/);
  assert.match(supportLifecycleMessage('assigned_to_support'), /accepted your request and is assigned/);
  assert.match(supportLifecycleMessage('human_conversation_active'), /conversation .* is active/);
  assert.match(supportLifecycleMessage('closed'), /conversation has ended/);
});
