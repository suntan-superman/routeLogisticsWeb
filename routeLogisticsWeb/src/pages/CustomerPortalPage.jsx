import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { portalAuth, portalFunctions, portalReady } from '../services/portal';
import InvoicePayment from '../components/InvoicePayment';
import { paymentsConfigured, paymentMode } from '../services/paymentConfig';
const call = (name, data) => httpsCallable(portalFunctions, name)(data).then((result) => result.data);
const money = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

export default function CustomerPortalPage() {
  const [user, setUser] = useState(null), [accounts, setAccounts] = useState([]);
  const [email, setEmail] = useState(''), [code, setCode] = useState(''), [challenge, setChallenge] = useState(null);
  const [busy, setBusy] = useState(true), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const load = async () => {
    setBusy(true); setError('');
    try { const data = await call('getCustomerPortal'); setAccounts(data.accounts); setHasMore(data.hasMoreAccounts); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  useEffect(() => onAuthStateChanged(portalAuth, (current) => {
    setUser(current); setAccounts([]); setPaymentInvoice(null);
    if (current) load(); else setBusy(false);
  }), []);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await portalReady;
      if (!challenge) {
        const data = await call('rlRequestCustomerOTP', { email });
        setChallenge(data.challengeId); setMessage(data.message);
      } else {
        const { token } = await call('rlVerifyCustomerOTP', { challengeId: challenge, code });
        await signInWithCustomToken(portalAuth, token);
        setMessage(''); setCode(''); setChallenge(null);
      }
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto max-w-5xl p-6">
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3"><Link className="font-bold text-primary-700" to="/">Route Logistics</Link>{user && <button className="underline" onClick={() => signOut(portalAuth)}>Sign out</button>}</div>
    <h1 className="mb-6 text-3xl font-bold">Customer portal</h1>
    {!user ? <form onSubmit={submit} className="max-w-md space-y-4 rounded-lg border bg-white p-6">
      <p>View your service visits and invoices using the email you gave your service provider.</p>
      <label className="block">Email address<input className="mt-1 block w-full rounded border-gray-300" type="email" autoComplete="email" required disabled={!!challenge || busy} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      {challenge && <label className="block">Six-digit code<input className="mt-1 block w-full rounded border-gray-300" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} /></label>}
      <button disabled={busy} className="rounded bg-primary-600 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Please wait…' : challenge ? 'Sign in' : 'Email a sign-in code'}</button>
      {challenge && <button type="button" disabled={busy} className="block underline" onClick={() => { setChallenge(null); setCode(''); setMessage(''); }}>Request a new code or change email</button>}
    </form> : <>
      <button className="mb-4 underline" disabled={busy} onClick={load}>{busy ? 'Refreshing…' : 'Refresh visits and invoices'}</button>
      {!busy && !accounts.length && !error && <p>No service records are available. Contact your provider to check your email address.</p>}
      {accounts.map((account) => <section key={account.id} className="mb-6 rounded-lg border bg-white p-6">
        <h2 className="text-xl font-bold">{account.companyName}</h2>
        <h3 className="mb-3 mt-5 font-semibold">Service visits</h3>
        {account.jobs.length ? <ul className="divide-y">{account.jobs.map((job) => <li key={job.id} className="flex flex-wrap justify-between gap-2 py-3"><span>{job.serviceType} · {job.date} {job.time}</span><span className="capitalize">{job.status.replace('-', ' ')}</span></li>)}</ul> : <p>No visits yet.</p>}
        <h3 className="mb-3 mt-6 font-semibold">Invoices</h3>
        {account.invoices.length ? account.invoices.map((invoice) => <details key={invoice.id} className="border-t py-3"><summary className="cursor-pointer">{invoice.invoiceNumber} · {money(invoice.total)} · {invoice.status} · Due {invoice.dueDate}</summary><ul className="mt-3 text-sm">{invoice.lineItems.map((item, i) => <li key={i}>{item.description} — {item.quantity} × {money(item.unitPrice)} = {money(item.amount)}</li>)}</ul><p className="mt-3 text-sm">Contact your provider for payment arrangements.</p></details>) : <p>No invoices yet.</p>}
        {account.hasMore && <p className="mt-3 text-sm">Showing the latest 50 visits and invoices. Contact your provider for older records.</p>}
      </section>)}
      {hasMore && <p>Showing up to 25 service accounts. Contact your provider for additional records.</p>}
    </>}
    {message && <p role="status" className="mt-4">{message}</p>}
    {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
    {user && paymentsConfigured && accounts.some((a) => a.invoices.some((i) => i.status === 'sent')) && <section className="mt-6 rounded border p-4"><h2 className="font-semibold">{paymentMode === 'test' ? 'Test card payments' : 'Secure card payments'}</h2><p className="mb-3 text-sm">{paymentMode === 'test' ? 'No real money is collected. Invoice balances remain unchanged.' : 'Choose an invoice to pay securely through Stripe.'}</p>{accounts.flatMap((a) => a.invoices.filter((i) => i.status === 'sent' && i.total >= 0.5).map((invoice) => <button className="mr-3 underline" key={invoice.id} onClick={() => setPaymentInvoice(invoice.id)}>{paymentMode === 'test' ? 'Test payment for' : 'Pay'} {invoice.invoiceNumber}</button>))}</section>}
    {paymentInvoice && <InvoicePayment invoiceId={paymentInvoice} functionClient={portalFunctions} onClose={() => setPaymentInvoice(null)} onRefresh={load} />}
  </main>;
}
