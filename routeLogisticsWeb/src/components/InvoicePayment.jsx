import { useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';
import { stripePublishableKey as key, testPaymentsConfigured } from '../services/paymentConfig';

let stripePromise;
function PaymentForm({ invoiceId, invoke, onRefresh }) {
  const stripe = useStripe(), elements = useElements();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const submit = async (event) => {
    event.preventDefault(); if (!stripe || !elements) return;
    setBusy(true); setMessage('');
    try {
      const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: window.location.origin + window.location.pathname }, redirect: 'if_required' });
      if (result.error) setMessage(result.error.message);
      else { setMessage('Test payment submitted. No real money was collected; the invoice balance is unchanged.'); onRefresh?.(); }
    } catch { setMessage('Payment could not be submitted. Check the status before retrying.'); }
    finally { setBusy(false); }
  };
  const refresh = async () => {
    setBusy(true);
    try { const data = await invoke('rlGetInvoicePaymentStatus', { invoiceId }); setMessage(`Test payment: ${data.status.replaceAll('_', ' ')}${data.reviewRequired ? '. Administrator review required.' : ''}`); onRefresh?.(); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="space-y-4"><PaymentElement /><button disabled={busy || !stripe || !elements} className="rounded bg-primary-600 px-4 py-2 text-white disabled:opacity-50">Submit test payment</button><button type="button" disabled={busy} className="ml-3 underline" onClick={refresh}>Check payment status</button>{message && <p role="status">{message}</p>}</form>;
}
export default function InvoicePayment({ invoiceId, functionClient = functions, onClose, onRefresh }) {
  const [payment, setPayment] = useState(null), [error, setError] = useState('');
  const invoke = (name, data) => httpsCallable(functionClient, name)(data).then((result) => result.data);
  useEffect(() => {
    let active = true;
    if (!testPaymentsConfigured) { setError('Test card payments are not configured.'); return; }
    stripePromise ||= loadStripe(key);
    httpsCallable(functionClient, 'rlCreateInvoicePayment')({ invoiceId }).then(({ data }) => {
      if (!active) return;
      if (data.mode !== 'test') { setError('This interface only accepts test payments.'); return; }
      setPayment(data);
    }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [invoiceId, functionClient]);
  return <div role="dialog" aria-modal="true" aria-label="Test invoice payment" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6"><div className="mb-4 flex justify-between gap-4"><h2 className="text-xl font-bold">Stripe test payment</h2><button onClick={onClose} aria-label="Close payment">Close</button></div><p className="mb-4 text-sm">Use Stripe test card details. No real money is collected, and this test will not mark the invoice paid.</p>{error ? <p role="alert" className="text-red-700">{error}</p> : payment ? <><p className="mb-3 font-semibold">${(payment.amount / 100).toFixed(2)} USD</p><Elements stripe={stripePromise} options={{ clientSecret: payment.clientSecret }}><PaymentForm invoiceId={invoiceId} invoke={invoke} onRefresh={onRefresh} /></Elements></> : <p role="status">Preparing secure payment…</p>}</div></div>;
}
