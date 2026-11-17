import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

const callAssistant = async data => (await httpsCallable(functions, 'rlAssistant')(data)).data;

export const sendAssistantMessage = ({ sessionId, message, route }) => callAssistant({ action: 'message', sessionId: sessionId || null, message, route });
export const loadAssistantHistory = sessionId => callAssistant({ action: 'history', sessionId });
export const closeAssistantSession = sessionId => callAssistant({ action: 'close', sessionId });
export const escalateAssistantSession = data => callAssistant({ action: 'escalate', ...data });
export const readAssistantStatus = () => callAssistant({ action: 'status' });

export function assistantErrorMessage(error) {
  const code = String(error?.code || '').replace(/^functions\//, '');
  if (code === 'resource-exhausted') return 'Too many requests. Please wait a moment and try again.';
  if (code === 'unauthenticated') return 'Your session expired. Sign in again to continue.';
  if (code === 'permission-denied') return 'Your current workspace no longer allows access to this conversation.';
  if (code === 'failed-precondition') return 'This conversation has ended. Start a new conversation.';
  if (code === 'invalid-argument') return error?.message || 'Review the information and try again.';
  return 'AI help is temporarily unavailable. Verified help topics and Workside Support are still available.';
}
