import ThemeControl from '../components/ThemeControl';
import SelectControl from '../components/SelectControl';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { portalAuth, portalFunctions, portalReady } from '../services/portal';
import InvoicePayment from '../components/InvoicePayment';
import { paymentsConfigured, paymentMode } from '../services/paymentConfig';
import CustomerReviews from '../components/CustomerReviews';
import { usePrincipalQuery } from '../hooks/usePrincipalQuery';
import { workspaceAccessError } from '../services/workspaceQueryPolicy';
import { useConfirmUnsavedChanges } from '../hooks/useUnsavedChanges';
import { rememberedPortalEmail, rememberPortalEmail } from '../utils/rememberedEmail';
const call = (name, data) => httpsCallable(portalFunctions, name)(data).then((result) => result.data);
const money = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const centsMoney = cents => money(cents / 100);
const portalName = account => Array.isArray(account?.customerNames) && account.customerNames.length === 1 ? account.customerNames[0] : '';
function PortalInvoice({ invoice, onPdf }) {
  const [entries, setEntries] = useState(null), [error, setError] = useState('');
  const loadHistory = () => call('rlInvoiceLedger', { action: 'history', invoiceId: invoice.id }).then(result => setEntries(result.entries || [])).catch(failure => setError(failure.message || 'Payment history is unavailable.'));
  return <details className="border-t py-3" onToggle={event => { if (event.currentTarget.open && entries === null) loadHistory(); }}>
    <summary className="cursor-pointer font-medium">{invoice.invoiceNumber} · {centsMoney(invoice.totalCents)} · {invoice.status.replaceAll('_', ' ')} · Due {invoice.dueDate}</summary>
    <div className="mt-3 space-y-3 text-sm">
      <p>Original total: {centsMoney(invoice.totalCents)} · Payments: {centsMoney(invoice.paidCents)} · Credits: {centsMoney(invoice.creditCents)} · <strong>Outstanding: {centsMoney(invoice.balanceCents)}</strong></p>
      <ul>{invoice.lineItems.map((item, index) => <li key={index}>{item.description} — {item.quantity} × {centsMoney(item.unitPriceCents)} = {centsMoney(item.amountCents)}</li>)}</ul>
      <button type="button" className="text-primary-700 underline" onClick={() => onPdf(invoice)}>View or download invoice PDF</button>
      <div><strong>Payment activity</strong>{error && <p role="alert" className="text-red-700">{error}</p>}{entries === null && !error ? <p>Loading…</p> : entries?.length ? <ul className="mt-1 space-y-1">{entries.map(entry => <li key={entry.id}>{entry.kind.replaceAll('_', ' ')} · {centsMoney(entry.amountCents)}</li>)}</ul> : <p>No payments or credits recorded.</p>}</div>
    </div>
  </details>;
}
const today = timeZone => {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const value = type => parts.find(part => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  } catch { return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
};

export default function CustomerPortalPage() {
  const confirmDiscard = useConfirmUnsavedChanges();
  const [user, setUser] = useState(null), [accounts, setAccounts] = useState([]);
  const [email, setEmail] = useState(rememberedPortalEmail), [remember, setRemember] = useState(() => Boolean(email)), [code, setCode] = useState(''), [challenge, setChallenge] = useState(null);
  const [busy, setBusy] = useState(true), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [propertyKey, setPropertyKey] = useState(''), [inviteLink, setInviteLink] = useState('');
  const [pendingInvite, setPendingInvite] = useState(() => {
    if (typeof window === 'undefined') return '';
    const match = window.location.hash.match(/^#link=([a-f0-9]{64})$/);
    return match?.[1] || '';
  });
  const [connectOpen, setConnectOpen] = useState(() => Boolean(pendingInvite));
  useEffect(() => {
    if (pendingInvite) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }, [pendingInvite]);
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const [selectedId, setSelectedId] = useState(''), [fileView, setFileView] = useState(null), [logoutFailed, setLogoutFailed] = useState(false);
  const alive = useRef(false), identity = useRef(null), selection = useRef(''), requestVersion = useRef(0), fileVersion = useRef(0), authVersion = useRef(0), submitting = useRef(false);
  const clearDetails = () => { fileVersion.current++; setPaymentInvoice(null); setFileView(null); };
  const portalQuery = usePrincipalQuery('rl-customer-portal', user?.uid, ['accounts'], async () => { await portalReady; return call('getCustomerPortal'); }, {
    current: uid => alive.current && identity.current?.uid === uid && portalAuth.currentUser?.uid === uid,
  });
  const load = () => portalQuery.refetch();
  useEffect(() => {
    if (!user || !portalQuery.data) return;
    const available = Array.isArray(portalQuery.data.accounts) ? portalQuery.data.accounts : [];
    const previous = selection.current, next = available.some(account => account.id === previous) ? previous : available[0]?.id || '';
    if (next !== previous) { clearDetails(); setPropertyKey(''); }
    selection.current = next; setSelectedId(next); setAccounts(available); setHasMore(portalQuery.data.hasMoreAccounts === true); setBusy(false);
  }, [portalQuery.data, user]);
  useEffect(() => {
    if (!user || !portalQuery.error) return;
    setBusy(false);
    if (workspaceAccessError(portalQuery.error)) { selection.current = ''; setSelectedId(''); setAccounts([]); clearDetails(); }
  }, [portalQuery.error, user]);
  useEffect(() => {
    alive.current = true;
    const unsubscribe = onAuthStateChanged(portalAuth, current => {
      identity.current = current; selection.current = ''; requestVersion.current++; fileVersion.current++; authVersion.current++;
      setUser(current); setAccounts([]); setSelectedId(''); setPropertyKey(''); setPaymentInvoice(null); setFileView(null); setHasMore(false);
      setCode(''); setChallenge(null); setMessage(''); setError(''); setLogoutFailed(false);
      setBusy(!!current);
    });
    return () => { alive.current = false; unsubscribe(); };
  }, []);
  const selectedAccount = user && portalQuery.data ? accounts.find(account => account.id === selectedId) : null;
  const selectedProperty = selectedAccount?.properties?.find(property => `${property.customerId}:${property.id}` === propertyKey);
  const displayedJobs = selectedAccount?.jobs?.filter(job => !selectedProperty || job.propertyKey === propertyKey) || [];
  const selectedAccounts = selectedAccount ? [selectedAccount] : [];
  const upcomingJobs = displayedJobs.filter(job => ['scheduled', 'en-route', 'in-progress'].includes(job.status) && job.date >= today(selectedAccount?.timeZone)).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const recentJobs = displayedJobs.filter(job => job.status === 'completed').slice(0, 3);
  const sharedFiles = selectedAccount ? [...(selectedAccount.photos || []), ...(selectedAccount.documents || [])].filter(item => !selectedProperty || displayedJobs.some(job => job.id === item.jobId)) : [];
  const chooseProvider = async event => {
    const next = event.target.value;
    if (!accounts.some(account => account.id === next) || !await confirmDiscard()) return;
    selection.current = next; setSelectedId(next); setPropertyKey(''); clearDetails(); setError(''); setMessage('');
  };
  const connectProvider = async () => {
    const token = pendingInvite || inviteLink.trim().match(/(?:#link=)?([a-f0-9]{64})$/)?.[1];
    if (!token || !user) { setError('That is not a provider invitation link. Open the separate “Connect your Route Logistics service provider” email and use its link. A sign-in code email only signs you in.'); return; }
    setBusy(true); setError('');
    try { await call('rlClaimPortalLink', { token }); setPendingInvite(''); setInviteLink(''); setConnectOpen(false); setMessage('Provider connected.'); await load(); }
    catch (failure) { setError(failure.message || 'This invitation could not be connected. Ask your provider for a new link.'); }
    finally { setBusy(false); }
  };
  const disconnectProvider = async () => {
    if (!selectedAccount || !await confirmDiscard() || !window.confirm(`Disconnect ${selectedAccount.companyName} from this portal? Your provider's customer records will remain intact.`)) return;
    setBusy(true); setError('');
    try { await call('rlDisconnectPortalLink', { accountId: selectedAccount.id }); clearDetails(); setMessage('Provider disconnected. Your service records remain with the provider.'); await load(); }
    catch (failure) { setError(failure.message || 'Could not disconnect this provider. Please try again.'); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    if (submitting.current) return;
    if (!await confirmDiscard()) return;
    submitting.current = true; requestVersion.current++; authVersion.current++; identity.current = null; selection.current = '';
    clearDetails(); setUser(null); setAccounts([]); setSelectedId(''); setCode(''); setChallenge(null); setError(''); setMessage(''); setBusy(true);
    try { await signOut(portalAuth); }
    catch { if (alive.current) { setLogoutFailed(true); setError('Sign-out could not finish. Your records have been hidden; retry signing out.'); } }
    finally { submitting.current = false; if (alive.current) setBusy(false); }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (submitting.current || identity.current) return;
    submitting.current = true; const version = ++authVersion.current; setBusy(true); setError('');
    try {
      await portalReady;
      if (!challenge) {
        rememberPortalEmail(email, remember);
        const data = await call('rlRequestCustomerOTP', { email: email.trim() });
        if (alive.current && version === authVersion.current && !identity.current) { setChallenge(data.challengeId); setMessage(data.message); setCode(''); }
      } else {
        const { token } = await call('rlVerifyCustomerOTP', { challengeId: challenge, code });
        if (!alive.current || version !== authVersion.current || identity.current) return;
        await signInWithCustomToken(portalAuth, token);
        if (alive.current) { setMessage(''); setCode(''); setChallenge(null); }
      }
    } catch (e) { if (alive.current && version === authVersion.current && !identity.current) { setError(e.message || 'Sign-in could not finish. Please try again.'); setCode(''); } }
    finally { submitting.current = false; if (alive.current && !identity.current) setBusy(false); }
  };
  const readFile = async item => {
    if (!selectedAccount || !identity.current) return;
    const accountId = selectedAccount.id, uid = identity.current.uid, version = ++fileVersion.current;
    setFileView({ accountId, item, loading: true, error: '', data: null });
    try {
      const data = await call('rlGetCustomerPortalFile', { accountId, kind: item.kind, fileId: item.id });
      if (!alive.current || version !== fileVersion.current || selection.current !== accountId || identity.current?.uid !== uid || portalAuth.currentUser?.uid !== uid) return;
      const types = item.kind === 'photo' ? ['image/jpeg', 'image/png', 'image/webp'] : ['application/pdf'];
      if (!types.includes(data.contentType) || typeof data.dataUri !== 'string' || !data.dataUri.startsWith(`data:${data.contentType};base64,`) || data.dataUri.length > 3 * 1024 * 1024) throw new Error('This file has an unsupported format or exceeds the portal download limit. Contact your provider.');
      setFileView({ accountId, item, loading: false, error: '', data });
    } catch (failure) { if (alive.current && version === fileVersion.current && selection.current === accountId && identity.current?.uid === uid) setFileView({ accountId, item, loading: false, data: null, error: failure.message || 'This file could not be loaded. Please try again.' }); }
  };
  const currentFile = fileView?.accountId === selectedAccount?.id ? fileView : null;
  const readInvoicePdf = async (accountId, invoice) => {
    const version = ++fileVersion.current, uid = identity.current?.uid;
    setFileView({ accountId, item: { name: invoice.invoiceNumber + '.pdf' }, loading: true, error: '', data: null });
    try {
      const result = await call('rlInvoicePdf', { invoiceId: invoice.id });
      if (alive.current && version === fileVersion.current && selection.current === accountId && identity.current?.uid === uid)
        setFileView({ accountId, item: { name: result.fileName }, loading: false, error: '', data: { contentType: 'application/pdf', name: result.fileName, dataUri: `data:application/pdf;base64,${result.base64}` } });
    } catch (failure) {
      if (alive.current && version === fileVersion.current && selection.current === accountId && identity.current?.uid === uid)
        setFileView({ accountId, item: { name: invoice.invoiceNumber + '.pdf' }, loading: false, error: failure.message || 'Invoice PDF is unavailable.', data: null });
    }
  };
  const activePayment = paymentInvoice?.accountId === selectedAccount?.id && selectedAccount?.invoices?.some(invoice => invoice.id === paymentInvoice.invoiceId) ? paymentInvoice.invoiceId : null;
  return <main className="mx-auto max-w-5xl p-5 sm:p-8">
    <Helmet><title>Customer portal | Route Logistics</title><meta name="robots" content="noindex,nofollow" /></Helmet>
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3"><Link className="font-bold text-primary-700" to="/">Route Logistics</Link><div className="flex items-center gap-4"><ThemeControl />{(user || logoutFailed) && <button type="button" disabled={busy && !user} className="text-primary-700 underline" onClick={logout}>{logoutFailed ? 'Retry sign out' : 'Sign out'}</button>}</div></div>
    {!user && <h1 className="mb-6 text-3xl font-bold">Customer portal</h1>}
    {!user ? <form onSubmit={submit} aria-label="Customer email sign-in" className="max-w-md space-y-4 rounded-xl border bg-white p-6">
      <p>Use the email your provider invited. Sign in, then connect the provider with its invitation link.</p>
      <label className="block">Email address<input className="mt-1 block w-full rounded border-gray-300" type="email" autoComplete="email" required disabled={!!challenge || busy || logoutFailed} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={remember} onChange={event => { setRemember(event.target.checked); rememberPortalEmail(email, event.target.checked); }} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" /><span>Remember me<span className="block text-xs text-gray-500">Save my email on this device. A new code is still required to sign in.</span></span></label>
      {challenge && <><label className="block">Six-digit code<input className="mt-1 block w-full rounded border-gray-300" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy || logoutFailed} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label><p className="text-sm text-gray-500">Codes expire after 10 minutes and can be used once.</p></>}
      <button disabled={busy || logoutFailed} className="rounded bg-primary-700 px-4 py-2 text-white hover:bg-primary-800 disabled:opacity-50">{busy ? 'Please wait…' : challenge ? 'Sign in' : 'Email a sign-in code'}</button>
      {challenge && <button type="button" disabled={busy || logoutFailed} className="block underline" onClick={() => { authVersion.current++; setChallenge(null); setCode(''); setMessage(''); setError(''); }}>Request a new code or change email</button>}
    </form> : <>
      <header className="mb-5 rounded-2xl bg-emerald-900 p-6 text-white sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-200">Customer portal</p>
        <h1 className="mt-2 break-words text-3xl font-bold sm:text-4xl">{portalName(selectedAccount) ? `Welcome, ${portalName(selectedAccount)}` : 'Welcome to your portal'}</h1>
        {Array.isArray(selectedAccount?.customerNames) && selectedAccount.customerNames.length > 1 && <p className="mt-2 break-words text-lg font-semibold text-emerald-100">Names on this provider account: {selectedAccount.customerNames.join(' · ')}</p>}
        {portalQuery.data?.loginEmail && <p className="mt-3 break-all text-sm text-emerald-100">Verified sign-in email: {portalQuery.data.loginEmail}</p>}
      </header>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 rounded-2xl border bg-white p-5 shadow-sm">
        <label className="min-w-0 flex-1 font-semibold sm:max-w-lg">Service provider
          <SelectControl className="mt-2 block w-full rounded border-emerald-400 font-normal" value={selectedId} disabled={busy || !accounts.length} onChange={chooseProvider} aria-describedby="portal-provider-help">{!accounts.length && <option value="">{busy ? 'Loading providers…' : 'No available providers'}</option>}{accounts.map(account => <option key={account.id} value={account.id}>{account.companyName}</option>)}</SelectControl>
        </label>
        <button type="button" className="text-primary-700 underline" disabled={busy} onClick={async () => { if (await confirmDiscard()) load(); }}>{busy ? 'Refreshing…' : 'Refresh visits and invoices'}</button>
        <p id="portal-provider-help" className="w-full text-sm text-gray-600">Showing only {selectedAccount?.companyName || 'your selected provider'} records. Switching providers closes open files, review drafts, and payment details.</p>
      </div>
      <section className="mb-5 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Connect another provider</h2><p className="text-sm text-gray-600">Add a provider with its personal, single-use invitation.</p></div><button type="button" aria-expanded={connectOpen} aria-controls="portal-connect-form" className="rounded-lg bg-primary-700 px-4 py-2 font-semibold text-white" onClick={() => setConnectOpen(open => !open)}>{connectOpen ? 'Hide invitation form' : 'Connect provider'}</button></div>
        {connectOpen && <div id="portal-connect-form" className="mt-4 border-t pt-4"><p className="mb-3 text-sm text-gray-600">Ask your provider to send a separate “Connect your Route Logistics service provider” invitation. Verify your sign-in email, then claim that link within seven days. A sign-in code is not an invitation.</p>{pendingInvite ? <p>Invitation link ready. Connect it while signed in with the invited email.</p> : <label className="block text-sm">Provider invitation link<input className="mt-1 block w-full rounded border-gray-300" value={inviteLink} onChange={event => setInviteLink(event.target.value)} placeholder="Paste your invitation link" autoComplete="off" /></label>}<button type="button" className="mt-3 rounded bg-primary-700 px-4 py-2 text-white disabled:opacity-50" disabled={busy || (!pendingInvite && !inviteLink.trim())} onClick={connectProvider}>Connect provider</button></div>}
      </section>
      {busy && <p role="status" className="py-4 text-gray-600">Loading your authorized providers and service records…</p>}
      {!busy && !accounts.length && !error && <p>No providers are connected yet. Ask your provider for an invitation link.</p>}
      {selectedAccounts.map((account) => <section key={`${user.uid}:${account.id}`} aria-label="Selected provider records" className="mb-6 rounded-xl border bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-primary-700">Selected provider</p><h2 className="break-words text-xl font-bold">{account.companyName}</h2></div><button type="button" className="text-sm text-primary-700 underline" onClick={disconnectProvider}>Disconnect provider</button></div>
        {account.contactEmail && <p className="mt-2 break-all text-sm text-gray-600">Provider contact: {account.contactEmail}</p>}
        {account.duplicateCustomerCount > 0 && <p className="mt-2 text-sm text-gray-500">Matching customer records have been combined for this provider.</p>}
        <section aria-label="Portal overview" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border p-4" style={{ background: 'var(--rl-accent-soft)', borderColor: 'var(--rl-accent-border)' }}><h3 className="font-semibold">Upcoming appointments</h3>{upcomingJobs.length ? <p className="mt-2 text-sm">{upcomingJobs.length} upcoming · Next: {upcomingJobs[0].serviceType} on {upcomingJobs[0].date}</p> : <p className="mt-2 text-sm">No upcoming appointments for this {selectedProperty ? 'property' : 'provider'}.</p>}</div>
          <div className="rounded-xl border p-4"><h3 className="font-semibold">Service properties</h3><p className="mt-2 text-sm text-gray-600">{account.properties?.length ? `${account.properties.length} saved ${account.properties.length === 1 ? 'property' : 'properties'} · ${account.properties[0].label}: ${account.properties[0].address}` : 'No service properties yet.'}</p></div>
          <div className="rounded-xl border p-4"><h3 className="font-semibold">Recent service history</h3><p className="mt-2 text-sm text-gray-600">{recentJobs.length ? `Latest: ${recentJobs[0].serviceType} · ${recentJobs[0].date}` : 'No completed visits yet.'}</p></div>
          <div className="rounded-xl border p-4"><h3 className="font-semibold">Shared documents</h3><p className="mt-2 text-sm text-gray-600">{sharedFiles.length ? `${sharedFiles.length} shared ${sharedFiles.length === 1 ? 'file' : 'files'} · ${sharedFiles[0].caption || sharedFiles[0].name || 'Service file'}` : 'No photos or documents shared yet.'}</p></div>
          <div className="rounded-xl border p-4"><h3 className="font-semibold">Reviews and feedback</h3><p className="mt-2 text-sm text-gray-600">Review eligible visits and see your submitted feedback below.</p></div>
        </section>
        <h3 className="mb-3 mt-6 font-semibold">Service properties</h3>
        <p className="mb-2 text-sm text-gray-600">Choose a property to filter visits for this provider.</p>
        {account.properties?.length ? <SelectControl aria-label="Service property" className="block w-full max-w-xl rounded border-emerald-400" value={propertyKey} onChange={event => { setPropertyKey(event.target.value); clearDetails(); }}><option value="">All properties</option>{account.properties.map(property => <option key={`${property.customerId}:${property.id}`} value={`${property.customerId}:${property.id}`}>{property.label} · {property.address}{property.unit ? `, ${property.unit}` : ''}</option>)}</SelectControl> : <p>No service property is recorded yet.</p>}
        <h3 className="mb-3 mt-5 font-semibold">Service visits</h3>
        {displayedJobs.length ? <ul className="divide-y">{displayedJobs.map((job) => <li key={job.id} className="flex flex-wrap justify-between gap-2 py-3"><span>{job.serviceType} · {job.date} {job.time}</span><span className="capitalize">{job.status.replace('-', ' ')}</span></li>)}</ul> : <p>No visits for this property yet.</p>}
        <div id="portal-reviews"><CustomerReviews accountId={account.id} userId={user.uid} /></div>
        <h3 className="mb-3 mt-6 font-semibold">Photos and documents</h3>
        {sharedFiles.length ? <ul className="grid gap-3 sm:grid-cols-2">{sharedFiles.map(item => <li key={`${item.kind}:${item.id}`} className="min-w-0 rounded-lg border p-4"><p className="break-words text-sm">{item.caption || item.name || (item.kind === 'photo' ? 'Service photo' : 'Service document')}</p><button type="button" className="mt-3 text-sm font-semibold text-primary-700 underline" disabled={currentFile?.loading && currentFile.item.id === item.id} onClick={() => readFile(item)}>{item.kind === 'photo' ? 'View photo' : 'Open document'}</button></li>)}</ul> : <p className="text-gray-600">No photos or documents have been shared for this {selectedProperty ? 'property' : 'provider'} yet.</p>}
        {currentFile && <section aria-label="Shared file preview" className="mt-5 space-y-4 rounded-xl border border-primary-200 bg-primary-50 p-5"><div className="flex items-start justify-between gap-4"><h4 className="break-words font-semibold">{currentFile.item.caption || currentFile.item.name || 'Shared service file'}</h4><button type="button" className="text-sm text-primary-700 underline" onClick={() => { fileVersion.current++; setFileView(null); }}>Close file</button></div>{currentFile.loading ? <p role="status">Loading shared file…</p> : currentFile.error ? <><p role="alert" className="text-red-700">{currentFile.error}</p><button type="button" className="underline" onClick={() => readFile(currentFile.item)}>Retry file</button></> : currentFile.data?.contentType === 'application/pdf' ? <a className="font-semibold text-primary-700 underline" href={currentFile.data.dataUri} download={String(currentFile.data.name || 'Service document').replace(/[^a-zA-Z0-9 ._-]/g, '').slice(0, 160).replace(/\.pdf$/i, '') + '.pdf'}>Download PDF document</a> : currentFile.data ? <img className="max-h-[32rem] max-w-full rounded-lg object-contain" src={currentFile.data.dataUri} alt={currentFile.item.caption || currentFile.data.name || 'Shared service visit photo'} /> : null}</section>}
        <h3 className="mb-3 mt-6 font-semibold">Invoices</h3>
        {account.invoices.length ? account.invoices.map(invoice => <PortalInvoice key={`${account.id}:${invoice.id}`} invoice={invoice} onPdf={() => readInvoicePdf(account.id, invoice)} />) : <p>No issued invoices yet.</p>}
        {account.hasMore && <p className="mt-3 text-sm">Showing the latest 50 visits and invoices. Contact your provider for older records.</p>}
      </section>)}
      {hasMore && <p>Showing up to 25 service accounts. Contact your provider for additional records.</p>}
    </>}
    {message && <p role="status" className="mt-4">{message}</p>}
    {(error || portalQuery.error) && <p role="alert" className="mt-4 text-red-700">{error || portalQuery.error.message}</p>}
    {user && paymentsConfigured && selectedAccounts.some((a) => a.invoices.some((i) => i.status === 'sent' && i.total >= 0.5)) && <section className="mt-6 rounded-xl border bg-white p-5"><h2 className="font-semibold">{paymentMode === 'test' ? 'Test card payments' : 'Secure card payments'}</h2><p className="mb-3 text-sm">{paymentMode === 'test' ? 'No real money is collected. Invoice balances remain unchanged.' : 'Choose an invoice to pay securely through Stripe.'}</p>{selectedAccounts.flatMap((a) => a.invoices.filter((i) => i.status === 'sent' && i.total >= 0.5).map((invoice) => <button type="button" className="mr-3 text-primary-700 underline" key={invoice.id} onClick={() => setPaymentInvoice({ accountId: a.id, invoiceId: invoice.id })}>{paymentMode === 'test' ? 'Test payment for' : 'Pay'} {invoice.invoiceNumber}</button>))}</section>}
    {activePayment && <InvoicePayment key={`${user.uid}:${selectedAccount.id}:${activePayment}`} invoiceId={activePayment} functionClient={portalFunctions} onClose={() => setPaymentInvoice(null)} onRefresh={() => { if (identity.current?.uid === user.uid && selection.current === paymentInvoice.accountId) load(); }} />}
  </main>;
}
