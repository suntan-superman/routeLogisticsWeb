import React from 'react';

const labels = {
  management: ['🔒', 'Management only'],
  internal: ['👥', 'Internal — management and assigned technicians'],
  customer: ['📄', 'Customer-facing'],
};

// Visibility belongs to the existing field and server projection, not a
// browser-controlled flag. This label makes that fixed audience clear.
export default function NoteVisibilityBadge({ audience }) {
  const [icon, label] = labels[audience] || labels.internal;
  return <span className="inline-flex items-center gap-1 text-xs font-normal opacity-75" aria-label={label}>
    <span aria-hidden="true">{icon}</span>{label}
  </span>;
}
