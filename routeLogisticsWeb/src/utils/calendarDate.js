const displayOptions = { year: 'numeric', month: 'short', day: 'numeric' };

// Service dates are calendar values. Timestamps remain instants and retain
// their existing local-time display; numbers are milliseconds, never seconds.
export function formatCalendarDate(value) {
  if (value == null || value === '') return '—';
  try {
    let date;
    const parts = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (parts) {
      const [year, month, day] = parts.slice(1).map(Number);
      if (year < 1) return '—';
      date = new Date(0);
      date.setHours(12, 0, 0, 0);
      // setFullYear also preserves years 1–99, unlike the Date constructor.
      date.setFullYear(year, month - 1, day);
      if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '—';
    } else if (typeof value?.toDate === 'function') {
      date = value.toDate();
    } else if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) {
      date = new Date(value);
    } else return '—';
    return date instanceof Date && Number.isFinite(date.getTime())
      ? date.toLocaleDateString('en-US', displayOptions)
      : '—';
  } catch { return '—'; }
}
