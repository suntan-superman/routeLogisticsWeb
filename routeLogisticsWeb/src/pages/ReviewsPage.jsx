import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { providerReviews } from '../services/reviews';
import { useConfirmUnsavedChanges, useUnsavedChanges } from '../hooks/useUnsavedChanges';
import ReviewSummary from '../components/ReviewSummary';
import { reviewButton, reviewField, reviewSecondary, reviewResponse } from '../utils/reviewUi';
import ReviewInvitationSettings from '../components/ReviewInvitationSettings';

const filtersFor = () => ({ rating: '', serviceType: '', fromDate: '', toDate: '', status: '' });
export default function ReviewsPage() {
  const { currentUser, company, role, can } = useAuth();
  const allowed = can('reviews.manage') && ['owner', 'manager'].includes(role);
  if (!allowed) return <main className="p-6" role="alert">Reviews are managed by the company owner and authorized managers.</main>;
  return <ProviderReviews key={`${currentUser?.uid}:${company?.id || 'solo'}:${role}`} companyId={company?.id} />;
}

function ProviderReviews({ companyId }) {
  const [data, setData] = useState(null), [filters, setFilters] = useState(filtersFor), [applied, setApplied] = useState(filtersFor), [busy, setBusy] = useState(false), [error, setError] = useState(''), [selectedId, setSelectedId] = useState('');
  const runtime = useRef({ mounted: false, sequence: 0, mutation: 0 });
  const confirmManagementDiscard = useConfirmUnsavedChanges(selectedId ? `manage-review:${selectedId}` : 'no-open-review');
  const load = async (nextFilters = applied, cursor = null) => {
    const state = runtime.current, sequence = ++state.sequence; setBusy(true); setError('');
    if (!cursor) setSelectedId('');
    try {
      const choices = Object.fromEntries(Object.entries(nextFilters).filter(([, value]) => value !== ''));
      if (choices.rating) choices.rating = Number(choices.rating);
      const result = await providerReviews('list', { ...choices, ...(cursor ? { cursor } : {}) });
      if (!state.mounted || sequence !== state.sequence) return;
      setData(previous => cursor ? { ...result, reviews: [...new Map([...(previous?.reviews || []), ...(result.reviews || [])].map(row => [row.id, row])).values()] } : result); setApplied(nextFilters);
    } catch (failure) { if (state.mounted && sequence === state.sequence) { setData(null); setError(failure.message || 'Reviews could not be loaded. Check your access and try again.'); } }
    finally { if (state.mounted && sequence === state.sequence) setBusy(false); }
  };
  const loadRef = useRef(load); loadRef.current = load;
  useEffect(() => { const state = runtime.current; state.mounted = true; loadRef.current(); return () => { state.mounted = false; state.sequence++; }; }, []);
  const replace = async review => {
    const state = runtime.current, sequence = state.sequence, mutation = ++state.mutation;
    setData(previous => ({ ...previous, reviews: previous.reviews.map(row => row.id === review.id ? review : row) }));
    try {
      const choices = Object.fromEntries(Object.entries(applied).filter(([, value]) => value !== '')); if (choices.rating) choices.rating = Number(choices.rating);
      const refreshed = await providerReviews('list', choices);
      if (!state.mounted || sequence !== state.sequence || mutation !== state.mutation) return;
      const current = refreshed.reviews?.find(row => row.id === review.id);
      setData(previous => ({ ...previous, stats: refreshed.stats, serviceTypes: refreshed.serviceTypes, ...(current ? { reviews: previous.reviews.map(row => row.id === current.id ? current : row) } : {}) }));
    } catch (failure) {
      if (!state.mounted || sequence !== state.sequence || mutation !== state.mutation) return;
      if (['functions/permission-denied', 'functions/unauthenticated'].includes(failure.code)) setData(null);
      setError('The review update was saved, but its current eligibility could not be refreshed. Refresh reviews before relying on public-display eligibility.');
    }
  };
  const chosen = data?.reviews?.find(row => row.id === selectedId);
  const filtersChanged = JSON.stringify(filters) !== JSON.stringify(applied);
  return <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
    <header><h1 className="text-3xl font-bold">Customer reviews</h1><p className="mt-2 text-gray-600">Verified feedback from completed services with your provider. Customer ratings and comments remain unchanged.</p></header>
    <section aria-label="Review statistics" className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border bg-white p-5"><h2 className="text-sm text-gray-600">All submitted reviews</h2><p className="mt-1 text-3xl font-bold">{data?.stats?.count ?? '—'}</p></div><div className="rounded-xl border bg-white p-5"><h2 className="text-sm text-gray-600">Average of all submitted ratings</h2><p className="mt-1 text-3xl font-bold">{data?.stats?.count ? `${Number(data.stats.averageRating || 0).toFixed(1)} / 5` : 'No ratings yet'}</p></div></section>
    <section aria-label="Review filters" className="space-y-4 rounded-xl border bg-white p-5"><h2 className="font-semibold">Filter reviews</h2><form className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={async event => { event.preventDefault(); if (await confirmManagementDiscard()) load(filters); }}>
      <label className="block text-sm font-medium">Rating<select className={reviewField} aria-label="Review rating filter" value={filters.rating} onChange={event => setFilters(previous => ({ ...previous, rating: event.target.value }))}><option value="">All ratings</option>{[1, 2, 3, 4, 5].map(rating => <option value={rating} key={rating}>{rating} {rating === 1 ? 'star' : 'stars'}</option>)}</select></label>
      <label className="block text-sm font-medium">Service type<select className={reviewField} aria-label="Review service type filter" value={filters.serviceType} onChange={event => setFilters(previous => ({ ...previous, serviceType: event.target.value }))}><option value="">All service types</option>{(data?.serviceTypes || []).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="block text-sm font-medium">Moderation status<select className={reviewField} aria-label="Review moderation filter" value={filters.status} onChange={event => setFilters(previous => ({ ...previous, status: event.target.value }))}><option value="">All statuses</option>{['unreviewed', 'approved', 'flagged', 'hidden'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="block text-sm font-medium">Review submitted from<input className={reviewField} aria-label="Review date from" type="date" value={filters.fromDate} onChange={event => setFilters(previous => ({ ...previous, fromDate: event.target.value }))} /></label><label className="block text-sm font-medium">Review submitted to<input className={reviewField} aria-label="Review date to" type="date" value={filters.toDate} onChange={event => setFilters(previous => ({ ...previous, toDate: event.target.value }))} /></label>
      <button type="submit" className={reviewButton} disabled={busy || !filtersChanged}>{busy ? 'Loading reviews…' : 'Apply filters'}</button>
    </form><button type="button" className="min-h-11 text-sm font-medium text-primary-700 underline disabled:opacity-50" disabled={busy} onClick={async () => { if (await confirmManagementDiscard()) load(); }}>Refresh reviews</button></section>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}{busy && <p role="status">Loading provider reviews…</p>}
    <section aria-label="Provider reviews" className="space-y-4"><h2 className="text-xl font-semibold">Verified service feedback</h2>{data && !data.reviews?.length && <p className="rounded-xl border bg-white p-5 text-gray-600">No reviews match these filters. Reviews will appear after customers submit feedback for completed services.</p>}
      {(data?.reviews || []).map(review => <ReviewSummary key={review.id} review={review}><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">Moderation: {review.moderationStatus || 'unreviewed'}</p><button type="button" className={reviewSecondary} onClick={async () => { if (await confirmManagementDiscard()) setSelectedId(previous => previous === review.id ? '' : review.id); }}>{selectedId === review.id ? 'Close review management' : 'Manage review'}</button></div>{selectedId === review.id && chosen && <ReviewManagement key={review.id} review={chosen} onChange={replace} />}</ReviewSummary>)}
      {data?.hasMore && <button type="button" className={reviewSecondary} disabled={busy} onClick={() => load(applied, data.cursor)}>Load more reviews</button>}
    </section>
    {companyId ? <ReviewInvitationSettings companyId={companyId} /> : <p className="rounded-xl border bg-white p-5 text-sm text-gray-600">Post-service invitation preferences are available in a company workspace.</p>}
  </main>;
}

function ReviewManagement({ review, onChange }) {
  const [response, setResponse] = useState(() => reviewResponse(review.providerResponse)), [note, setNote] = useState(''), [status, setStatus] = useState(review.moderationStatus || 'unreviewed'), [reason, setReason] = useState(''), [busy, setBusy] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [audit, setAudit] = useState(null);
  const state = useRef({ mounted: false, busy: false });
  const responseChanged = response.trim() !== reviewResponse(review.providerResponse).trim(), moderationChanged = status !== (review.moderationStatus || 'unreviewed');
  useUnsavedChanges(responseChanged || !!note.trim() || moderationChanged || !!reason.trim(), { scope: `manage-review:${review.id}`, message: 'Your response, follow-up note or moderation decision has not been saved. Leave without saving?' });
  useEffect(() => { const runtime = state.current; runtime.mounted = true; return () => { runtime.mounted = false; }; }, []);
  const save = async action => {
    const runtime = state.current; if (runtime.busy) return;
    if (action === 'respond' && !responseChanged || action === 'note' && !note.trim() || action === 'moderate' && (!moderationChanged || !reason.trim())) return;
    runtime.busy = true; setBusy(action); setError(''); setMessage('');
    try {
      const result = await providerReviews(action, { reviewId: review.id, ...(action === 'respond' ? { response: response.trim() } : action === 'note' ? { note: note.trim() } : { status, reason: reason.trim() }) });
      if (!runtime.mounted) return; await onChange(result.review); if (!runtime.mounted) return;
      if (action === 'respond') setResponse(reviewResponse(result.review.providerResponse)); if (action === 'note') setNote(''); if (action === 'moderate') { setStatus(result.review.moderationStatus); setReason(''); }
      const detail = action === 'respond' ? 'Provider response saved.' : action === 'note' ? 'Internal follow-up note saved.' : 'Moderation decision recorded. No review was automatically published.'; setMessage(detail); toast.success(detail);
    } catch (failure) { if (runtime.mounted) { setError(failure.message || 'The review update failed. Your changes are retained for retry.'); toast.error('Review update was not saved.'); } }
    finally { runtime.busy = false; if (runtime.mounted) setBusy(''); }
  };
  const loadHistory = async () => {
    const runtime = state.current; if (runtime.busy) return; runtime.busy = true; setBusy('history'); setError('');
    try { const result = await providerReviews('history', { reviewId: review.id }); if (runtime.mounted) setAudit(result); }
    catch (failure) { if (runtime.mounted) setError(failure.message || 'The review audit history could not be loaded. Please retry.'); }
    finally { runtime.busy = false; if (runtime.mounted) setBusy(''); }
  };
  return <section aria-label="Manage customer review" className="space-y-5 border-t pt-5">
    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Apply documented standards equally to positive and negative feedback. A low rating alone is never a reason to hide a review. You cannot edit a customer’s rating or comments. Customer permission and moderation approval only make a review eligible for future public display.</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}{message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{message}</p>}
    <fieldset disabled={!!busy} className="space-y-3"><legend className="font-semibold">Provider response</legend><label className="block text-sm">Response visible to the customer<textarea aria-label="Provider review response" className={reviewField} maxLength={2000} rows={3} value={response} onChange={event => setResponse(event.target.value)} /></label><button type="button" className={reviewButton} disabled={!!busy || !responseChanged} onClick={() => save('respond')}>{busy === 'respond' ? 'Saving response…' : 'Save response'}</button></fieldset>
    <fieldset disabled={!!busy} className="space-y-3"><legend className="font-semibold">Internal follow-up</legend><label className="block text-sm">Private follow-up note<textarea aria-label="Internal review note" className={reviewField} maxLength={2000} rows={3} value={note} onChange={event => setNote(event.target.value)} /></label><button type="button" className={reviewButton} disabled={!!busy || !note.trim()} onClick={() => save('note')}>{busy === 'note' ? 'Saving note…' : 'Add internal note'}</button>{(review.internalNotes || []).map((row, index) => <div className="rounded-lg bg-gray-50 p-3 text-sm" key={`${row.createdAt}:${index}`}><p className="whitespace-pre-wrap break-words">{row.text}</p><p className="mt-1 text-gray-500">{row.createdAt ? new Date(row.createdAt).toLocaleString() : 'Recorded'}</p></div>)}</fieldset>
    <fieldset disabled={!!busy} className="space-y-3"><legend className="font-semibold">Moderation</legend><label className="block text-sm">Review status<select aria-label="Review moderation status" className={reviewField} value={status} onChange={event => setStatus(event.target.value)}>{['unreviewed', 'approved', 'flagged', 'hidden'].map(value => <option value={value} key={value}>{value}</option>)}</select></label><label className="block text-sm">Reason for this decision<textarea aria-label="Review moderation reason" className={reviewField} maxLength={1000} rows={2} value={reason} onChange={event => setReason(event.target.value)} /></label><button type="button" className={reviewButton} disabled={!!busy || !moderationChanged || !reason.trim()} onClick={() => save('moderate')}>{busy === 'moderate' ? 'Recording decision…' : 'Record moderation decision'}</button></fieldset>
    <div className="space-y-2"><h4 className="font-semibold">Moderation history</h4>{!review.moderationHistory?.length && <p className="text-sm text-gray-500">No moderation decisions recorded yet.</p>}{(review.moderationHistory || []).map((row, index) => <div key={`${row.createdAt}:${index}`} className="rounded-lg border p-3 text-sm"><p className="font-semibold">{row.status}</p><p className="whitespace-pre-wrap break-words">{row.reason}</p><p className="mt-1 text-gray-500">{row.createdAt ? new Date(row.createdAt).toLocaleString() : 'Recorded'}</p></div>)}</div>
    <div className="space-y-3"><button type="button" className={reviewSecondary} disabled={!!busy} onClick={loadHistory}>{busy === 'history' ? 'Loading audit history…' : 'Load review audit history'}</button>{review.hasMoreHistory && !audit && <p className="text-sm text-gray-600">Showing recent notes and decisions above. Load audit history for earlier entries.</p>}{audit && <div className="space-y-2"><h4 className="font-semibold">Review audit history</h4>{!audit.history?.length && <p className="text-sm text-gray-500">No audit entries available.</p>}{(audit.history || []).map((row, index) => <div className="rounded-lg border p-3 text-sm" key={row.id || index}><p className="font-semibold">{{ 'review.submit': 'Customer review submitted', 'review.consent': 'Customer display permission updated', 'provider.respond': 'Provider response updated', 'provider.note': 'Internal follow-up note', 'provider.moderate': 'Moderation decision' }[row.action] || 'Review update'}{row.status ? ` · ${row.status}` : ''}</p>{(row.text || row.reason) && <p className="whitespace-pre-wrap break-words">{row.text || row.reason}</p>}<p className="mt-1 text-gray-500">{row.createdAt ? new Date(row.createdAt).toLocaleString() : 'Recorded'}</p></div>)}{audit.hasMore && <p className="text-sm text-gray-600">Showing the latest 500 audit entries. Earlier records remain retained.</p>}</div>}</div>
  </section>;
}
