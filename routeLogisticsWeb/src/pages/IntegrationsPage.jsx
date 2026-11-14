import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { auth, db, functions } from '../services/firebase';
import { scopeWhere, can, getClaims } from '../services/tenancy';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../components/ConfirmProvider';
import SmsSettings from '../components/SmsSettings';
import PaymentReadiness from '../components/PaymentReadiness';
const collections = { Customer: 'customers', Item: 'estimateTemplates', Invoice: 'invoices' };
const call = async (name, data = {}) => (await httpsCallable(functions, `rlQuickBooks${name}`)(data)).data;
const currentScope = () => { const claims = getClaims(); return JSON.stringify([auth.currentUser?.uid, claims?.companyId, claims?.membershipId, claims?.role]); };
const oauthErrors = {
  cancelled: 'QuickBooks authorization was cancelled. Your company can try connecting again.',
  failed: 'QuickBooks authorization could not be completed. Try connecting again; if it continues, contact support.',
  expired: 'The QuickBooks authorization link expired. Start Connect or Reconnect again.',
  'owner-changed': 'Company ownership changed during authorization. The current company owner must connect QuickBooks.',
  'realm-in-use': 'That QuickBooks company is already linked to another Route Logistics company. Choose the correct QuickBooks company or contact support.',
  'company-mismatch': 'The selected QuickBooks company differs from the company linked to your saved mappings. Reconnect the original company or contact support for mapping review.',
  'reconnect-required': 'QuickBooks authorization needs to be renewed. Use Reconnect to authorize your company again.',
  'credentials-changed': 'Platform accounting credentials changed during authorization. Start Connect or Reconnect again.',
  superseded: 'A newer connection request replaced this authorization link. Use the most recent request or start again.',
};
const healthMessages = {
  disabled: 'QuickBooks is awaiting platform configuration. Your company does not need individual developer credentials.',
  'awaiting-production-approval': 'Production accounting synchronization is awaiting platform approval.',
  disconnected: 'The company owner can connect this workspace to its own QuickBooks company.',
  'reconnect-required': 'Authorization has expired or been revoked. The company owner can use Reconnect to restore access.',
  'refresh-needed': 'Access refreshes automatically on the next QuickBooks request. If access cannot be renewed, use Reconnect.',
};
export default function IntegrationsPage() {
  useAuth(); // Subscribe to identity, company and membership changes.
  const claims = getClaims(), permitted = can('integrations.read');
  if (!permitted || !claims?.companyId) return <p>Company integrations require an active company owner or administrator account.</p>;
  return <IntegrationsWorkspace key={currentScope()} scopeKey={currentScope()} owner={claims.role === 'owner'} />;
}
function IntegrationsWorkspace({ scopeKey, owner }) {
  const [status, setStatus] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [type, setType] = useState('Customer'), [records, setRecords] = useState([]), [localId, setLocalId] = useState(''), [remoteId, setRemoteId] = useState(''), [preview, setPreview] = useState(null), [account, setAccount] = useState(''), [item, setItem] = useState('');
  const [notice, setNotice] = useState('');
  const mounted = useRef(false), locked = useRef(false);
  const confirm = useConfirm();
  const current = useCallback(() => mounted.current && scopeKey === currentScope() && can('integrations.read'), [scopeKey]);
  const invoke = useCallback(async (name, data = {}) => {
    if (!current()) throw new Error('Your company access changed. Reopen Integrations before continuing.');
    const result = await call(name, data);
    if (!current()) throw new Error('Your company access changed. Reopen Integrations before continuing.');
    return result;
  }, [current]);
  const load = useCallback(async () => { const value = await invoke('Status'); setStatus(value); setAccount(value.incomeAccountId || ''); setItem(value.defaultItemId || ''); }, [invoke]);
  useEffect(() => {
    mounted.current = true;
    const params = new URLSearchParams(window.location.search), code = params.get('qbError');
    if (code) { setError(oauthErrors[code] || oauthErrors.failed); params.delete('qbError'); window.history.replaceState(null, '', window.location.pathname + (params.size ? '?' + params.toString() : '') + window.location.hash); }
    load().catch(e => { if (current()) setError(e.message); });
    return () => { mounted.current = false; };
  }, [load, current]);
  useEffect(() => { let active = true; setLocalId(''); setRemoteId(''); setPreview(null); setRecords([]); if (current()) getDocs(query(collection(db, collections[type]), scopeWhere(), limit(500))).then((snap) => { if (active && current()) setRecords(snap.docs.map((row) => ({ id: row.id, name: row.get('name') || row.get('invoiceNumber') || row.get('serviceType') || row.get('title') || 'Name not provided', legacyId: row.get('quickbooksCustomerId') || row.get('quickbooksId') || '' }))); }).catch((e) => { if (active && current()) setError(e.message); }); return () => { active = false; }; }, [type, current]);
  const run = async (action) => { if (locked.current || !current()) return; locked.current = true; setBusy(true); setError(''); setNotice(''); try { await action(); } catch (e) { if (current()) setError(e.message || 'The QuickBooks request failed. Retry or reconnect your company.'); } finally { locked.current = false; if (current()) setBusy(false); } };
  const selected = records.find((record) => record.id === localId);
  return <div className="space-y-6 max-w-4xl"><h1 className="text-2xl font-bold">Company integrations</h1>{error && <p role="alert" className="text-red-700">{error}</p>}{notice && <p role="status">{notice}</p>}<section className="bg-white rounded-lg border p-6 space-y-4"><h2 className="text-xl font-semibold">QuickBooks Online</h2><p>{status?.connected ? `Connected to ${status.companyName || 'QuickBooks company'} (${status.realmId})` : 'Not connected'} · {status?.environment || 'sandbox'} · {status?.writesEnabled ? 'Accounting exports enabled' : 'Accounting exports disabled'}</p><p>Each company authorizes its own QuickBooks connection using platform-managed credentials.</p>{!status && <p>Loading connection status…</p>}<button className="btn-secondary" disabled={busy} onClick={() => run(load)}>Refresh connection status</button>{healthMessages[status?.health] && <p>{healthMessages[status.health]}</p>}{status?.credentialMismatch && <p className="text-amber-800">The platform accounting credentials changed. Reconnect your company before using QuickBooks.</p>}{status?.reconnectRequired && status?.health !== 'reconnect-required' && <p className="text-amber-800">Your QuickBooks authorization needs to be renewed. Use Reconnect to restore access.</p>}{status?.lastError && <p role="alert" className="text-amber-800">{status.lastError}</p>}{status?.disconnectWarning && <p className="text-amber-800">{status.disconnectWarning}</p>}{status?.disconnecting && <p>QuickBooks is finishing a disconnect. Refresh the status before reconnecting.</p>}{owner && <div className="flex gap-3"><button className="btn-primary" disabled={busy || !status?.enabled || status?.disconnecting} onClick={() => run(async () => { const result = await invoke('Connect'); if (current()) window.location.assign(result.url); })}>{status?.connected || status?.reconnectRequired ? 'Reconnect' : 'Connect QuickBooks'}</button>{status?.connected && <button className="btn-secondary" disabled={busy || status?.disconnecting} onClick={() => run(async () => { if (await confirm({ title: 'Disconnect QuickBooks?', message: 'Sync will stop. Saved mappings and accounting records will be retained.' })) { const result = await invoke('Disconnect'); await load(); setNotice(result.warning || result.disconnectWarning || 'QuickBooks disconnected. Your company can reconnect when ready.'); } })}>Disconnect</button>}</div>}</section>
    {status?.connected && <><section className="bg-white rounded-lg border p-6 space-y-4"><h2 className="text-lg font-semibold">Accounting defaults</h2><p>Select the existing QuickBooks income account and service item used for invoice lines without a specific service mapping.</p><label className="block">Income account ID<input className="input-field ml-3" value={account} onChange={(e) => setAccount(e.target.value)} /></label><label className="block">Default service item ID<input className="input-field ml-3" value={item} onChange={(e) => setItem(e.target.value)} /></label><button className="btn-secondary" disabled={busy || !owner} onClick={() => run(async () => { await invoke('Settings', { incomeAccountId: account, defaultItemId: item }); await load(); })}>Save defaults</button></section>
    <section className="bg-white rounded-lg border p-6 space-y-4"><h2 className="text-lg font-semibold">Record mapping and review</h2><select aria-label="Record type" value={type} onChange={(e) => setType(e.target.value)}>{Object.keys(collections).map((value) => <option key={value}>{value}</option>)}</select><select className="ml-3 max-w-full" aria-label="Route Logistics record" value={localId} onChange={(e) => { setLocalId(e.target.value); setPreview(null); }}>{[<option key="" value="">Select a record (up to 500 shown)</option>, ...records.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)]}</select>{selected?.legacyId && <p>Legacy accounting reference: {selected.legacyId}. Verify this reference against the connected company before adopting it.</p>}
    <div className="flex gap-3 flex-wrap"><input aria-label="Existing QuickBooks record ID" placeholder="Existing QuickBooks record ID" value={remoteId} onChange={(e) => setRemoteId(e.target.value)} /><button className="btn-secondary" disabled={busy || !localId || !remoteId || !owner} onClick={() => run(async () => { if (await confirm({ title: 'Adopt this accounting record?', message: 'Confirm that this is the same customer, service or invoice in the connected QuickBooks company. This saves a mapping without changing QuickBooks.' })) { await invoke('Adopt', { type, localId, remoteId }); setPreview(null); await load(); } })}>Adopt existing record</button><button className="btn-secondary" disabled={busy || !localId} onClick={() => run(async () => setPreview(await invoke('Preview', { type, localId })))}>Preview export</button>{type === 'Invoice' && <button className="btn-secondary" disabled={busy || !localId} onClick={() => run(async () => { await invoke('Reconcile', { localId }); await load(); })}>Check payment balance</button>}</div>
    {preview && <div><p>{preview.action} · {preview.environment}</p><pre className="overflow-auto bg-gray-50 p-4">{JSON.stringify(preview.payload, null, 2)}</pre><button className="btn-primary" disabled={busy || !status.writesEnabled || !owner} onClick={() => run(async () => { if (await confirm({ title: 'Export to QuickBooks?', message: `This will ${preview.action} this accounting record in ${preview.environment}.` })) { await invoke('Sync', { type, localId, fingerprint: preview.fingerprint }); setPreview(null); await load(); } })}>Export reviewed record</button></div>}</section>
    <section className="bg-white rounded-lg border p-6"><h2 className="font-semibold">Saved mappings</h2><div className="overflow-auto"><table className="w-full text-left"><thead><tr><th>Record</th><th>QuickBooks ID</th><th>Status</th><th>Last export</th></tr></thead><tbody>{status.mappings.map((row) => <tr key={`${row.type}:${row.localId}`}><td>{row.type} · {records.find((record) => record.id === row.localId)?.name || row.localId}</td><td>{row.remoteId}</td><td>{row.status}</td><td>{row.lastSyncedAt ? new Date(row.lastSyncedAt).toLocaleString() : '—'}</td></tr>)}</tbody></table></div></section></>}
    {status && <section className="space-y-3 rounded border bg-white p-6"><h2 className="text-lg font-semibold">Accounting connection health</h2><p>{status.health?.replaceAll('-', ' ')}</p>{status.refreshExpiresAt && <p>Reconnect by {new Date(status.refreshExpiresAt).toLocaleString()}.</p>}{status.environment === 'production' && !status.productionApproved && <p>Production accounting synchronization awaits operator approval.</p>}<h3 className="font-semibold">Recent synchronization operations</h3>{!(status.operations || []).length && <p>No operations recorded.</p>}{(status.operations || []).map(row => <p key={row.id}>{row.type} · {row.localId} · {row.status}{row.error ? ` · ${row.error}` : ''}</p>)}<h3 className="font-semibold">Webhook processing</h3>{(status.webhookEvents || []).map(row => <p key={row.id}>{row.type} · {row.status}{row.error ? ` · ${row.error}` : ''}</p>)}</section>}
    <PaymentReadiness /><SmsSettings />
  </div>;
}
