import React from 'react';

export default function AddressValidationNotice({ validation, onAccept, disabled = false }) {
  if (!validation) return null;
  const unavailable = validation.status === 'unavailable';
  const suggestion = validation.status === 'confirmation-required' && typeof validation.suggestedAddress === 'string' ? validation.suggestedAddress.trim() : '';
  const message = typeof validation.message === 'string' && validation.message.trim() ? validation.message : unavailable ? 'The address check is unavailable. Try again shortly.' : 'The address could not be confirmed. Review it and try again.';
  return <section role="alert" aria-label="Address validation" className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
    <h4 className="font-semibold">{suggestion ? 'Review the suggested address' : unavailable ? 'Address check unavailable' : 'Address could not be confirmed'}</h4>
    <p>{message}</p>
    {suggestion && <div className="space-y-3">
      <p><span className="font-medium">Suggested address: </span>{suggestion}</p>
      {onAccept && <button type="button" disabled={disabled} className="rounded-lg bg-primary-700 px-4 py-2 font-medium text-white hover:bg-primary-800 disabled:opacity-50" onClick={() => { if (!disabled) onAccept(suggestion); }}>Use suggested address</button>}
      <p className="text-xs">Review the filled-in address, then save the form. Choosing the suggestion does not save it automatically.</p>
    </div>}
  </section>;
}
