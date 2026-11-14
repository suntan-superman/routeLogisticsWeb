import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { callWorkspace } from '../services/workspaceApi';
export default function PaymentReadiness() {
  const { can } = useAuth(), permitted = can('invoices.manage');
  const [data, setData] = useState(null), [error, setError] = useState('');
  useEffect(() => { let active = true; if (permitted) callWorkspace('rlGetPaymentReadiness').then(value => { if (active) setData(value); }).catch(failure => { if (active) setError(failure.message); }); return () => { active = false; }; }, [permitted]);
  if (!permitted) return null;
  return <section className="space-y-3 rounded border bg-white p-6"><h2 className="text-xl font-semibold">Stripe payments</h2>{error && <p role="alert">{error}</p>}{data && <><p>{data.enabled ? 'Enabled' : 'Disabled'} · {data.mode} mode · Live collection {data.liveCollectionEnabled ? 'enabled' : 'disabled'}</p><p>Live activation requires operator approval and matching frontend and backend environments. Test payments preserve invoice balances.</p><h3 className="font-semibold">Payments needing review</h3>{!data.review.length && <p>No review flags among the latest 100 payment records inspected.</p>}{data.review.map(row => <p key={row.invoiceId + row.mode}>{row.invoiceId} · {row.mode} · {row.status?.replaceAll('_', ' ')}</p>)}</>}</section>;
}
