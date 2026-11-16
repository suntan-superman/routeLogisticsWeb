import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';
import { getClaims, getWorkspace } from './tenancy';
import { workspaceScope } from './workspaceQueryPolicy';
import { publishWorkspaceChange } from './workspaceQueryEvents';
export const callWorkspace = async (name, data = {}) => {
  const scope = workspaceScope(auth.currentUser, getClaims(), getWorkspace(), auth.app?.options?.projectId);
  const result = (await httpsCallable(functions, name)(data)).data;
  if (scope.readable) publishWorkspaceChange(scope.id, name, data, result);
  return result;
};
export const readWorkspace = (resource, options = {}) => callWorkspace('rlReadWorkspace', { resource, ...options });
