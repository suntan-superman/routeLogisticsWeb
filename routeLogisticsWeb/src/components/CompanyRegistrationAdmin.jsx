import { useEffect, useState } from 'react';
import { callWorkspace } from '../services/workspaceApi';
import SelectControl from './SelectControl';
const registration = data => callWorkspace('rlCompanyRegistration', data);

export default function CompanyRegistrationAdmin() {
  const [data, setData] = useState(null);
  const [mode, setMode] = useState('approval_required');
  const [email, setEmail] = useState('');
  const [issuedLink, setIssuedLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const result = await registration({ action: 'admin' });
    setData(result); setMode(result.mode); setError('');
  };
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  const run = async (action, payload) => {
    setBusy(true); setError('');
    try {
      const result = await registration({ action, ...payload });
      if (action === 'issue') { setIssuedLink(result.link); setEmail(''); }
      await load();
    } catch (e) { setError(e.message || 'Could not update company registration.'); }
    finally { setBusy(false); }
  };
  const savePolicy = () => {
    if (!window.confirm(`Set company registration to ${mode.replace('_', ' ')}? Existing companies and invitations remain available.`)) return;
    run('policy', { mode, confirm: mode, expectedRevision: data?.revision || 0 });
  };
  return <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
    <div><h2 className="text-xl font-semibold">Company registration</h2><p className="text-sm text-gray-600">Only verified platform administrators can issue company authorizations. New registration is closed if this policy is missing or unreadable.</p></div>
    <div className="flex flex-wrap items-end gap-3"><label className="block">Registration policy<SelectControl className="input-field mt-1 block" value={mode} onChange={e => setMode(e.target.value)}><option value="approval_required">Approval required</option><option value="open">Open</option><option value="closed">Closed</option></SelectControl></label><button className="btn-primary" disabled={busy || !data || data.configured && data.mode === mode} onClick={savePolicy}>Save policy</button><button className="btn-secondary" disabled={busy} onClick={() => load().catch(e => setError(e.message))}>Refresh</button></div>
    {data && <p role="status">Current policy: <strong>{data.mode.replace('_', ' ')}</strong>{!data.configured && ' (not configured; creation fails closed)'}</p>}
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); run('issue', { email }); }}><label className="block">Verified recipient email<input className="input-field mt-1 block" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><button className="btn-primary" disabled={busy || data?.mode !== 'approval_required'}>Issue single-use link</button></form>
    {issuedLink && <div role="status" className="rounded-lg border border-primary-200 p-3"><p>Copy this link now and deliver it privately to the named recipient. It will not be shown again.</p><button className="btn-secondary mt-2" onClick={() => navigator.clipboard.writeText(issuedLink).catch(() => setError('Copy failed. Select and copy the link manually.'))}>Copy link</button><input className="input-field mt-2 w-full" readOnly value={issuedLink} aria-label="New company authorization link" /></div>}
    <div><h3 className="font-semibold">Outstanding authorizations</h3>{!data?.outstanding?.length && <p className="text-sm text-gray-600">None.</p>}{data?.outstanding?.map(row => <div key={row.id} className="flex flex-wrap items-center gap-3 border-b py-2"><span>{row.email} · {row.status} · expires {new Date(row.expiresAt).toLocaleString()}</span><button className="btn-secondary" disabled={busy} onClick={() => window.confirm(`Revoke authorization for ${row.email}?`) && run('revoke', { id: row.id })}>Revoke</button></div>)}</div>
    <div><h3 className="font-semibold">Recent history</h3>{!data?.history?.length && <p className="text-sm text-gray-600">No policy or authorization changes.</p>}{data?.history?.map(row => <p key={row.id} className="border-b py-1 text-sm">{row.action} · {row.email || row.companyId || row.authorizationId || ''} · {row.createdAt}</p>)}</div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </section>;
}
