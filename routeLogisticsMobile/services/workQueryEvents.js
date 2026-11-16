const listeners = new Set();
function writeResources(name, data = {}, result) {
  if (result?.success === false || ['conflict', 'failed'].includes(result?.status)) return [];
  if (name === 'rlApplyJobOperation') return result?.status === 'synced' ? ['jobs'] : [];
  if (name === 'rlManageJob' && ['create', 'update', 'assign', 'delete'].includes(data.action)) return ['jobs'];
  if (name === 'rlManageCustomer' && ['create', 'update', 'delete'].includes(data.action)) return ['customers', 'jobs'];
  if (name === 'rlRecordApplication') return ['applications'];
  if (name === 'rlJobPhoto' && ['upload', 'delete'].includes(data.action)) return ['photos', 'service-form'];
  if (name === 'rlJobVisit' && data.action === 'record') return ['visits'];
  if (name === 'rlServiceForms' && ['assign', 'save'].includes(data.action)) return ['service-form'];
  if (name === 'rlManageStaffAvailability') return ['team', 'locations', 'jobs'];
  if (name === 'rlWorkShift' && ['start', 'end'].includes(data.action)) return ['team', 'locations', 'shift'];
  if (name === 'rlSaveDailyRoute') return ['jobs'];
  if (name === 'rlEstimate' && ['save', 'send', 'approve', 'reject', 'convert', 'cancel', 'photo-upload', 'photo-delete'].includes(data.action)) return ['estimates', 'jobs'];
  return [];
}
function matchesWrite(queryKey, event) {
  const scope = event.scope;
  if (!Array.isArray(scope) || JSON.stringify(queryKey.slice(0, scope.length)) !== JSON.stringify(scope)) return false;
  const [family, one, two] = queryKey.slice(scope.length), resources = event.resources || [];
  if (['jobs', 'job', 'route'].includes(family)) return resources.includes('jobs');
  if (family === 'management') return resources.includes(['jobs', 'route'].includes(one) ? 'jobs' : one);
  if (family === 'job-resource') return (!event.jobId || event.jobId === one) && resources.includes(two);
  return resources.includes(family);
}
function publishWorkWrite(event) {
  if (!event.resources?.length) return;
  for (const listener of listeners) {
    try { Promise.resolve(listener(event)).catch(() => {}); } catch { /* Refresh cannot undo a committed write. */ }
  }
}
const subscribeWorkWrites = listener => { listeners.add(listener); return () => listeners.delete(listener); };
module.exports = { writeResources, matchesWrite, publishWorkWrite, subscribeWorkWrites };
