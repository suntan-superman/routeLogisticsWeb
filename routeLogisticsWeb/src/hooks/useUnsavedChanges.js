import { createContext, useContext, useEffect, useMemo, useRef } from 'react';

export const UnsavedChangesContext = createContext(null);

function useProtection() {
  const protection = useContext(UnsavedChangesContext);
  if (!protection) throw new Error('Unsaved changes protection requires UnsavedChangesProvider.');
  return protection;
}

// Register each form independently; one provider owns navigation protection.
export function useUnsavedChanges(isDirty, { message, scope } = {}) {
  const { register, unregister, confirmDiscard } = useProtection();
  const registration = useRef(Symbol('unsaved form'));
  useEffect(() => {
    const key = registration.current;
    register(key, !!isDirty, message, scope);
    return () => unregister(key);
  }, [register, unregister, isDirty, message, scope]);
  const scopedConfirm = useMemo(() => scope === undefined ? confirmDiscard : () => confirmDiscard(scope), [confirmDiscard, scope]);
  return useMemo(() => ({ confirmDiscard: scopedConfirm }), [scopedConfirm]);
}

// Ask before actions such as signing out. The consumer still owns its draft.
export function useConfirmUnsavedChanges(scope) {
  const { confirmDiscard } = useProtection();
  return useMemo(() => scope === undefined ? confirmDiscard : () => confirmDiscard(scope), [confirmDiscard, scope]);
}
