import { httpsCallable } from 'firebase/functions';
import { functions } from '../constants/firebase';
export const callWorkspace = (name, data = {}) => httpsCallable(functions, name)(data).then(result => result.data);
export const readWorkspace = (resource, options = {}) => callWorkspace('rlReadWorkspace', { resource, ...options });
