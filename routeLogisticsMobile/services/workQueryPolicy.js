const WORK_POLL_MS = 30_000;
const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function workScopeKey(user) {
  return ['rl-work', 'mi-factotum-field-service', user?.id || null, user?.companyId || null,
    user?.role || null, user?.membershipId || null, user?.emailVerified === true, user?.workspace?.status || null];
}
function periodRange(period, day) {
  const [year, month, date] = day.split('-').map(Number), start = new Date(year, month - 1, date), end = new Date(year, month - 1, date);
  if (period === 'week') { start.setDate(start.getDate() - start.getDay()); end.setDate(start.getDate() + 6); }
  if (period === 'month') { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); }
  return { startDate: localDay(start), endDate: localDay(end) };
}
const errorCode = error => String(error?.code || '').replace(/^functions\//, '');
function needsWorkspaceValidation(error) {
  return ['permission-denied', 'unauthenticated', 'workspace-changed', 'workspace-unavailable', 'claims-stale'].includes(errorCode(error))
    || /workspace changed|Accept your company invitation|refresh your workspace before continuing|No user is currently signed in|verify your email|current claims|active company membership|active team member/i.test(error?.message || '');
}
function accessError(error) { return needsWorkspaceValidation(error) || errorCode(error) === 'not-found'; }
const retryWorkRead = (failures, error) => failures < 1 && !accessError(error)
  && ['unavailable', 'deadline-exceeded', 'internal', 'resource-exhausted'].includes(String(error?.code || '').replace(/^functions\//, ''));
module.exports = { WORK_POLL_MS, localDay, workScopeKey, periodRange, errorCode, accessError, needsWorkspaceValidation, retryWorkRead };
