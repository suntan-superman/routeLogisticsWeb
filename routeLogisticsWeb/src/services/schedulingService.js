import { callWorkspace } from './workspaceApi';

export function schedulingFingerprint({ companyId, memberId, date, time, estimatedDuration, jobId, servicePlanId } = {}) {
  return JSON.stringify([companyId || null, memberId || null, date || '', time || '', Number(estimatedDuration), jobId || null, servicePlanId || null]);
}

export function getSchedulingRoster(companyId) {
  return callWorkspace('rlCheckAvailability', { action: 'roster', companyId: companyId || null });
}

export function checkSchedulingAvailability({ companyId, memberId, date, time, estimatedDuration, jobId, servicePlanId, allowedWeekdays }) {
  return callWorkspace('rlCheckAvailability', {
    action: 'check', companyId: companyId || null, memberId: memberId || null, date, time, estimatedDuration: Number(estimatedDuration),
    ...(jobId ? { jobId } : {}), ...(servicePlanId ? { servicePlanId } : {}), ...(Array.isArray(allowedWeekdays) ? { allowedWeekdays } : {}),
  });
}
