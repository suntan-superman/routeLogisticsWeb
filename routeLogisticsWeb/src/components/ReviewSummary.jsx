import { reviewResponse } from '../utils/reviewUi';
export default function ReviewSummary({ review, children }) {
  const response = reviewResponse(review.providerResponse);
  return <article className="min-w-0 space-y-3 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap justify-between gap-3"><div><h4 className="font-semibold">{review.serviceType || 'Completed service'}</h4><p className="text-sm text-gray-500">{review.serviceDate || review.date || ''}</p></div><div><p className="font-semibold text-amber-800" aria-label={`${review.rating} out of 5 stars`}><span aria-hidden="true">{'★'.repeat(Math.max(0, Math.min(5, Number(review.rating) || 0)))}</span> {review.rating}/5</p>{review.synthetic ? <p className="mt-1 text-xs font-medium text-amber-900">Synthetic test feedback · cannot be published</p> : review.verifiedService && <p className="mt-1 text-xs font-medium text-emerald-800">Verified completed service</p>}</div></div>
    {review.customerName && <p className="break-words text-sm">Customer: {review.customerName}</p>}
    {review.createdAt && <p className="text-sm text-gray-500">Submitted {new Date(review.createdAt).toLocaleDateString()}</p>}
    <p className="whitespace-pre-wrap break-words text-gray-800">{review.comment || 'No written comments.'}</p>
    {typeof review.onTime === 'boolean' && <p className="text-sm text-gray-600">On-time arrival: {review.onTime ? 'Yes' : 'No'}</p>}
    {response && <blockquote className="rounded-lg bg-gray-50 p-3"><p className="text-sm font-semibold">Provider response</p><p className="mt-1 whitespace-pre-wrap break-words">{response}</p></blockquote>}
    <p className="text-sm text-gray-600">{review.synthetic ? 'Test feedback is excluded from public display regardless of consent or moderation.' : review.publicConsent ? review.publicEligible ? 'Public-display permission granted · eligible for future display; not published here.' : 'Public-display permission granted · awaiting the same moderation standards for all reviews.' : 'Private feedback · no public-display permission.'}</p>
    {children}
  </article>;
}
