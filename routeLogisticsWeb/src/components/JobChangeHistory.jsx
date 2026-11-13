import React from 'react';
import { PencilSquareIcon } from '@heroicons/react/24/outline';

const fmt = (key, v) => (key === 'totalCost' ? `$${Number(v || 0).toFixed(2)}` : v === '' || v == null ? '—' : String(v));

export const ModifiedBadge = ({ job }) =>
  job?.isModified ? (
    <span
      className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
      title="Changed from the original scheduled details"
    >
      Modified
    </span>
  ) : null;

const JobChangeHistory = ({ job }) => {
  if (!job?.isModified || !job.revisions?.length) return null;
  const revisions = [...job.revisions].reverse();
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="mb-3 flex items-center text-sm font-semibold text-amber-900">
        <PencilSquareIcon className="mr-2 h-4 w-4" />
        Changed from original ({job.revisions.length} {job.revisions.length === 1 ? 'edit' : 'edits'})
      </div>
      <ul className="space-y-3">
        {revisions.map((r, i) => (
          <li key={r.at + i} className="text-sm text-amber-900">
            <div className="text-xs text-amber-700">
              {new Date(r.at).toLocaleString()} · {r.by}
              {r.reason ? ` · “${r.reason}”` : ''}
            </div>
            <ul className="mt-1 space-y-0.5">
              {r.changes.map((c) => (
                <li key={c.field}>
                  <span className="font-medium">{c.label}:</span>{' '}
                  <span className="text-gray-500 line-through">{fmt(c.field, c.from)}</span> → {fmt(c.field, c.to)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default JobChangeHistory;
