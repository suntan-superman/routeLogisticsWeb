import ThemeControl from '../components/ThemeControl';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { reviewCredentials, reviewInvitation } from '../services/reviews';
import ReviewForm from '../components/ReviewForm';
import ReviewSummary from '../components/ReviewSummary';

export default function ReviewInvitationPage() {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(true), [submitted, setSubmitted] = useState(false);
  const credentials = useRef(null), runtime = useRef({ mounted: false, sequence: 0 });
  useEffect(() => {
    const state = runtime.current; state.mounted = true; const sequence = ++state.sequence;
    try {
      if (!credentials.current) credentials.current = reviewCredentials(window.location.hash);
      window.history.replaceState(window.history.state, '', window.location.pathname);
      reviewInvitation('get', credentials.current).then(result => { if (state.mounted && sequence === state.sequence) { setData(result); setSubmitted(!!result.review); } }).catch(failure => { if (state.mounted && sequence === state.sequence) setError(failure.message || 'This invitation is unavailable. Sign in to the customer portal or contact your provider.'); }).finally(() => { if (state.mounted && sequence === state.sequence) setBusy(false); });
    } catch (failure) { setError(failure.message); setBusy(false); window.history.replaceState(window.history.state, '', window.location.pathname); }
    return () => { state.mounted = false; state.sequence++; };
  }, []);
  const submit = async values => {
    const sequence = runtime.current.sequence;
    const result = await reviewInvitation('submit', { ...credentials.current, ...values });
    if (!runtime.current.mounted || sequence !== runtime.current.sequence) return;
    setData(previous => ({ ...previous, review: result.review })); setSubmitted(true); toast.success(result.existing ? 'Your review is already recorded.' : 'Review submitted.');
  };
  const invitation = data?.invitation;
  return <main className="mx-auto max-w-3xl space-y-6 p-5 py-10 sm:p-8">
    <Helmet><title>Service feedback | Route Logistics</title><meta name="robots" content="noindex,nofollow" /><meta name="referrer" content="no-referrer" /></Helmet>
    <header><div className="flex flex-wrap items-center justify-between gap-3"><Link className="font-bold text-primary-700" to="/">Route Logistics</Link><ThemeControl /></div><h1 className="mt-6 text-3xl font-bold">Your service feedback</h1><p className="mt-2 text-gray-600">Share an honest review of your completed service. Feedback is welcome at every rating.</p></header>
    {busy && <p role="status">Checking your secure invitation…</p>}{error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
    {invitation?.synthetic && <p role="status" className="rounded-lg bg-amber-50 p-4 text-amber-900">This is an authorized Route Logistics test invitation. No actual service visit is represented, and test feedback cannot be published.</p>}
    {invitation && <section className="rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">{invitation.companyName || 'Your service provider'}</h2><p className="mt-2">{invitation.serviceType || 'Completed service'} · {invitation.serviceDate || ''}</p></section>}
    {submitted ? <><p role="status" className="rounded-xl bg-emerald-50 p-5 text-emerald-900">Thank you. Your feedback is recorded. This invitation cannot submit another review.</p>{data?.review && <ReviewSummary review={data.review} />}</> : invitation && !['cancelled', 'expired', 'invalidated', 'submitted', 'consumed'].includes(invitation.status) && <ReviewForm scope={`invitation:${invitation.id}`} visit={{ serviceType: invitation.serviceType, date: invitation.serviceDate, synthetic: invitation.synthetic }} onSubmit={submit} />}
    <p className="text-sm text-gray-600">Use the <Link to="/portal" className="font-semibold text-primary-700 underline">customer portal</Link> to view your provider reviews and change public-display permission. Public permission never automatically publishes a review.</p>
  </main>;
}
