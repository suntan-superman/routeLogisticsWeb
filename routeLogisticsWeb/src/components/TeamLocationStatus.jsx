import { dutyLabel, locationState, LOCATION_LABELS } from '../utils/workLocations';
export default function TeamLocationStatus({ member, now = Date.now(), freshAfterSeconds = 300 }) {
  const location = member.location, state = location ? locationState(location, Number(now), freshAfterSeconds) : member.trackingState || 'unavailable';
  return <div className="space-y-1">
    {(member.fieldWorkEnabled === false || member.availability?.fieldWorkEnabled === false) && <p className="text-sm font-medium text-gray-700">Office only</p>}
    {member.availability?.active && <p className={member.availability.state === 'unavailable' ? 'font-semibold text-amber-800' : 'font-medium text-primary-800'}>{member.availability.state === 'unavailable' ? 'Unavailable' : 'Available for call-out'} · {member.availability.reason === 'off-duty' ? 'Off duty' : member.availability.reason}{member.availability.endsAt ? ` until ${new Date(member.availability.endsAt).toLocaleString()}` : ''}</p>}
    {Number(member.availability?.scheduled || 0) > 0 && !member.availability?.active && <p className="text-xs text-gray-600">Future availability periods scheduled</p>}
    <p className={member.onDuty ? 'font-medium text-emerald-800' : 'text-gray-600'}>{member.dutyStatus === 'unknown' ? 'Shift status unavailable' : dutyLabel(member)}</p>
    <p className="text-sm">{LOCATION_LABELS[state] || LOCATION_LABELS.unavailable}</p>
    {member.shiftStartedAt && member.onDuty && <p className="text-xs text-gray-600">Shift started {new Date(member.shiftStartedAt).toLocaleTimeString()}</p>}
    {location && <p className="text-xs text-gray-600">GPS captured {new Date(location.capturedAt || location.updatedAt).toLocaleString()}{Number.isFinite(location.accuracy) ? ` · accuracy about ${Math.round(location.accuracy)} m` : ''}</p>}
  </div>;
}
