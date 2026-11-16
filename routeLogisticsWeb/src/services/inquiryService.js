import { callWorkspace } from './workspaceApi';

export const inquirySources = [{ value: 'phone', label: 'Phone' }, { value: 'website', label: 'Website' }, { value: 'referral', label: 'Referral' }, { value: 'existing_customer', label: 'Existing customer' }, { value: 'walk_in', label: 'Walk-in' }, { value: 'other', label: 'Other' }];
export const inquiryStatuses = [{ value: 'new', label: 'New' }, { value: 'contacted', label: 'Contacted' }, { value: 'estimate_scheduled', label: 'Estimate scheduled' }, { value: 'estimate_completed', label: 'Estimate completed' }, { value: 'converted', label: 'Converted' }, { value: 'closed', label: 'Closed' }];
export const manageInquiry = (action, data = {}) => callWorkspace('rlManageInquiry', { action, ...data });
export const customerLifecycle = customer => ['prospect', 'active', 'inactive'].includes(customer?.lifecycle) ? customer.lifecycle : 'active';
export const lifecycleLabel = customer => ({ prospect: 'Prospect', active: 'Active customer', inactive: 'Inactive customer' })[customerLifecycle(customer)];

export function readInquiryDraft(scopeId) {
  try { return JSON.parse(localStorage.getItem(`rl-inquiry-draft-v1:${scopeId}`) || 'null'); } catch { return null; }
}
export function writeInquiryDraft(scopeId, draft) {
  try { if (draft === null) localStorage.removeItem(`rl-inquiry-draft-v1:${scopeId}`); else localStorage.setItem(`rl-inquiry-draft-v1:${scopeId}`, JSON.stringify(draft)); return true; } catch { return false; }
}
export function inquiryAppointmentOperation(scopeId, inquiryId) {
  const key = `rl-inquiry-appointment-v1:${scopeId}:${inquiryId}`;
  try { const saved = localStorage.getItem(key); if (saved) return saved; const id = crypto.randomUUID(); localStorage.setItem(key, id); return id; } catch { return crypto.randomUUID(); }
}
