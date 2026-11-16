import { Children, Fragment, isValidElement, useState } from 'react';
import ThemedSelect from './ThemedSelect';

const optionText = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Children.toArray(node).map(child => isValidElement(child) ? optionText(child.props.children) : typeof child === 'string' || typeof child === 'number' ? String(child) : '').join('');
function flattenOptions(children, inheritedDisabled = false) {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement(child)) return [];
    if (child.type === Fragment || child.type === 'optgroup') return flattenOptions(child.props.children, inheritedDisabled || child.props.disabled);
    if (child.type !== 'option') return [];
    const label = child.props.label || optionText(child.props.children);
    return [{ value: String(child.props.value ?? label), label, disabled: inheritedDisabled || child.props.disabled === true }];
  });
}

// Drop-in single-select adapter keeps existing form events/values while using
// the shared green DOM menu instead of an OS-controlled blue native popup.
export default function SelectControl({ children, value, defaultValue, onChange, id, name, required = false, disabled = false, className = '', style, ...props }) {
  const options = flattenOptions(children);
  const [localValue, setLocalValue] = useState(() => String(defaultValue ?? options.find(option=>!option.disabled)?.value ?? ''));
  const selectedValue = value === undefined ? options.some(option=>option.value===localValue)?localValue:options.find(option=>!option.disabled)?.value??'' : String(value ?? '');
  const change = next => {
    if (disabled) return;
    setLocalValue(next);
    const target = { id, name, value: next, type: 'select-one' };
    onChange?.({ target, currentTarget: target, preventDefault() {}, stopPropagation() {} });
  };
  return <ThemedSelect id={id} label={props['aria-label']} value={selectedValue} options={options} onChange={change}
    name={name} required={required} disabled={disabled} autoFocus={props.autoFocus} hideLabel showEmptyLabel
    placeholder={options.find(option => option.value === '')?.label || 'Choose an option…'}
    inputClassName={className} inputProps={{ ...props, style }} />;
}
