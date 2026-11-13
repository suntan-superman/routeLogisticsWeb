const { HttpsError } = require('firebase-functions/v2/https');
const { requireAuth, requireStaff } = require('./security');
const { workspaceStatus } = require('./workspace');
const policy = require('./shared/capabilities.json');
const hasCapability = (role, capability) => (policy.roles[role] || []).includes(capability);

async function accessScope(db, request) {
  const { uid, token } = requireAuth(request, true);
  if (token.companyId) {
    const staff = await requireStaff(db, request, token.companyId);
    return { ...staff, companyId: token.companyId, solo: false };
  }
  const workspace = await workspaceStatus(db, { uid, email: token.email, emailVerified: true }, null);
  if (workspace.status !== 'solo') throw new HttpsError('permission-denied', 'An active workspace is required.');
  return { uid, role: 'owner', companyId: null, solo: true };
}
async function requireCapability(db, request, capability, data) {
  const scope = await accessScope(db, request);
  if (!hasCapability(scope.role, capability) || (data && (scope.companyId ? data.companyId !== scope.companyId : data.companyId || data.userId !== scope.uid))) {
    throw new HttpsError('permission-denied', 'Your role does not allow this operation.');
  }
  return scope;
}
function checkJob(scope, job) {
  if (!job || (scope.companyId ? job.companyId !== scope.companyId : job.companyId || job.userId !== scope.uid)
    || (scope.role === 'technician' && job.assignedTo !== scope.memberId)) {
    throw new HttpsError('permission-denied', 'This job is not assigned to your workspace.');
  }
}
module.exports = { policy, hasCapability, accessScope, requireCapability, checkJob };
