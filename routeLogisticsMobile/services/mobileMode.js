const FIELD_MODE = 'field';
const MANAGEMENT_MODE = 'management';
const pendingSaves = new Map();

function canUseManagementMode(user, permissions) {
  return !!user?.id && !!user?.companyId && ['owner', 'manager', 'admin'].includes(user.role)
    && permissions?.canAccess === true && permissions.can?.('dispatch.manage') === true;
}
function workspaceModeKey(user) {
  if (!user?.id || !user?.companyId) return null;
  return `rl-workspace-mode-v1:${encodeURIComponent(user.id)}:${encodeURIComponent(user.companyId)}`;
}
function permittedMode(value, user, permissions) {
  return value === MANAGEMENT_MODE && canUseManagementMode(user, permissions) ? MANAGEMENT_MODE : FIELD_MODE;
}
async function loadWorkspaceMode(storage, user, permissions) {
  const key = workspaceModeKey(user);
  if (!key || !canUseManagementMode(user, permissions)) return FIELD_MODE;
  await pendingSaves.get(key);
  return permittedMode(await storage.getItem(key), user, permissions);
}
function saveWorkspaceMode(storage, user, permissions, mode) {
  const key = workspaceModeKey(user);
  if (!key || ![FIELD_MODE, MANAGEMENT_MODE].includes(mode) || permittedMode(mode, user, permissions) !== mode) return Promise.reject(new Error('This workspace does not allow that mobile mode.'));
  // Serialize only preference writes. Mode switches never touch the work queue,
  // Firebase claims, membership, or location permissions.
  const previous = pendingSaves.get(key) || Promise.resolve();
  const task = previous.catch(() => {}).then(() => storage.setItem(key, mode));
  pendingSaves.set(key, task);
  task.finally(() => { if (pendingSaves.get(key) === task) pendingSaves.delete(key); }).catch(() => {});
  return task;
}
function isPersonallyAssigned(job, user) {
  if (!job || !user?.id) return false;
  if (!user.companyId) return !job.companyId && job.userId === user.id;
  if (job.companyId !== user.companyId) return false;
  if (job.assignedToUid) return job.assignedToUid === user.id;
  return !!job.assignedTo && [user.membershipId, user.id].filter(Boolean).includes(job.assignedTo);
}
function personalJobs(jobs, user) {
  return (Array.isArray(jobs) ? jobs : []).filter(job => isPersonallyAssigned(job, user));
}
function personalRouteMember(user) {
  return user?.role === 'owner' ? user.id : user?.membershipId || user?.id;
}
module.exports = { FIELD_MODE, MANAGEMENT_MODE, canUseManagementMode, workspaceModeKey, permittedMode,
  loadWorkspaceMode, saveWorkspaceMode, isPersonallyAssigned, personalJobs, personalRouteMember };
