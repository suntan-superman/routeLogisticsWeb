import { useRef, useState } from 'react';
import { usePrincipalQuery } from '../hooks/usePrincipalQuery';
import { useConfirmUnsavedChanges, useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { auth } from '../services/firebase';
import { callWorkspace } from '../services/workspaceApi';
import { workspaceAccessError } from '../services/workspaceQueryPolicy';
import { readableDate } from '../utils/platformContent';
import SelectControl from './SelectControl';

const statusLabels = {
  unassigned: 'Unassigned', trial: 'Trial', active: 'Active', paused: 'Paused', canceled: 'Canceled', expired: 'Expired',
};
const fieldClass = 'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:ring-2 focus:ring-primary-500';
const current = uid => auth.currentUser?.uid === uid && auth.currentUser.emailVerified === true;
const call = (action, data) => callWorkspace('rlPlatformSubscriptions', { action, ...data });
const editValues = ({ plan, status, endDate }) => ({ plan, status: status === 'unassigned' ? '' : status, endDate });

export default function PlatformSubscriptions({ uid }) {
  const [cursors, setCursors] = useState([null]);
  const [companyId, setCompanyId] = useState('');
  const cursor = cursors.at(-1);
  const confirmDiscard = useConfirmUnsavedChanges('platform-subscription');
  const list = usePrincipalQuery('rl-subscription-list', uid, [cursor], () => call('list', { cursor }), { current, intervalMs: false });
  const detail = usePrincipalQuery('rl-subscription-detail', uid, [companyId], () => call('get', { companyId }), { current, enabled: !!companyId, intervalMs: false });
  const choose = async id => {
    if (id !== companyId && await confirmDiscard()) setCompanyId(id);
  };
  const page = async next => {
    const nextCursor = list.data?.nextCursor;
    if (!(await confirmDiscard())) return;
    setCompanyId('');
    setCursors(next ? [...cursors, nextCursor] : cursors.slice(0, -1));
  };
  const update = result => {
    detail.setData(previous => ({
      item: result.item,
      history: result.entry ? [result.entry, ...(previous?.history || []).filter(entry => entry.revision !== result.entry.revision)].slice(0, 20) : previous?.history || [],
    }));
    list.setData(previous => previous && { ...previous, items: previous.items.map(item => item.id === result.item.id ? result.item : item) });
  };

  return <section className="space-y-5" aria-labelledby="subscription-title">
    <header>
      <h1 id="subscription-title" className="text-3xl font-bold">Company subscriptions</h1>
      <p className="mt-2 text-gray-600">Record subscription plans, statuses and end dates. These records are for administration. Billing and company access operate separately.</p>
    </header>
    {workspaceAccessError(list.error) || workspaceAccessError(detail.error) ? <p role="alert">Platform access could not be confirmed. Sign in again to continue.</p> :
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(16rem,23rem)_minmax(0,1fr)]">
        <aside aria-label="Companies" className="min-w-0 space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Companies</h2>
          {list.error && <p role="alert">{list.error.message}</p>}
          {list.isPending ? <p role="status">Loading companies…</p> : list.data && !list.data.items.length ? <p>No companies on this page.</p> :
            <ul className="space-y-2">
              {list.data?.items.map(item => <li key={item.id}>
                <button type="button" aria-pressed={companyId === item.id} className={`w-full rounded-lg border p-3 text-left ${companyId === item.id ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}`} onClick={() => choose(item.id)}>
                  <span className="block break-words font-medium">{item.name}</span>
                  <span className="block text-sm text-gray-600">{statusLabels[item.subscription.status]}{item.subscription.plan ? ` · ${item.subscription.plan}` : ''}</span>
                  <span className="block break-all text-xs text-gray-500">{item.id}</span>
                </button>
              </li>)}
            </ul>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary" disabled={cursors.length === 1 || list.isFetching} onClick={() => page(false)}>Previous</button>
            <button type="button" className="btn-secondary" disabled={!list.data?.nextCursor || list.isFetching} onClick={() => page(true)}>Next</button>
            <button type="button" className="btn-secondary" disabled={list.isFetching} onClick={() => list.refetch()}>Refresh</button>
          </div>
        </aside>
        {companyId ? <div className="min-w-0">
          {detail.error && <p role="alert">{detail.error.message} <button type="button" className="underline" onClick={() => detail.refetch()}>Try again</button></p>}
          {detail.isPending && <p role="status">Loading subscription…</p>}
          {detail.data && <SubscriptionEditor key={companyId} detail={detail.data} onSaved={update} reload={() => detail.refetch()} />}
        </div> : <p className="rounded-xl border border-gray-200 bg-white p-5">Select a company to view or edit its subscription.</p>}
      </div>}
  </section>;
}

function SubscriptionEditor({ detail, onSaved, reload }) {
  const { item, history } = detail;
  const [base, setBase] = useState(item.subscription);
  const [draft, setDraft] = useState(() => editValues(base));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const saving = useRef(false);
  const baseline = editValues(base);
  const changed = draft.plan.trim() !== baseline.plan || draft.status !== baseline.status || draft.endDate !== baseline.endDate;
  const dirty = changed || !!reason.trim();
  const stale = item.subscription.revision !== base.revision;
  const { confirmDiscard } = useUnsavedChanges(dirty || busy, { scope: 'platform-subscription', message: 'Leave this subscription without saving your changes?' });
  const update = ({ target: { name, value } }) => setDraft(previous => ({ ...previous, [name]: value }));

  const loadCurrent = async () => {
    if (!(await confirmDiscard())) return;
    const result = await reload();
    if (!result.data || result.error) return;
    const latest = result.data.item.subscription;
    setBase(latest); setDraft(editValues(latest)); setReason(''); setFeedback(null);
  };

  const save = async event => {
    event.preventDefault();
    if (saving.current || stale || !changed || !reason.trim()) return;
    saving.current = true;
    setBusy(true); setFeedback(null);
    try {
      const result = await call('save', { companyId: item.id, expectedRevision: base.revision, ...draft, reason });
      const saved = result.item.subscription;
      setBase(saved); setDraft(editValues(saved)); setReason('');
      onSaved(result);
      setFeedback({ text: result.unchanged ? 'No subscription changes to save.' : 'Subscription saved.' });
    } catch (error) {
      setFeedback({ text: error.message || 'Subscription could not be saved.', error: true, reload: error.code === 'functions/aborted' });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  return <div className="space-y-5">
    <form aria-label="Company subscription editor" onSubmit={save} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="break-words text-xl font-semibold">{item.name}</h2>
      <p className="text-sm text-gray-600">Current status: {statusLabels[base.status]}{base.updatedAt ? ` · Updated ${readableDate(base.updatedAt)}` : ''}</p>
      <fieldset disabled={busy} className="space-y-4">
        <label className="block font-medium">Plan name<input className={fieldClass} name="plan" value={draft.plan} maxLength={100} onChange={update} required /></label>
        <label className="block font-medium">Subscription status<SelectControl aria-label="Subscription status" className={fieldClass} name="status" value={draft.status} onChange={update} required>
          <option value="">Choose a status…</option>
          {Object.entries(statusLabels).filter(([key]) => key !== 'unassigned').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </SelectControl></label>
        <label className="block font-medium">End date (optional)<input className={fieldClass} name="endDate" type="date" value={draft.endDate} onChange={update} /></label>
        <label className="block font-medium">Reason for change<textarea className={fieldClass} rows={2} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} required /></label>
      </fieldset>
      {stale && <p role="alert">This subscription has changed since you opened it.</p>}
      {feedback && <p role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary" disabled={busy || stale || !changed || !draft.plan.trim() || !draft.status || !reason.trim()}>{busy ? 'Saving…' : 'Save subscription'}</button>
        {(stale || feedback?.reload) && <button type="button" className="btn-secondary" disabled={busy} onClick={loadCurrent}>Reload subscription</button>}
      </div>
    </form>
    <section aria-labelledby="subscription-history" className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
      <h2 id="subscription-history" className="text-lg font-semibold">Recent changes</h2>
      {history.length ? <ol className="space-y-3">
        {history.map(entry => <li key={entry.revision} className="break-words border-t border-gray-200 pt-3">
          <p className="font-medium">{entry.after.plan} · {statusLabels[entry.after.status]}{entry.after.endDate ? ` · Ends ${entry.after.endDate}` : ''}</p>
          <p>{entry.reason}</p>
          <p className="break-all text-sm text-gray-600">{readableDate(entry.createdAt)} · Admin {entry.actorId}</p>
        </li>)}
      </ol> : <p>No subscription changes recorded yet.</p>}
    </section>
  </div>;
}
