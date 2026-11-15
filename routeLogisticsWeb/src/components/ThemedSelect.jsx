import { useEffect, useId, useRef, useState } from 'react';

// DOM options keep the app's green highlight consistent across native browser
// themes. Searching changes only the menu; a choice commits the controlled value.
export default function ThemedSelect({ id, label, value = '', options = [], onChange, disabled = false, placeholder = 'Search and select…', autoFocus = false, required = false, className = '' }) {
  const generatedId = useId(), inputId = id || generatedId, listId = `${inputId}-options`;
  const root = useRef(null), input = useRef(null), list = useRef(null);
  const [open, setOpen] = useState(false), [search, setSearch] = useState(''), [activeValue, setActiveValue] = useState(value);
  const selected = options.find(option => option.value === value);
  const matches = options.filter(option => option.label.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()));
  const active = matches.findIndex(option => option.value === activeValue);
  const activeOption = matches[active];
  const visible = open && !disabled;
  const close = () => { setOpen(false); setSearch(''); };
  const show = () => { setSearch(''); setActiveValue(value); setOpen(true); };
  useEffect(() => {
    if (!visible) return;
    const outside = event => { if (!root.current?.contains(event.target)) { setOpen(false); setSearch(''); } };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [visible]);
  useEffect(() => { if (visible && active >= 0) list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' }); }, [visible, active, search, activeValue]);
  useEffect(() => { if (disabled) { setOpen(false); setSearch(''); } }, [disabled]);
  const choose = option => {
    if (disabled || !option || option.disabled) return;
    onChange(option.value); close(); input.current?.focus();
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
    if (disabled) return;
    if (event.key === 'Escape' && visible) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') { close(); return; }
    if (event.key === 'Enter') { event.preventDefault(); if (visible) choose(activeOption); else show(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!visible) { show(); if (!selected || selected.disabled) setActiveValue(options.find(option => !option.disabled)?.value); }
      else move(event.key === 'ArrowDown' ? 1 : -1);
    }
    if (visible && (event.key === 'Home' || event.key === 'End')) { event.preventDefault(); move(event.key === 'Home' ? 'first' : 'last'); }
  };
  return <div ref={root} className={`relative ${className}`} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close(); }}>
    <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">{label}{required && <span aria-hidden="true"> *</span>}</label>
    <div className="relative mt-1">
      <input ref={input} id={inputId} role="combobox" aria-label={label} aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={visible} aria-controls={visible ? listId : undefined} aria-activedescendant={visible && activeOption ? `${listId}-${active}` : undefined} aria-required={required || undefined}
        value={visible ? search : value !== '' ? selected?.label || '' : ''} placeholder={visible ? 'Search…' : placeholder} autoComplete="off" autoFocus={autoFocus} disabled={disabled} required={required}
        className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-9 text-gray-900 shadow-sm selection:bg-primary-100 selection:text-primary-900 focus:border-primary-500 focus:ring-primary-500 disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm"
        onFocus={event => event.currentTarget.select?.()} onClick={() => { if (!visible) show(); }}
        onChange={event => { const query = event.target.value; setSearch(query); setOpen(true); setActiveValue(options.find(option => !option.disabled && option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()))?.value); }} onKeyDown={keydown} />
      <svg aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.22 7.22a.75.75 0 011.06 0L10 10.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 8.28a.75.75 0 010-1.06z" clipRule="evenodd" /></svg>
    </div>
    {visible && <ul ref={list} id={listId} role="listbox" aria-label={`${label} options`} className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-primary-200 bg-white py-1 shadow-lg">
      {matches.map((option, index) => <li key={option.value} id={`${listId}-${index}`} role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined} tabIndex={-1}
        className={`flex min-h-9 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${option.disabled ? 'cursor-default text-gray-400' : option.value === activeValue ? 'bg-primary-700 text-white' : option.value === value ? 'bg-primary-100 text-primary-900 hover:bg-primary-200' : 'text-gray-900 hover:bg-primary-50'}`}
        onPointerMove={() => { if (!option.disabled) setActiveValue(option.value); }} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>
        <span>{option.label}</span>{option.value === value && <span aria-hidden="true">✓</span>}
      </li>)}
      {!matches.length && <li role="status" className="px-3 py-3 text-sm text-gray-500">No matches found.</li>}
    </ul>}
  </div>;
}
