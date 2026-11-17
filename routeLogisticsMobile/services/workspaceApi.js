import { httpsCallable } from 'firebase/functions';
import { functions, auth } from '../constants/firebase';
import { getClaims, getWorkspace } from './tenancy';
import { workScopeKey } from './workQueryPolicy';
import { writeResources, publishWorkWrite } from './workQueryEvents';
const scope = () => workScopeKey({ ...getClaims(), id: auth.currentUser?.uid, emailVerified: auth.currentUser?.emailVerified === true, workspace: getWorkspace() });
export const callWorkspace = async (name, data = {}, options) => {
  const before = scope(), result = (await httpsCallable(functions, name, options)(data)).data;
  const resources = writeResources(name, data, result);
  if (resources.length && JSON.stringify(before) === JSON.stringify(scope())) publishWorkWrite({ scope: before, resources, jobId: data.jobId || (name === 'rlManageJob' ? data.id || result?.id : undefined) });
  return result;
};
export const readWorkspace = (resource, data = {}, callableOptions) => callWorkspace('rlReadWorkspace', { resource, ...data }, callableOptions);
