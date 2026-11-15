const { sortJobs, timeMinutes } = require('./workPresentation');
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function validDay(value) {
  if (!DATE.test(value || '')) return false;
  const [y,m,d] = value.split('-').map(Number), date = new Date(y,m-1,d,12);
  return date.getFullYear() === y && date.getMonth() === m-1 && date.getDate() === d;
}
function shiftDay(value, amount) {
  if (!validDay(value)) return null;
  const [y,m,d] = value.split('-').map(Number), date = new Date(y,m-1,d+amount,12);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function localDate(value) { const [y,m,d] = value.split('-').map(Number); return new Date(y,m-1,d,12); }
const memberId = row => row?.memberId || row?.id;
function mergeTeam(team, roster, locations) {
  const positions = new Map((locations || []).map(row => [memberId(row),row]));
  const shifts = new Map((roster || []).map(row => [memberId(row),row]));
  // Only the independently authorized active routing roster introduces a row.
  // A retained location alone cannot resurrect a revoked membership.
  return (team || []).filter(row => memberId(row)).map(row => {
    const id = memberId(row), duty = shifts.get(id);
    return { ...row, ...(duty || {}), id, memberId: id, name: row.name || duty?.name || 'Team member',
      dutyStatus: duty?.dutyStatus || 'unknown', location: duty?.location || positions.get(id) || null,
      availability: duty?.availability || row.availability || null };
  });
}
function locationStatus(row, policy = {}, now = Date.now()) {
  const location = row?.location;
  if (!location) return row?.dutyStatus === 'off-duty' ? 'off-duty' : 'unavailable';
  if (row?.availability?.active&&row.availability.state==='unavailable')return 'unavailable';
  if (row.dutyStatus !== 'on-duty' || location.dutyStatus === 'off-duty') return 'off-duty';
  const at = Date.parse(location.capturedAt || location.updatedAt), fresh = Number(policy.freshAfterSeconds || location.freshAfterSeconds || 300)*1000;
  const retention=Number.isInteger(policy.retentionHours)&&policy.retentionHours>=1&&policy.retentionHours<=168?policy.retentionHours:24;
  if (!Number.isFinite(at) || at > now + 60000)return 'unavailable';
  if(now>=at+retention*3600000)return 'expired';
  if (now-at > fresh || location.stale || location.state === 'stale') return 'stale';
  return location.sharing === true && location.state === 'live' ? 'fresh' : 'sharing-disabled';
}
function coordinates(location) {
  const lat = location?.lat, lng = location?.lng;
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat)<=90 && Math.abs(lng)<=180 ? { latitude:lat,longitude:lng } : null;
}
function visibleTeamMarkers(team, policy, now) {
  return (team || []).flatMap(row => {
    const status = locationStatus(row,policy,now), point = coordinates(row.location);
    // Off-duty and stopped-sharing positions are not plotted. Stale authorized
    // fixes are explicitly grey last-known markers, never represented as live.
    return point && ['fresh','stale'].includes(status) && (row.location?.sharing !== false || row.location?.state==='stale')
      ? [{ ...row, coordinate:point, locationState:status }] : [];
  });
}
function jobCounts(jobs = []) {
  return { assigned:jobs.length,completed:jobs.filter(job=>job.status==='completed').length,
    remaining:jobs.filter(job=>!['completed','cancelled','canceled'].includes(job.status)).length };
}
function teamSummary(jobs, roster, { jobsReady=true, rosterReady=true, truncated=false } = {}) {
  return { onDuty:rosterReady ? roster.filter(row=>row.dutyStatus==='on-duty').length : null,
    offDuty:rosterReady ? roster.filter(row=>row.dutyStatus==='off-duty').length : null,
    unknownDuty:rosterReady ? roster.filter(row=>!['on-duty','off-duty'].includes(row.dutyStatus)).length : null,
    scheduled:jobsReady ? jobs.filter(job=>job.status==='scheduled').length : null,
    completed:jobsReady ? jobs.filter(job=>job.status==='completed').length : null,
    inProgress:jobsReady ? jobs.filter(job=>job.status==='in-progress').length : null,
    unassigned:jobsReady ? jobs.filter(job=>!job.assignedTo).length : null,truncated };
}
function availabilityLabel(value) {
  if (!value) return 'Availability not loaded';
  if (!value.active || value.state==='normal') return value.scheduled>0 ? `Normal now · ${value.scheduled} scheduled availability window${value.scheduled===1?'':'s'}` : 'Normal calendar availability';
  const reason = { sick:'Sick leave',vacation:'Vacation','off-duty':'Temporarily unavailable',emergency:'Emergency call-out',other:'Manual override' }[value.reason] || 'Manual override';
  return `${value.state==='unavailable' ? 'Unavailable' : 'Available'} · ${reason}`;
}
function instantFromLocal(day,time) {
  if (!validDay(day) || !/^([01]\d|2[0-3]):(00|15|30|45)$/.test(time || '')) return null;
  const [y,m,d]=day.split('-').map(Number),[h,min]=time.split(':').map(Number),date=new Date(y,m-1,d,h,min);
  if(date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==d||date.getHours()!==h||date.getMinutes()!==min)return null;
  return date.toISOString();
}
function nextScheduledJob(jobs = [], id) { return sortJobs(jobs.filter(job=>job.assignedTo===id&&!['completed','cancelled','canceled'].includes(job.status)))[0] || null; }
function orderedRouteStops(route) {
  const ids=Array.isArray(route?.saved?.jobIds)?route.saved.jobIds:[];
  return sortJobs(route?.stops||[]).sort((a,b)=>(ids.includes(a.id)?ids.indexOf(a.id):ids.length)-(ids.includes(b.id)?ids.indexOf(b.id):ids.length));
}
function apparentConflict(job, jobs = [], target) {
  if (!target) return false;
  const start=timeMinutes(job.time), hours=Number(job.estimatedDuration ?? job.duration ?? 1);
  if(start>=1440 || !Number.isFinite(hours))return false;
  return jobs.some(other=>other.id!==job.id&&other.assignedTo===target&&other.date===job.date&&!['completed','cancelled','canceled'].includes(other.status)&&timeMinutes(other.time)<start+hours*60&&timeMinutes(other.time)+Number(other.estimatedDuration??other.duration??1)*60>start);
}
module.exports={validDay,shiftDay,localDate,memberId,mergeTeam,locationStatus,coordinates,visibleTeamMarkers,jobCounts,teamSummary,availabilityLabel,instantFromLocal,nextScheduledJob,orderedRouteStops,apparentConflict};
