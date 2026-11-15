const clockTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const isQuarterHour = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(value);

export function formatClockTime(value) {
  if (typeof value !== 'string' || !clockTime.test(value)) return String(value ?? '');
  const [hours, minutes] = value.split(':');
  const hour = Number(hours);
  return `${hour % 12 || 12}:${minutes} ${hour < 12 ? 'AM' : 'PM'}`;
}

export const QUARTER_HOUR_OPTIONS = Object.freeze(Array.from({ length: 96 }, (_, index) => {
  const value = `${String(Math.floor(index / 4)).padStart(2, '0')}:${String(index % 4 * 15).padStart(2, '0')}`;
  return Object.freeze({ value, label: formatClockTime(value) });
}));

export function quarterHourOptions(currentValue) {
  if (currentValue == null || currentValue === '' || isQuarterHour(currentValue)) return QUARTER_HOUR_OPTIONS;
  // Preserve a recorded non-quarter time when unrelated details are edited.
  // It can be displayed, but every newly selectable value remains a quarter hour.
  const legacy = { value: String(currentValue), label: `${formatClockTime(currentValue)} (current recorded time)`, disabled: true };
  return [...QUARTER_HOUR_OPTIONS, legacy].sort((left, right) => left.value.localeCompare(right.value));
}
