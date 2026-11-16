import { mutationResources } from './workspaceQueryPolicy';
const listeners = new Set();
export const subscribeWorkspaceChanges = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export function publishWorkspaceChange(scopeId, name, data, result) {
  const resources = mutationResources(name, data, result);
  if (!resources.length) return;
  for (const listener of listeners) {
    try { listener({ scopeId, resources })?.catch?.(() => {}); }
    catch { /* A cache subscriber cannot turn a committed write into a failure. */ }
  }
}
