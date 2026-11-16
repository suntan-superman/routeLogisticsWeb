import { useCallback, useEffect, useId, useRef, useState } from 'react';

// DOM options keep the app's green highlight consistent across native browser
// themes. Searching changes only the menu; a choice commits the controlled value.
export default function ThemedSelect({ id, label, value = '', options = [], onChange, disabled = false, placeholder = 'Search and select…', autoFocus = false, required = false, className = '', hideLabel = false, showEmptyLabel = false, name, inputClassName = '', inputProps = {} }) {
  const generatedId = useId(), inputId = id || generatedId, listId = `${inputId}-options`;
  const root = useRef(null), input = useRef(null), list = useRef(null);
  const [open, setOpen] = useState(false), [search, setSearch] = useState(''), [activeValue, setActiveValue] = useState(value);
  const [inferredLabel, setInferredLabel] = useState('');
  const selected = options.find(option => option.value === value);
  const matches = options.filter(option => option.label.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()));
  const active = matches.findIndex(option => option.value === activeValue);
  const activeOption = matches[active];
  const inheritedDisabled = input.current?.matches?.(':disabled') === true;
  const visible = open && !disabled && !inheritedDisabled;
  const isDisabled = useCallback(() => disabled || input.current?.matches?.(':disabled') === true, [disabled]);
  const close = () => { setOpen(false); setSearch(''); };
  const show = () => { if(isDisabled())return;setSearch(''); setActiveValue(value); setOpen(true); };
  useEffect(() => {
    if (!visible) return;
    const outside = event => { if (!root.current?.contains(event.target)) { setOpen(false); setSearch(''); } };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [visible]);
  useEffect(() => { if (visible && active >= 0) list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' }); }, [visible, active, search, activeValue]);
  useEffect(() => { if (disabled) { setOpen(false); setSearch(''); } }, [disabled]);
  useEffect(()=>{if(open&&isDisabled()){setOpen(false);setSearch('');}},[open,isDisabled,inheritedDisabled]);
  useEffect(() => {
    if (!label) setInferredLabel([...(input.current?.labels || [])].map(item => {const copy=item.cloneNode?.(true)||item;copy.querySelectorAll?.('[role="listbox"], input, button, select, textarea').forEach(node=>node.remove());return copy.textContent.trim();}).filter(Boolean).join(' '));
    input.current?.setCustomValidity?.(required && (!selected || value === '') ? 'Choose an option from the list.' : '');
  }, [label, required, selected, value]);
  const choose = option => {
    if (isDisabled() || !option || option.disabled) return;
    onChange?.(option.value); close(); input.current?.focus();
  };
  const move = direction => {
    const first = direction === 'first', last = direction === 'last';
    let index = first ? 0 : last ? matches.length - 1 : active < 0 ? direction === -1 ? 0 : -1 : active;
    for (let count = 0; count < matches.length; count++) {
      if (!first && !last || count) index = (index + (last || direction === -1 ? -1 : 1) + matches.length) % matches.length;
      if (!matches[index]?.disabled) { setActiveValue(matches[index].value); break; }
    }
  };
  const keydown = event => {
    if (isDisabled()) return;
    if (event.key === 'Escape' && visible) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') { close(); return; }
    if (event.key === 'Enter') { event.preventDefault(); if (visible) choose(activeOption); else show(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!visible) { show(); if (!selected || selected.disabled) setActiveValue((event.key==='ArrowUp'?options.findLast(option=>!option.disabled):options.find(option => !option.disabled))?.value); }
      else move(event.key === 'ArrowDown' ? 1 : -1);
    }
    if (visible && (event.key === 'Home' || event.key === 'End')) { event.preventDefault(); move(event.key === 'Home' ? 'first' : 'last'); }
  };
  return <div ref={root} className={`relative ${className}`} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close(); }}>
    {!hideLabel && <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">{label}{required && <span aria-hidden="true"> *</span>}</label>}
    {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
    <div className={`relative ${hideLabel ? '' : 'mt-1'}`}>
      <input {...inputProps} ref={input} id={inputId} role="combobox" data-selected-value={value} aria-label={label || inputProps['aria-label'] || inferredLabel || undefined} aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={visible} aria-controls={visible ? listId : undefined} aria-activedescendant={visible && activeOption ? `${listId}-${active}` : undefined} aria-required={required || undefined}
        value={visible ? search : value !== '' || showEmptyLabel ? selected?.label || '' : ''} placeholder={visible ? 'Search…' : placeholder} autoComplete="off" autoFocus={autoFocus} disabled={disabled} required={required}
        className={`block w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-9 text-gray-900 shadow-sm selection:bg-primary-100 selection:text-primary-900 focus:border-primary-500 focus:ring-primary-500 disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm ${inputClassName}`}
        onFocus={event => { event.currentTarget.select?.(); inputProps.onFocus?.(event); }} onClick={() => { if (!visible) show(); }}
        onInvalid={event => { inputProps.onInvalid?.(event); if (!disabled) { show(); input.current?.focus(); } }}
        onChange={event => { const query = event.target.value; setSearch(query); setOpen(true); setActiveValue(options.find(option => !option.disabled && option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()))?.value); }} onKeyDown={keydown} />
      <svg aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.22 7.22a.75.75 0 011.06 0L10 10.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 8.28a.75.75 0 010-1.06z" clipRule="evenodd" /></svg>
    </div>
    {visible && <ul ref={list} id={listId} role="listbox" aria-label={`${label || inferredLabel || 'Selection'} options`} className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-primary-200 bg-white py-1 shadow-lg">
      {matches.map((option, index) => <li key={option.value} id={`${listId}-${index}`} role="option" data-option-value={option.value} data-option-label={option.label} aria-selected={option.value === value} aria-disabled={option.disabled || undefined} tabIndex={-1}
        className={`flex min-h-9 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${option.disabled ? 'cursor-default text-gray-400' : option.value === activeValue ? 'bg-primary-700 text-white' : option.value === value ? 'bg-primary-100 text-primary-900 hover:bg-primary-200' : 'text-gray-900 hover:bg-primary-50'}`}
        onPointerMove={() => { if (!option.disabled&&!isDisabled()) setActiveValue(option.value); }} onMouseDown={event => event.preventDefault()} onClick={event => {event?.preventDefault?.();event?.stopPropagation?.();choose(option);}}>
        <span>{option.label}</span>{option.value === value && <span aria-hidden="true">✓</span>}
      </li>)}
      {!matches.length && <li role="status" className="px-3 py-3 text-sm text-gray-500">No matches found.</li>}
    </ul>}
  </div>;
}
