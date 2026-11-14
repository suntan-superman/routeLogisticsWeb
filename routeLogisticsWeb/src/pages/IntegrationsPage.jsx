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
function AccountingSelect({ id, label, options, value, onChange, disabled, unavailable }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState(''), [active, setActive] = useState(0);
  const list = useRef(null);
  const selected = options.find(option => option.id === value);
  const matches = options.filter(option => [option.name, option.qualifiedName, option.accountType, option.accountNumber, option.description].filter(Boolean).join(' ').toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  useEffect(() => { if (open) list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' }); }, [open, active, search]);
  const choose = option => { onChange(option.id); setOpen(false); setSearch(''); setActive(0); };
  return <div className="relative space-y-1" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label className="block font-medium" htmlFor={id}>{label}</label>
    <input id={id} className="input-field w-full" role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open && !disabled} aria-controls={`${id}-options`} aria-activedescendant={open && matches[active] ? `${id}-option-${active}` : undefined} aria-invalid={unavailable || undefined} autoComplete="off" disabled={disabled}
      placeholder={unavailable ? 'Saved selection is unavailable' : 'Search and select…'} value={open ? search : selected?.qualifiedName || selected?.name || ''}
      onFocus={() => { setOpen(true); setSearch(''); setActive(0); }} onChange={event => { setSearch(event.target.value); setOpen(true); setActive(0); }}
      onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'Tab') { setOpen(false); return; }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (!open) { setOpen(true); setSearch(''); setActive(0); } else setActive(index => Math.max(0, Math.min(matches.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))); }
        if (event.key === 'Enter' && open) { event.preventDefault(); if (matches[active]) choose(matches[active]); }
      }} />
    {open && !disabled && <ul ref={list} id={`${id}-options`} role="listbox" aria-label={`${label} options`} className="absolute z-20 max-h-64 w-full overflow-auto rounded-lg border bg-white shadow-lg">
      {!matches.length && <li role="status" className="p-3 text-gray-600">No matching options.</li>}
      {matches.map((option, index) => <li key={option.id} role="presentation"><button id={`${id}-option-${index}`} role="option" aria-selected={value === option.id} type="button" className={`w-full p-3 text-left hover:bg-emerald-50 ${active === index ? 'bg-emerald-50' : ''}`} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(option)}>
        <span className="block font-medium">{option.qualifiedName || option.name}</span><span className="block text-sm text-gray-600">{[option.accountType, option.accountNumber ? `Account ${option.accountNumber}` : '', option.description].filter(Boolean).join(' · ')}</span>
      </button></li>)}
    </ul>}
  </div>;
}
export default function IntegrationsPage() {
  useAuth(); // Subscribe to identity, company and membership changes.
  const claims = getClaims(), permitted = can('integrations.read');
  if (!permitted || !claims?.companyId) return <p>Company integrations require an active company owner or administrator account.</p>;
  return <IntegrationsWorkspace key={currentScope()} scopeKey={currentScope()} owner={claims.role === 'owner'} />;
}
function IntegrationsWorkspace({ scopeKey, owner }) {
  const [status, setStatus] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [type, setType] = useState('Customer'), [records, setRecords] = useState([]), [localId, setLocalId] = useState(''), [remoteId, setRemoteId] = useState(''), [preview, setPreview] = useState(null), [account, setAccount] = useState(''), [item, setItem] = useState('');
  const [notice, setNotice] = useState('');
  const [options, setOptions] = useState(null), [optionsLoading, setOptionsLoading] = useState(false), [optionsError, setOptionsError] = useState('');
  const mounted = useRef(false), locked = useRef(false);
  const optionsRequest = useRef(0), loadedConnection = useRef(null), defaultsDirty = useRef(false), activeConnection = useRef(null);
  const connectionKey = status?.connected ? status.connectionId || status.realmId : null;
  activeConnection.current = connectionKey;
  const confirm = useConfirm();
  const current = useCallback(() => mounted.current && scopeKey === currentScope() && can('integrations.read'), [scopeKey]);
  const invoke = useCallback(async (name, data = {}) => {
    if (!current()) throw new Error('Your company access changed. Reopen Integrations before continuing.');
    const result = await call(name, data);
    if (!current()) throw new Error('Your company access changed. Reopen Integrations before continuing.');
    return result;
  }, [current]);
  const load = useCallback(async () => { const value = await invoke('Status'); setStatus(value); return value; }, [invoke]);
  const loadOptions = useCallback(async () => {
    const connection = activeConnection.current, request = ++optionsRequest.current;
    if (!owner || !connection || !current()) return;
    setOptionsLoading(true); setOptionsError('');
    try {
      const value = await invoke('Options');
      if (!current() || request !== optionsRequest.current || connection !== activeConnection.current) return;
      if (!Array.isArray(value.accounts) || !Array.isArray(value.items)) throw new Error('QuickBooks returned incomplete accounting options. Refresh the available options to retry.');
      if (value.connectionId && value.connectionId !== connection) throw new Error('Your QuickBooks connection changed. Refresh connection status before selecting accounting defaults.');
      setOptions(value);
      if (loadedConnection.current !== connection || !defaultsDirty.current) { setAccount(value.incomeAccountId || ''); setItem(value.defaultItemId || ''); defaultsDirty.current = false; }
      loadedConnection.current = connection;
    } catch (error) { if (current() && request === optionsRequest.current && connection === activeConnection.current) setOptionsError(error.message || 'Unable to load QuickBooks accounting options. Retry or reconnect your company.'); }
    finally { if (current() && request === optionsRequest.current && connection === activeConnection.current) setOptionsLoading(false); }
  }, [current, invoke, owner]);
  useEffect(() => {
    mounted.current = true;
    const params = new URLSearchParams(window.location.search), code = params.get('qbError');
    if (code) { setError(oauthErrors[code] || oauthErrors.failed); params.delete('qbError'); window.history.replaceState(null, '', window.location.pathname + (params.size ? '?' + params.toString() : '') + window.location.hash); }
    load().catch(e => { if (current()) setError(e.message); });
    return () => { mounted.current = false; };
  }, [load, current]);
  useEffect(() => {
    if (!status?.disconnecting) return;
    const supplied = Number(status.disconnectRetryAfterMs);
    const delay = Number.isFinite(supplied) ? Math.max(0, Math.min(60000, supplied)) : 60000;
    const timer = setTimeout(() => {
      if (current()) load().catch(e => { if (current()) setError(e.message || 'Unable to refresh the QuickBooks connection. Refresh the status to retry.'); });
    }, delay);
    return () => clearTimeout(timer);
  }, [status?.disconnecting, status?.disconnectRetryAfterMs, load, current]);
  useEffect(() => {
    optionsRequest.current++; loadedConnection.current = null; defaultsDirty.current = false;
    setOptions(null); setOptionsError(''); setOptionsLoading(false); setAccount(''); setItem('');
    if (owner && connectionKey && !status?.reconnectRequired && !status?.credentialMismatch) loadOptions();
  }, [connectionKey, owner, status?.reconnectRequired, status?.credentialMismatch, loadOptions]);
  useEffect(() => { let active = true; setLocalId(''); setRemoteId(''); setPreview(null); setRecords([]); if (current()) getDocs(query(collection(db, collections[type]), scopeWhere(), limit(500))).then((snap) => { if (active && current()) setRecords(snap.docs.map((row) => ({ id: row.id, name: row.get('name') || row.get('invoiceNumber') || row.get('serviceType') || row.get('title') || 'Name not provided', legacyId: row.get('quickbooksCustomerId') || row.get('quickbooksId') || '' }))); }).catch((e) => { if (active && current()) setError(e.message); }); return () => { active = false; }; }, [type, current]);
  const run = async (action) => { if (locked.current || !current()) return; locked.current = true; setBusy(true); setError(''); setNotice(''); try { await action(); } catch (e) { if (current()) setError(e.message || 'The QuickBooks request failed. Retry or reconnect your company.'); } finally { locked.current = false; if (current()) setBusy(false); } };
  const selected = records.find((record) => record.id === localId);
  const accountAvailable = !!options?.accounts.some(option => option.id === account), itemAvailable = !!options?.items.some(option => option.id === item);
  const defaultsChanged = !!options && (account !== (options.incomeAccountId || '') || item !== (options.defaultItemId || ''));
  const defaultsUnavailable = busy || optionsLoading || !options || !!optionsError || status?.reconnectRequired || status?.credentialMismatch;
  return <div className="space-y-6 max-w-4xl"><h1 className="text-2xl font-bold">Company integrations</h1>{error && <p role="alert" className="text-red-700">{error}</p>}{notice && <p role="status">{notice}</p>}<section className="bg-white rounded-lg border p-6 space-y-4"><h2 className="text-xl font-semibold">QuickBooks Online</h2><p>{status?.connected ? `Connected to ${status.companyName || 'QuickBooks company'} (${status.realmId})` : 'Not connected'} · {status?.environment || 'sandbox'} · {status?.writesEnabled ? 'Accounting exports enabled' : 'Accounting exports disabled'}</p><p>Each company authorizes its own QuickBooks connection using platform-managed credentials.</p>{!status && <p>Loading connection status…</p>}<button className="btn-secondary" disabled={busy} onClick={() => run(load)}>Refresh connection status</button>{healthMessages[status?.health] && <p>{healthMessages[status.health]}</p>}{status?.credentialMismatch && <p className="text-amber-800">The platform accounting credentials changed. Reconnect your company before using QuickBooks.</p>}{status?.reconnectRequired && status?.health !== 'reconnect-required' && <p className="text-amber-800">Your QuickBooks authorization needs to be renewed. Use Reconnect to restore access.</p>}{status?.lastError && <p role="alert" className="text-amber-800">{status.lastError}</p>}{status?.disconnectWarning && <p className="text-amber-800">{status.disconnectWarning}</p>}{status?.disconnecting && <p>QuickBooks is disconnected locally. Reconnection is briefly paused while the previous revocation request settles; the status will refresh automatically.</p>}{owner && <div className="flex gap-3"><button className="btn-primary" disabled={busy || !status?.enabled || status?.disconnecting} onClick={() => run(async () => { const result = await invoke('Connect'); if (current()) window.location.assign(result.url); })}>{status?.connected || status?.reconnectRequired ? 'Reconnect' : 'Connect QuickBooks'}</button>{status?.connected && <button className="btn-secondary" disabled={busy || status?.disconnecting} onClick={() => run(async () => { if (await confirm({ title: 'Disconnect QuickBooks?', message: 'Sync will stop. Saved mappings and accounting records will be retained.' })) { const result = await invoke('Disconnect'), value = await load(), warning = result.warning || result.disconnectWarning; setNotice(warning && warning === value.disconnectWarning ? '' : warning || 'QuickBooks disconnected. Your company can reconnect when ready.'); } })}>Disconnect</button>}</div>}</section>
    {status?.connected && <><section aria-label="Accounting defaults" className="bg-white rounded-lg border p-6 space-y-4"><h2 className="text-lg font-semibold">Accounting defaults</h2><p>Select the existing QuickBooks income account and service item used for invoice lines without a specific service mapping. This saves your company preferences without changing QuickBooks records.</p>
      {!owner ? <><p>Only the company owner can change accounting defaults.</p><p>Default income account: {status.incomeAccountName || (status.incomeAccountId ? 'Selection needs owner review' : 'Not selected')}</p><p>Default service item: {status.defaultItemName || (status.defaultItemId ? 'Selection needs owner review' : 'Not selected')}</p></> : <>
        <button className="btn-secondary" disabled={busy || optionsLoading || status.reconnectRequired || status.credentialMismatch} onClick={loadOptions}>Refresh available options</button>
        {optionsLoading && <p role="status">Loading accounts and service items from your connected QuickBooks company…</p>}
        {optionsError && <p role="alert" className="text-red-700">{optionsError} Refresh available options to retry, or use Reconnect if authorization has expired.</p>}
        {(status.reconnectRequired || status.credentialMismatch) && <p role="alert">Reconnect QuickBooks before loading accounting options.</p>}
        {options && !optionsLoading && !optionsError && !options.accounts.length && <p>No active income accounts are available. Add an income account in QuickBooks, then refresh available options.</p>}
        {options && !optionsLoading && !optionsError && !options.items.length && <p>No active service items are available. Create a service item in QuickBooks, then choose Refresh available options.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <AccountingSelect id="qb-default-income-account" label="Default income account" options={options?.accounts || []} value={account} onChange={value => { defaultsDirty.current = true; setAccount(value); }} disabled={defaultsUnavailable || !options?.accounts.length} unavailable={!!options && !!account && !accountAvailable} />
          <AccountingSelect id="qb-default-service-item" label="Default service item" options={options?.items || []} value={item} onChange={value => { defaultsDirty.current = true; setItem(value); }} disabled={defaultsUnavailable || !options?.items.length} unavailable={!!options && !!item && !itemAvailable} />
        </div>
        {options && account && !accountAvailable && <p role="alert" className="text-amber-800">The saved income account is no longer available. Select an active income account before saving.</p>}
        {options && item && !itemAvailable && <p role="alert" className="text-amber-800">The saved service item is no longer available. Select an active service item before saving.</p>}
        <button className="btn-primary" disabled={defaultsUnavailable || !accountAvailable || !itemAvailable || !defaultsChanged} onClick={() => run(async () => {
          const incomeAccountId = account, defaultItemId = item, connectionId = options.connectionId, connection = activeConnection.current;
          await invoke('Settings', { incomeAccountId, defaultItemId, connectionId });
          if (!current() || connection !== activeConnection.current) return;
          defaultsDirty.current = false; setOptions(value => ({ ...value, incomeAccountId, defaultItemId }));
          setNotice('Accounting defaults saved. No QuickBooks records were changed.'); await load();
        })}>Save defaults</button>
      </>}
    </section>
    <section className="bg-white rounded-lg border p-6 space-y-4"><h2 className="text-lg font-semibold">Record mapping and review</h2><select aria-label="Record type" value={type} onChange={(e) => setType(e.target.value)}>{Object.keys(collections).map((value) => <option key={value}>{value}</option>)}</select><select className="ml-3 max-w-full" aria-label="Route Logistics record" value={localId} onChange={(e) => { setLocalId(e.target.value); setPreview(null); }}>{[<option key="" value="">Select a record (up to 500 shown)</option>, ...records.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)]}</select>{selected?.legacyId && <p>Legacy accounting reference: {selected.legacyId}. Verify this reference against the connected company before adopting it.</p>}
    <div className="flex gap-3 flex-wrap"><input aria-label="Existing QuickBooks record ID" placeholder="Existing QuickBooks record ID" value={remoteId} onChange={(e) => setRemoteId(e.target.value)} /><button className="btn-secondary" disabled={busy || !localId || !remoteId || !owner} onClick={() => run(async () => { if (await confirm({ title: 'Adopt this accounting record?', message: 'Confirm that this is the same customer, service or invoice in the connected QuickBooks company. This saves a mapping without changing QuickBooks.' })) { await invoke('Adopt', { type, localId, remoteId }); setPreview(null); await load(); } })}>Adopt existing record</button><button className="btn-secondary" disabled={busy || !localId} onClick={() => run(async () => setPreview(await invoke('Preview', { type, localId })))}>Preview export</button>{type === 'Invoice' && <button className="btn-secondary" disabled={busy || !localId} onClick={() => run(async () => { await invoke('Reconcile', { localId }); await load(); })}>Check payment balance</button>}</div>
    {preview && <div><p>{preview.action} · {preview.environment}</p><pre className="overflow-auto bg-gray-50 p-4">{JSON.stringify(preview.payload, null, 2)}</pre><button className="btn-primary" disabled={busy || !status.writesEnabled || !owner} onClick={() => run(async () => { if (await confirm({ title: 'Export to QuickBooks?', message: `This will ${preview.action} this accounting record in ${preview.environment}.` })) { await invoke('Sync', { type, localId, fingerprint: preview.fingerprint }); setPreview(null); await load(); } })}>Export reviewed record</button></div>}</section>
    <section className="bg-white rounded-lg border p-6"><h2 className="font-semibold">Saved mappings</h2><div className="overflow-auto"><table className="w-full text-left"><thead><tr><th>Record</th><th>QuickBooks ID</th><th>Status</th><th>Last export</th></tr></thead><tbody>{status.mappings.map((row) => <tr key={`${row.type}:${row.localId}`}><td>{row.type} · {records.find((record) => record.id === row.localId)?.name || row.localId}</td><td>{row.remoteId}</td><td>{row.status}</td><td>{row.lastSyncedAt ? new Date(row.lastSyncedAt).toLocaleString() : '—'}</td></tr>)}</tbody></table></div></section></>}
    {status && <section className="space-y-3 rounded border bg-white p-6"><h2 className="text-lg font-semibold">Accounting connection health</h2><p>{status.health?.replaceAll('-', ' ')}</p>{status.refreshExpiresAt && <p>Reconnect by {new Date(status.refreshExpiresAt).toLocaleString()}.</p>}{status.environment === 'production' && !status.productionApproved && <p>Production accounting synchronization awaits operator approval.</p>}<h3 className="font-semibold">Recent synchronization operations</h3>{!(status.operations || []).length && <p>No operations recorded.</p>}{(status.operations || []).map(row => <p key={row.id}>{row.type} · {row.localId} · {row.status}{row.error ? ` · ${row.error}` : ''}</p>)}<h3 className="font-semibold">Webhook processing</h3>{(status.webhookEvents || []).map(row => <p key={row.id}>{row.type} · {row.status}{row.error ? ` · ${row.error}` : ''}</p>)}</section>}
    <PaymentReadiness /><SmsSettings />
  </div>;
}
