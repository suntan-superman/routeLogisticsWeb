import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { customerReviews } from '../services/reviews';
import ReviewForm from './ReviewForm';
import { reviewButton, reviewSecondary } from '../utils/reviewUi';
import ReviewSummary from './ReviewSummary';
import { useConfirmUnsavedChanges } from '../hooks/useUnsavedChanges';
import { usePrincipalQuery } from '../hooks/usePrincipalQuery';
import { portalAuth } from '../services/portal';

export default function CustomerReviews({ accountId, userId }) {
  return <CustomerReviewsSection key={`${userId}:${accountId}`} accountId={accountId} userId={userId} />;
}
function CustomerReviewsSection({ accountId, userId }) {
  const [selected, setSelected] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [pageCount, setPageCount] = useState(1);
  const runtime = useRef({ mounted: false, sequence: 0, busy: false });
  const confirmDiscard = useConfirmUnsavedChanges();
  useEffect(() => { const state = runtime.current; state.mounted = true; return () => { state.mounted = false; state.sequence++; }; }, []);
  const current = () => runtime.current.mounted && portalAuth.currentUser?.uid === userId;
  const reviewsQuery = usePrincipalQuery('rl-customer-reviews', userId, [accountId, pageCount], async () => {
    let first, last, cursor;
    const reviews = new Map();
    for (let page = 0; page < pageCount; page++) {
      const result = await customerReviews('list', { accountId, ...(cursor ? { reviewCursor: cursor } : {}) });
      first ||= result; last = result;
      for (const review of result.reviews || []) if (!reviews.has(review.id)) reviews.set(review.id, review);
      cursor = result.reviewCursor;
      if (!result.hasMoreReviews || !cursor) break;
    }
    return { ...first, reviews: [...reviews.values()], hasMoreReviews: last?.hasMoreReviews === true, reviewCursor: cursor || null };
  }, { enabled: !!accountId, current: uid => uid === userId && current() });
  const data = reviewsQuery.data, loading = reviewsQuery.isPending && !reviewsQuery.error;
  const load = () => { setError(''); return reviewsQuery.refetch(); };
  const submit = async values => {
    const state = runtime.current; if (state.busy || !selected || !current()) throw new Error('Your sign-in changed or a review submission is already in progress.'); state.busy = true;
    const sequence = ++state.sequence; setBusy(true);
    try { const result = await customerReviews('submit', { accountId, jobId: selected.jobId, ...values }); if (!current() || sequence !== state.sequence) return;
      reviewsQuery.setData(previous => ({ ...previous, reviews: [result.review, ...(previous?.reviews || []).filter(row => row.id !== result.review.id)], eligibleVisits: (previous?.eligibleVisits || []).filter(row => row.jobId !== selected.jobId) }));
      setSelected(null); setMessage(result.existing ? 'This visit already has your review. It is shown below.' : 'Thank you. Your review was submitted successfully.'); toast.success(result.existing ? 'Your review is already recorded.' : 'Review submitted.');
      await reviewsQuery.refetch();
    } finally { state.busy = false; if (state.mounted && sequence === state.sequence) setBusy(false); }
  };
  const consent = async review => {
    const state = runtime.current; if (state.busy || !current()) return; state.busy = true; const sequence = ++state.sequence; setBusy(true); setError('');
    try { const result = await customerReviews('consent', { accountId, reviewId: review.id, publicConsent: !review.publicConsent }); if (!current() || sequence !== state.sequence) return;
      reviewsQuery.setData(previous => ({ ...previous, reviews: (previous?.reviews || []).map(row => row.id === result.review.id ? result.review : row) })); setMessage(result.review.publicConsent ? 'Public-display permission recorded. Your review has not been automatically published.' : 'Public-display permission withdrawn. Your review remains private feedback.'); toast.success(result.review.publicConsent ? 'Display permission recorded.' : 'Display permission withdrawn.');
      await reviewsQuery.refetch();
    } catch (failure) { if (state.mounted && sequence === state.sequence) { setError(failure.message || 'Display permission was not changed. Please retry.'); toast.error('Display permission was not changed.'); } }
    finally { state.busy = false; if (state.mounted && sequence === state.sequence) setBusy(false); }
  };
  return <section id="reviews" aria-label="Service feedback" className="mt-7 space-y-5 border-t pt-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-semibold">Reviews and service feedback</h3><p className="mt-1 text-sm text-gray-600">Review a completed visit with this provider. Each visit can be reviewed once.</p></div><button type="button" className={reviewSecondary} disabled={busy} onClick={async () => { if (!await confirmDiscard()) return; setSelected(null); load(); }}>{busy ? 'Loading feedback…' : 'Refresh feedback'}</button></div>
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{message}</p>}{(error || reviewsQuery.error) && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error || reviewsQuery.error.message}</p>}
    {!data && loading && <p role="status">Loading completed visits and previous reviews…</p>}
    {data && <><div className="space-y-3"><h4 className="font-semibold">Completed visits awaiting feedback</h4>{!data.eligibleVisits?.length && <p className="text-sm text-gray-600">No completed visits are awaiting your review.</p>}{(data.eligibleVisits || []).map(visit => <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4" key={visit.jobId}><p>{visit.serviceType} · {visit.date} {visit.time}</p><button type="button" className={reviewButton} disabled={busy || !!selected} onClick={() => { setSelected(visit); setMessage(''); }}>Review this visit</button></div>)}</div>
      {selected && <ReviewForm key={selected.jobId} scope={`review:${accountId}:${selected.jobId}`} visit={selected} onSubmit={submit} onCancel={() => setSelected(null)} />}
      <div className="space-y-3"><h4 className="font-semibold">Your submitted reviews</h4>{!data.reviews?.length && <p className="text-sm text-gray-600">You have not submitted a review to this provider yet.</p>}{(data.reviews || []).map(review => <ReviewSummary key={review.id} review={review}><button type="button" className="min-h-11 text-sm font-medium text-primary-700 underline disabled:opacity-50" disabled={busy} onClick={() => consent(review)}>{review.publicConsent ? 'Withdraw public-display permission' : 'Grant public-display permission'}</button></ReviewSummary>)}</div>
      {data.hasMoreReviews && data.reviewCursor && <button type="button" className={reviewSecondary} disabled={busy || reviewsQuery.isFetching} onClick={async () => { if (!await confirmDiscard()) return; setSelected(null); setPageCount(count => count + 1); }}>Load more reviews</button>}
      {data.hasMore && <p className="text-sm text-gray-600">Showing the latest eligible visits and reviews. Contact your provider if an older completed visit is missing.</p>}</>}
  </section>;
}
