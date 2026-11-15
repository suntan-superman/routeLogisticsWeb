import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { portalFunctions, portalReady } from './portal';

const invoke = (client, name, data) => httpsCallable(client, name)(data).then(result => result.data);
export async function customerReviews(action, data = {}) {
  await portalReady;
  return invoke(portalFunctions, 'rlCustomerReviews', { ...data, action });
}
export const providerReviews = (action, data = {}) => invoke(functions, 'rlProviderReviews', { ...data, action });
export const reviewInvitationSettings = (action, data = {}) => invoke(functions, 'rlReviewInvitationSettings', { ...data, action });
export const reviewInvitation = (action, data = {}) => invoke(portalFunctions, 'rlReviewInvitation', { ...data, action });

export function reviewCredentials(fragment) {
  const values = new URLSearchParams(String(fragment || '').replace(/^#/, ''));
  const invitationId = values.get('id'), token = values.get('token');
  if (!invitationId || !/^[A-Za-z0-9_-]{1,200}$/.test(invitationId) || !/^[a-f0-9]{64}$/.test(token || '')) throw new Error('Open the complete review invitation link from your service provider.');
  return { id: invitationId, token };
}
