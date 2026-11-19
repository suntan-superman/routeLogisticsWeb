const ACTIVE_STATUSES = new Set(['in-progress', 'en-route']);
const CLOSED_STATUSES = new Set(['completed', 'cancelled', 'canceled']);

const normalized = value => String(value || '').trim().toLowerCase();
const jobOrder = job => `${job?.date || ''}T${job?.time || job?.windowStart || '99:99'}:${job?.id || ''}`;

export function serviceAddress(job) {
  const address = typeof job?.address === 'string' ? job.address.trim() : '';
  const locality = [job?.city, job?.state, job?.zipCode].filter(value => typeof value === 'string' && value.trim()).join(', ');
  if (!address) return locality;
  if (!locality || [job?.city, job?.state, job?.zipCode].filter(Boolean).some(value => address.toLowerCase().includes(String(value).toLowerCase()))) return address;
  return `${address}, ${locality}`;
}

export function currentOrNextJob(location, jobs = []) {
  const matching = jobs.filter(job => {
    if (!job || CLOSED_STATUSES.has(normalized(job.status))) return false;
    return [location?.memberId, location?.userId].filter(Boolean).some(id => job.assignedTo === id || job.assignedToUid === id);
  });
  const active = matching.filter(job => ACTIVE_STATUSES.has(normalized(job.status))).sort((first, second) => {
    const priority = status => normalized(status) === 'in-progress' ? 0 : 1;
    return priority(first.status) - priority(second.status) || jobOrder(first).localeCompare(jobOrder(second));
  })[0];
  if (active) return { kind: 'current', job: active };
  const next = matching.filter(job => normalized(job.status) === 'scheduled').sort((first, second) => jobOrder(first).localeCompare(jobOrder(second)))[0];
  return next ? { kind: 'next', job: next } : null;
}

function textLine(documentRef, parent, text, { strong = false, muted = false } = {}) {
  const line = documentRef.createElement('div');
  line.textContent = text;
  line.style.marginTop = '4px';
  line.style.lineHeight = '1.35';
  if (strong) line.style.fontWeight = '700';
  if (muted) { line.style.color = '#475569'; line.style.fontSize = '12px'; }
  parent.appendChild(line);
}

export function serviceVehicleMarkerElement(location, state = 'live', documentRef = globalThis.document) {
  const root = documentRef.createElement('div');
  root.dataset.markerType = 'service-vehicle';
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', `${location?.name || 'Team member'} service vehicle`);
  root.title = `${location?.name || 'Team member'} service vehicle`;
  Object.assign(root.style, {
    width: '42px', height: '42px', borderRadius: '50%', display: 'grid', placeItems: 'center',
    background: state === 'live' ? '#047857' : '#64748b', color: '#ffffff', border: '3px solid #ffffff',
    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.45)', cursor: 'pointer'
  });
  root.innerHTML = '<svg aria-hidden="true" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h11v10H3z"/><path d="M14 9h3.5l3 3v4H14z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><path d="M3 13h11M17.5 9v3h3"/></svg>';
  return root;
}

export function teamLocationPopupElement({ location, assignment, stateLabel, assignmentLabel }, documentRef = globalThis.document) {
  const root = documentRef.createElement('div');
  root.dataset.popupType = 'service-vehicle';
  Object.assign(root.style, { minWidth: '230px', maxWidth: '320px', padding: '4px 2px 6px', color: '#0f172a', fontFamily: 'system-ui, sans-serif' });
  textLine(documentRef, root, location?.name || 'Team member', { strong: true });
  textLine(documentRef, root, stateLabel || 'Current GPS location');
  const captured = location?.capturedAt || location?.updatedAt;
  if (captured && Number.isFinite(Date.parse(captured))) textLine(documentRef, root, `Location captured ${new Date(captured).toLocaleString()}`, { muted: true });
  if (Number.isFinite(location?.accuracy)) textLine(documentRef, root, `GPS accuracy: about ${Math.round(location.accuracy)} m`, { muted: true });
  if (assignment?.job) {
    const job = assignment.job;
    textLine(documentRef, root, assignmentLabel || (assignment.kind === 'current' ? 'Current job' : 'Next job'), { strong: true });
    textLine(documentRef, root, [job.time || job.windowStart, job.customerName, job.serviceType].filter(Boolean).join(' · '));
    const address = serviceAddress(job);
    if (address) textLine(documentRef, root, `Service address: ${address}`);
  } else textLine(documentRef, root, 'No current or upcoming job is loaded for this service date.', { muted: true });
  return root;
}
