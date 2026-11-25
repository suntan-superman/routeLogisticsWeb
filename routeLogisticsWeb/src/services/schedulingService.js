import { callWorkspace } from './workspaceApi';

export function schedulingFingerprint({ companyId, memberId, date, time, estimatedDuration, jobId, servicePlanId, serviceCategory, serviceType } = {}) {
  return JSON.stringify([companyId || null, memberId || null, date || '', time || '', Number(estimatedDuration), jobId || null, servicePlanId || null, serviceCategory || '', serviceType || '']);
}

export function getSchedulingRoster(companyId) {
  return callWorkspace('rlCheckAvailability', { action: 'roster', companyId: companyId || null });
}

export function checkSchedulingAvailability({ companyId, memberId, date, time, estimatedDuration, jobId, servicePlanId, allowedWeekdays, serviceCategory, serviceType }) {
  return callWorkspace('rlCheckAvailability', {
    action: 'check', companyId: companyId || null, memberId: memberId || null, date, time, estimatedDuration: Number(estimatedDuration),
    ...(serviceCategory ? { serviceCategory } : {}), ...(serviceType ? { serviceType } : {}),
    ...(jobId ? { jobId } : {}), ...(servicePlanId ? { servicePlanId } : {}), ...(Array.isArray(allowedWeekdays) ? { allowedWeekdays } : {}),
  });
}
