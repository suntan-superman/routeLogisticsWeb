const { HttpsError } = require('firebase-functions/v2/https');
const { requireAuth, requireStaff } = require('./security');
const policy = require('./shared/capabilities.json');
const hasCapability = (role, capability) => (policy.roles[role] || []).includes(capability);

async function accessScope(db, request) {
  const { token } = requireAuth(request, true);
  if (token.companyId) {
    const staff = await requireStaff(db, request, token.companyId);
    return { ...staff, companyId: token.companyId, solo: false };
  }
  throw new HttpsError('permission-denied', 'An active company membership is required.');
}
async function requireCapability(db, request, capability, data) {
  const scope = await accessScope(db, request);
  if (!hasCapability(scope.role, capability) || (data && data.companyId !== scope.companyId)) {
    throw new HttpsError('permission-denied', 'Your role does not allow this operation.');
  }
  return scope;
}
function checkJob(scope, job) {
  if (!job || job.companyId !== scope.companyId
    || (scope.role === 'technician' && job.assignedTo !== scope.memberId)) {
    throw new HttpsError('permission-denied', 'This job is not assigned to your workspace.');
  }
}
module.exports = { policy, hasCapability, accessScope, requireCapability, checkJob };
