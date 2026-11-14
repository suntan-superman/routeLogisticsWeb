import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

const ConfirmContext = createContext(null);

// confirm({ title, message, confirmText, cancelText, tone: 'danger' | 'primary' }) -> Promise<boolean>
export const useConfirm = () => useContext(ConfirmContext);

export const ConfirmProvider = ({ children }) => {
  const [dialog, setDialog] = useState(null);
  const resolver = useRef(null);

  const close = useCallback((result) => {
    const pending = resolver.current;
    resolver.current = null;
    pending?.cleanup?.();
    pending?.resolve(result);
    setDialog(null);
  }, []);

  const confirm = useCallback((options) => new Promise((resolve) => {
    if (options.signal?.aborted) { resolve(false); return; }
    const previous = resolver.current;
    resolver.current = null;
    previous?.cleanup?.();
    previous?.resolve(false);
    const pending = { resolve };
    resolver.current = pending;
    if (options.signal) {
      const abort = () => { if (resolver.current === pending) close(false); };
      options.signal.addEventListener('abort', abort, { once: true });
      pending.cleanup = () => options.signal.removeEventListener('abort', abort);
    }
    setDialog(options);
  }), [close]);

  useEffect(() => () => {
    const pending = resolver.current;
    resolver.current = null;
    pending?.cleanup?.();
    pending?.resolve(false);
  }, []);

  useEffect(() => {
    if (!dialog) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, close]);

  const danger = dialog?.tone !== 'primary';
  const Icon = danger ? ExclamationTriangleIcon : InformationCircleIcon;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/50 p-4"
          onMouseDown={(e) => e.target === e.currentTarget && close(false)}
          role="dialog"
          aria-label={dialog.title || 'Are you sure?'}
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex gap-4">
              <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${danger ? 'bg-red-100 text-red-600' : 'bg-primary-100 text-primary-600'}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{dialog.title || 'Are you sure?'}</h3>
                {dialog.message && <p className="mt-2 text-sm text-gray-600">{dialog.message}</p>}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                autoFocus={dialog.autoFocusConfirm === false}
                onClick={() => close(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {dialog.cancelText || 'Cancel'}
              </button>
              <button
                autoFocus={dialog.autoFocusConfirm !== false}
                onClick={() => close(true)}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'}`}
              >
                {dialog.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};
