import { useTheme } from '../contexts/ThemeContext';
import ThemedSelect from './ThemedSelect';

const options = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

// Preference belongs to this browser, independently of sign-in and company.
export default function ThemeControl() {
  const { preference, setPreference } = useTheme();
  return <div data-rl-theme-control="true" className="shrink-0"><ThemedSelect label="Appearance" hideLabel value={preference} options={options}
    onChange={setPreference} className="w-28 shrink-0" inputClassName="!py-1.5 text-sm"
    inputProps={{ readOnly: true, title: 'Choose light, dark or system appearance' }} /></div>;
}
