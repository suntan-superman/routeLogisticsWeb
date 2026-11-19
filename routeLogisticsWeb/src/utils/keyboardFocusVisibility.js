const DATA_ENTRY_TARGET = [
  "input:not([type='hidden'])",
  'textarea',
  'select',
  "[role='combobox']",
  "[contenteditable='true']",
].join(', ');

const FORM_ACTION_TARGET = [
  'button',
  "[tabindex]:not([tabindex='-1'])",
].join(', ');

const FORM_REGION = "form, [role='dialog'], [data-rl-keep-focus-visible]";

export function isFormFocusTarget(target) {
  return !!target
    && typeof target.matches === 'function'
    && !target.disabled
    && (target.matches(DATA_ENTRY_TARGET)
      || (target.matches(FORM_ACTION_TARGET)
        && typeof target.closest === 'function'
        && !!target.closest(FORM_REGION)));
}

export function revealKeyboardFocus(target, schedule) {
  if (!isFormFocusTarget(target)) return false;
  const run = typeof schedule === 'function'
    ? schedule
    : globalThis.requestAnimationFrame?.bind(globalThis) || (callback => globalThis.setTimeout(callback, 0));
  run(() => {
    if (target.isConnected === false || typeof target.scrollIntoView !== 'function') return;
    target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  });
  return true;
}

export function installKeyboardFocusVisibility(documentRef = globalThis.document, schedule) {
  if (!documentRef?.addEventListener) return () => {};
  let keyboardTab = false;

  const onKeyDown = event => {
    keyboardTab = event.key === 'Tab';
  };
  const onPointer = () => { keyboardTab = false; };
  const onFocus = event => {
    if (keyboardTab) revealKeyboardFocus(event.target, schedule);
  };

  documentRef.addEventListener('keydown', onKeyDown, true);
  documentRef.addEventListener('focusin', onFocus, true);
  documentRef.addEventListener('pointerdown', onPointer, true);
  documentRef.addEventListener('touchstart', onPointer, true);

  return () => {
    documentRef.removeEventListener('keydown', onKeyDown, true);
    documentRef.removeEventListener('focusin', onFocus, true);
    documentRef.removeEventListener('pointerdown', onPointer, true);
    documentRef.removeEventListener('touchstart', onPointer, true);
  };
}
