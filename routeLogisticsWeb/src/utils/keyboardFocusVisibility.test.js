import assert from 'node:assert/strict';
import test from 'node:test';
import { installKeyboardFocusVisibility, isFormFocusTarget, revealKeyboardFocus } from './keyboardFocusVisibility.js';

function fakeTarget({ region = true, disabled = false, connected = true, kind = 'field' } = {}) {
  const calls = [];
  return {
    disabled,
    isConnected: connected,
    matches: selector => kind === 'field' ? selector.includes('input') : selector.includes('button'),
    closest: () => region ? {} : null,
    scrollIntoView: options => calls.push(options),
    calls,
  };
}

function fakeDocument() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    emit(type, event = {}) { listeners.get(type)?.(event); },
    listeners,
  };
}

test('recognizes every data field and form or dialog action', () => {
  assert.equal(isFormFocusTarget(fakeTarget()), true);
  assert.equal(isFormFocusTarget(fakeTarget({ region: false })), true);
  assert.equal(isFormFocusTarget(fakeTarget({ kind: 'action' })), true);
  assert.equal(isFormFocusTarget(fakeTarget({ kind: 'action', region: false })), false);
  assert.equal(isFormFocusTarget(fakeTarget({ disabled: true })), false);
});

test('reveals a connected field with nearest scrolling', () => {
  const target = fakeTarget();
  assert.equal(revealKeyboardFocus(target, callback => callback()), true);
  assert.deepEqual(target.calls, [{ block: 'nearest', inline: 'nearest', behavior: 'auto' }]);

  const detached = fakeTarget({ connected: false });
  assert.equal(revealKeyboardFocus(detached, callback => callback()), true);
  assert.deepEqual(detached.calls, []);
});

test('scrolls focus after Tab and Shift+Tab but not pointer or programmatic focus', () => {
  const documentRef = fakeDocument(), target = fakeTarget();
  const cleanup = installKeyboardFocusVisibility(documentRef, callback => callback());

  documentRef.emit('focusin', { target });
  assert.equal(target.calls.length, 0);

  documentRef.emit('keydown', { key: 'Tab', shiftKey: false });
  documentRef.emit('focusin', { target });
  assert.equal(target.calls.length, 1);

  documentRef.emit('keydown', { key: 'Tab', shiftKey: true });
  documentRef.emit('focusin', { target });
  assert.equal(target.calls.length, 2);

  documentRef.emit('pointerdown');
  documentRef.emit('focusin', { target });
  assert.equal(target.calls.length, 2);

  cleanup();
  assert.equal(documentRef.listeners.size, 0);
});
