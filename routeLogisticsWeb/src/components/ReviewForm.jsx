import { useEffect, useRef, useState } from 'react';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { reviewButton, reviewSecondary, reviewField } from '../utils/reviewUi';

export default function ReviewForm({ visit, onSubmit, onCancel, scope = 'service-review' }) {
  const [rating, setRating] = useState(0), [comment, setComment] = useState(''), [onTime, setOnTime] = useState(''), [publicConsent, setPublicConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [submitted, setSubmitted] = useState(false);
  const locked = useRef(false), mounted = useRef(false), sent = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const dirty = !submitted && (rating > 0 || !!comment.trim() || !!onTime || publicConsent);
  const { confirmDiscard } = useUnsavedChanges(dirty, { scope, message: 'Your service feedback has not been submitted. Leave without saving it?' });
  const submit = async event => {
    event.preventDefault(); if (locked.current || sent.current || !rating) return;
    locked.current = true; setBusy(true); setError('');
    try {
      await onSubmit({ rating, comment: comment.trim(), onTime: onTime === '' ? null : onTime === 'yes', publicConsent });
      sent.current = true; if (mounted.current) setSubmitted(true);
    } catch (failure) { if (mounted.current) setError(failure.message || 'Your feedback was not submitted. Your answers are retained; please retry.'); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const cancel = async () => { if (!locked.current && (!dirty || await confirmDiscard())) onCancel?.(); };
  return <form aria-label="Service feedback form" onSubmit={submit} className="space-y-5 rounded-xl border border-primary-200 bg-primary-50/40 p-4 sm:p-5">
    <div><h4 className="text-lg font-semibold">How was your service?</h4><p className="mt-1 text-sm text-gray-600">{visit.serviceType || 'Completed service'} · {visit.date || visit.serviceDate || ''}</p><p className="mt-2 text-sm text-gray-600">All honest feedback is welcome, including concerns. Your provider cannot change your rating or comments.</p>{visit.synthetic && <p className="mt-2 text-sm font-semibold text-amber-900">This is test feedback for a synthetic visit and cannot be published.</p>}</div>
    <fieldset disabled={busy} className="space-y-2"><legend className="font-medium">Overall rating <span className="text-sm font-normal">(required)</span></legend><div className="flex flex-wrap gap-2">{[1, 2, 3, 4, 5].map(value => <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${rating === value ? 'border-primary-700 bg-primary-100' : 'border-gray-300 bg-white'}`}><input type="radio" name={`rating-${scope}`} value={value} checked={rating === value} onChange={() => setRating(value)} required /><span aria-hidden="true" className="text-lg text-amber-600">★</span><span>{value}<span className="sr-only"> {value === 1 ? 'star' : 'stars'}</span></span></label>)}</div></fieldset>
    <fieldset disabled={busy} className="space-y-2"><legend className="font-medium">Did the technician arrive on time?</legend><div className="flex flex-wrap gap-4">{[['yes', 'Yes'], ['no', 'No'], ['', 'Not sure / prefer not to answer']].map(([value, label]) => <label className="flex min-h-11 items-center gap-2 text-sm" key={value}><input type="radio" name={`on-time-${scope}`} checked={onTime === value} onChange={() => setOnTime(value)} />{label}</label>)}</div></fieldset>
    <label className="block font-medium">Comments <span className="text-sm font-normal">(optional)</span><textarea aria-label="Review comments" className={reviewField} value={comment} maxLength={2000} rows={4} disabled={busy} onChange={event => setComment(event.target.value)} /><span className="mt-1 block text-sm font-normal text-gray-600">Please leave out addresses, phone numbers, and other private details.</span></label>
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={publicConsent} disabled={busy} onChange={event => setPublicConsent(event.target.checked)} /><span><strong className="block">I separately permit public display of this review.</strong>This is optional and does not affect your service or ability to submit feedback. Permission alone does not publish your review. You can withdraw it later in the customer portal.</span></label>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {submitted && <p role="status" className="text-emerald-900">Your review is recorded.</p>}
    <div className="flex flex-wrap gap-3"><button className={reviewButton} type="submit" disabled={busy || submitted || !rating}>{busy ? 'Submitting feedback…' : submitted ? 'Review submitted' : 'Submit review'}</button>{onCancel && <button type="button" className={reviewSecondary} disabled={busy} onClick={cancel}>Cancel review</button>}</div>
  </form>;
}
