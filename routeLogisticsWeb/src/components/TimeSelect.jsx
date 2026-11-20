import ThemedSelect from './ThemedSelect';
import { isQuarterHour, quarterHourOptions } from '../utils/quarterHours';

export default function TimeSelect({ id, label = 'Time', value, onChange, disabled = false, className, required = false, hideLabel = false }) {
  return <ThemedSelect id={id} label={label} value={value} options={quarterHourOptions(value)} onChange={time => { if (isQuarterHour(time)) onChange(time); }}
    disabled={disabled} className={className} required={required} hideLabel={hideLabel} placeholder="Choose a time…" />;
}
