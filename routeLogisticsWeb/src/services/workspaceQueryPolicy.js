export const WORKSPACE_POLL_MS = 30_000;
export const WORKSPACE_QUERY_ROOT = 'rl-workspace';

export function workspaceScope(user, claims, workspace, projectId = null) {
  const status = workspace?.status || null;
  const role = claims?.role || null;
  const companyId = claims?.companyId || null, membershipId = claims?.membershipId || null;
  const readable = !!user?.uid && user.emailVerified === true && (
    status === 'company' && !!companyId
      && ['owner', 'admin', 'manager', 'technician'].includes(role) && (role === 'owner' || !!membershipId)
  );
  const key = [WORKSPACE_QUERY_ROOT, projectId, user?.uid || null, companyId, role, membershipId, user?.emailVerified === true, status];
  return { key, id: JSON.stringify(key), readable };
}

export const workspaceErrorCode = error => String(error?.code || '').replace(/^functions\//, '');
export const workspaceAccessError = error => ['permission-denied', 'unauthenticated', 'not-found', 'workspace-changed', 'workspace-unavailable', 'claims-stale', 'auth/user-changed', 'auth/user-disabled', 'auth/user-token-expired', 'auth/invalid-user-token'].includes(workspaceErrorCode(error))
  || /permission[-_ ]denied|unauthenticated|your role does not allow|accept your.*invitation|refresh your workspace|verify your email|active (?:company |team )?membership|workspace changed|no user.*signed in|missing or insufficient permissions/i.test(error?.message || '');
export const retryWorkspaceRead = (failures, error) => failures < 1 && !workspaceAccessError(error)
  && (['unavailable', 'deadline-exceeded', 'internal', 'resource-exhausted'].includes(workspaceErrorCode(error)) || /network|failed to fetch|offline/i.test(error?.message || ''));

// Only successful, known writes invalidate data. Never turn reads, GPS samples,
// OAuth/payment operations, address checks or other provider work into polling.
export function mutationResources(name, data = {}, result = {}) {
  if (result?.success === false || ['conflict', 'failed', 'discarded'].includes(result?.status)) return [];
  if (name === 'rlApplyJobOperation') return result.status === 'synced' ? ['jobs', 'job', 'customer-stats', 'reports', 'analytics', 'operations-report', 'route', 'inquiries'] : [];
  if (['rlManageJob', 'generateServicePlanJob', 'rlGenerateServicePlanJob'].includes(name)) return ['jobs', 'job', 'customers', 'customer', 'customer-stats', 'reports', 'analytics', 'operations-report', 'route', 'service-plans', 'inquiries'];
  if (name === 'rlManageInquiry' && ['create', 'update', 'saveProperty', 'lifecycle'].includes(data.action)) return ['inquiries', 'customers', 'customer', 'customer-properties', 'customer-stats', 'jobs', 'job'];
  if (name === 'rlManageCustomer') return ['customers', 'customer', 'customer-stats', 'jobs', 'job'];
  if (name === 'rlManageServicePlan') return ['service-plans', 'jobs', 'job', 'route'];
  if (['rlManageStaffAvailability', 'manageTeamMember', 'sendTeamInviteEmail', 'acceptTeamInvite', 'transferCompanyOwnership'].includes(name)) return ['team', 'team-locations', 'schedule-roster', 'availability', 'company', 'route'];
  if (['rlCreateCompany', 'rlSetLocationPolicy', 'rlSetLocationRetention'].includes(name)) return ['company', 'team-locations'];
  if (name === 'rlWorkShift' && ['start', 'end'].includes(data.action)) return ['work-shift', 'team-locations'];
  if (name === 'rlSaveDailyRoute') return ['route'];
  if (name === 'rlJobVisit' && data.action === 'record') return ['job-visits', 'job', 'jobs'];
  if (name === 'rlJobException' && ['request', 'resolve', 'dismiss'].includes(data.action)) return ['jobs', 'job', 'job-exceptions'];
  if (name === 'rlJobPhoto' && ['upload', 'delete', 'update'].includes(data.action)) return ['job-photos', 'job'];
  if (name === 'rlRecordApplication') return ['service-logs', 'job'];
  if (name === 'rlServiceForms' && ['save', 'assign'].includes(data.action)) return ['service-forms', 'job'];
  if (name === 'rlServiceAreas' && ['save', 'exception', 'approve-exception'].includes(data.action)) return ['service-areas', 'company'];
  if (name === 'rlEstimate' && ['save', 'create', 'update', 'revise', 'send', 'deliver', 'convert', 'archive', 'delete'].includes(data.action)) return ['estimates', 'estimate', 'jobs', 'job', 'reports'];
  if (name === 'rlManageInvoice' && ['create', 'replace', 'update', 'status'].includes(data.action)) return ['invoices', 'invoice', 'jobs', 'job', 'payments', 'analytics', 'reports', 'invoice-preview'];
  if (['emailInvoice', 'rlCancelInvoicePayment', 'rlRecordPayment'].includes(name)) return ['invoices', 'invoice', 'payments', 'reports'];
  if (name === 'rlSmsCustomerConsent' && ['grant', 'revoke'].includes(data.action)) return ['customers', 'customer', 'sms-consent'];
  if (name === 'rlSmsConfig' && data.action === 'save') return ['sms-config'];
  return [];
}
