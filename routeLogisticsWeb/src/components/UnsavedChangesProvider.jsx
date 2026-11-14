import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useConfirm } from './ConfirmProvider';
import { UnsavedChangesContext } from '../hooks/useUnsavedChanges';

export function UnsavedChangesProvider({ children }) {
  const confirm = useConfirm();
  const registrations = useRef(new Map()), pendingRequest = useRef(null);
  const [revision, setRevision] = useState(0);
  const dirtyCount = registrations.current.size;
  const register = useCallback((key, dirty, message, scope) => {
    if (dirty) registrations.current.set(key, { message, scope });
    else registrations.current.delete(key);
    setRevision(value => value + 1);
  }, []);
  const unregister = useCallback(key => {
    registrations.current.delete(key);
    setRevision(value => value + 1);
  }, []);
  const confirmDiscard = useCallback(scope => {
    const entries = [...registrations.current.values()].filter(entry => scope === undefined || entry.scope === scope);
    if (!entries.length) return Promise.resolve(true);
    const previous = pendingRequest.current;
    if (previous) {
      if (previous.scope === scope) return previous.promise;
      if (previous.scope === undefined) return Promise.resolve(false);
      previous.controller.abort();
    }
    const messages = [...new Set(entries.map(entry => entry.message).filter(Boolean))];
    const controller = new AbortController();
    const request = { scope, controller };
    const pending = Promise.resolve(confirm({
      title: 'Leave without saving?',
      message: messages.length === 1 ? messages[0] : 'You have unsaved changes. Leaving now will discard them.',
      confirmText: 'Leave without saving', cancelText: 'Keep editing',
      autoFocusConfirm: false,
      signal: controller.signal,
    })).then(Boolean, () => false);
    request.promise = pending; pendingRequest.current = request;
    pending.then(() => { if (pendingRequest.current === request) pendingRequest.current = null; });
    return pending;
  }, [confirm]);
  const shouldBlock = useCallback(({ currentLocation, nextLocation }) => registrations.current.size > 0
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search), []);
  const blocker = useBlocker(shouldBlock);
  const latestBlocker = useRef(blocker); latestBlocker.current = blocker;
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let active = true;
    confirmDiscard().then(leave => {
      const latest = latestBlocker.current;
      if (!active || latest.state !== 'blocked') return;
      if (leave || !registrations.current.size) latest.proceed();
      else latest.reset();
    });
    return () => { active = false; };
  }, [blocker, confirmDiscard]);
  useEffect(() => {
    const pending = pendingRequest.current;
    if (pending && ![...registrations.current.values()].some(entry => pending.scope === undefined || entry.scope === pending.scope)) pending.controller.abort();
  }, [revision]);
  useEffect(() => () => pendingRequest.current?.controller.abort(), []);
  useEffect(() => {
    if (!dirtyCount) return;
    const beforeUnload = event => {
      if (!registrations.current.size) return;
      event.preventDefault(); event.returnValue = true;
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirtyCount]);
  const value = useMemo(() => ({ register, unregister, confirmDiscard }), [register, unregister, confirmDiscard]);
  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>;
}
