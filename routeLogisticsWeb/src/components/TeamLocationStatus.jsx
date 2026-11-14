import { dutyLabel, locationState, LOCATION_LABELS } from '../utils/workLocations';
export default function TeamLocationStatus({ member, now = Date.now(), freshAfterSeconds = 300 }) {
  const location = member.location, state = location ? locationState(location, Number(now), freshAfterSeconds) : member.trackingState || 'unavailable';
  return <div className="space-y-1">
    <p className={member.onDuty ? 'font-medium text-emerald-800' : 'text-gray-600'}>{member.dutyStatus === 'unknown' ? 'Shift status unavailable' : dutyLabel(member)}</p>
    <p className="text-sm">{LOCATION_LABELS[state] || LOCATION_LABELS.unavailable}</p>
    {member.shiftStartedAt && member.onDuty && <p className="text-xs text-gray-600">Shift started {new Date(member.shiftStartedAt).toLocaleTimeString()}</p>}
    {location && <p className="text-xs text-gray-600">GPS captured {new Date(location.capturedAt || location.updatedAt).toLocaleString()}{Number.isFinite(location.accuracy) ? ` · accuracy about ${Math.round(location.accuracy)} m` : ''}</p>}
  </div>;
}
