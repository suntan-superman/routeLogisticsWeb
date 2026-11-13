// Native permission/picker UI changes AppState without leaving the job workflow.
// The token owns its lifetime; duplicate releases cannot resume another picker.
const active = new Set(), listeners = new Set();
export const isNativeInteractionActive = () => active.size > 0;
export const subscribeNativeInteraction = listener => { listeners.add(listener); return () => listeners.delete(listener); };
function notify() { for (const listener of listeners) listener(isNativeInteractionActive()); }
export function beginNativeInteraction() {
  const token = {}; active.add(token); notify();
  return () => { if (active.delete(token)) notify(); };
}
