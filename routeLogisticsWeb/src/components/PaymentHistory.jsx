import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { functions } from '../services/firebase';
import { usePrincipalQuery } from '../hooks/usePrincipalQuery';
export default function PaymentHistory({ invoiceId, functionClient = functions }) {
  const paymentAuth = getAuth(functionClient.app), [uid, setUid] = useState(paymentAuth.currentUser?.uid || '');
  useEffect(() => onAuthStateChanged(paymentAuth, user => setUid(user?.uid || '')), [paymentAuth]);
  const historyQuery = usePrincipalQuery(`rl-payments:${functionClient.app.name}`, uid, [invoiceId], () => httpsCallable(functionClient, 'rlGetInvoicePaymentHistory')({ invoiceId }).then(result => result.data), { enabled: !!invoiceId, current: value => paymentAuth.currentUser?.uid === value });
  const data = historyQuery.data, error = historyQuery.error?.message;
  return <section className="mt-5 border-t pt-4"><div className="flex items-center justify-between"><h3 className="font-semibold">Payment history</h3><button className="underline" onClick={() => historyQuery.refetch()}>Refresh history</button></div>{error && <p role="alert">{error}</p>}{data?.history.length === 0 && <p>No reconciled payments recorded.</p>}{data?.history.map(event => <div key={event.id} className="my-2 rounded border p-3 text-sm"><p>{event.mode === 'test' ? 'TEST · ' : ''}{event.status?.replaceAll('_', ' ')} · ${((event.amount || 0) / 100).toFixed(2)} USD</p><p>{event.recordedAt ? new Date(event.recordedAt).toLocaleString() : ''} · {event.type}</p>{event.refundedAmount > 0 && <p>Refunded: ${(event.refundedAmount / 100).toFixed(2)}</p>}{event.disputeStatus && <p>Dispute: {event.disputeStatus.replaceAll('_', ' ')}</p>}{event.reviewRequired && <p className="text-amber-800">Administrator review required</p>}</div>)}{data?.truncated && <p>Showing the latest 200 events.</p>}</section>;
}
