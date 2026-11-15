const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', '-1': 'last' };
const parse = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
};

export function appointmentRecurrence(selection, firstDate) {
  const date = parse(firstDate);
  if (!selection || !date || !['weekly', 'monthly', 'quarterly'].includes(selection.frequency)) return null;
  const interval = Number(selection.interval ?? 1);
  if (!Number.isInteger(interval) || interval < 1 || interval > (selection.frequency === 'weekly' ? 52 : 12)) return null;
  const rule = { version: 1, frequency: selection.frequency, interval, anchorDate: firstDate };
  if (rule.frequency === 'weekly') return { ...rule, weekday: date.getUTCDay() };
  if (selection.monthlyMode === 'weekday') {
    const ordinal = Math.floor((date.getUTCDate() - 1) / 7) + 1;
    return { ...rule, monthlyMode: 'weekday', weekday: date.getUTCDay(), ordinal: ordinal > 4 ? -1 : ordinal };
  }
  return { ...rule, monthlyMode: 'dayOfMonth', dayOfMonth: date.getUTCDate() };
}

export function describeAppointmentRecurrence(rule) {
  if (!rule) return '';
  if (rule.frequency === 'weekly') return rule.interval > 1 ? `Every ${rule.interval} weeks on ${DAYS[rule.weekday]}` : `Every ${DAYS[rule.weekday]}`;
  const months = (rule.frequency === 'quarterly' ? 3 : 1) * (rule.interval || 1);
  const frequency = months === 1 ? 'Every month' : months === 12 ? 'Every year' : `Every ${months} months`;
  return rule.monthlyMode === 'weekday' ? `${frequency} on the ${ORDINALS[rule.ordinal]} ${DAYS[rule.weekday]}` : `${frequency} on day ${rule.dayOfMonth}${rule.dayOfMonth > 28 ? ' (the last day in shorter months)' : ''}`;
}

export function isDateOnAppointmentRecurrence(rule, candidate) {
  if (!rule) return true;
  const date = parse(candidate), anchor = parse(rule.anchorDate);
  if (!date || !anchor || date < anchor) return false;
  if (rule.frequency === 'weekly') return date.getUTCDay() === rule.weekday && Math.round((date - anchor) / 86400000) % (7 * (rule.interval || 1)) === 0;
  const months = (date.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + date.getUTCMonth() - anchor.getUTCMonth();
  if (months % ((rule.frequency === 'quarterly' ? 3 : 1) * (rule.interval || 1))) return false;
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  if (rule.monthlyMode !== 'weekday') return date.getUTCDate() === Math.min(rule.dayOfMonth, lastDay);
  return date.getUTCDay() === rule.weekday && (rule.ordinal === -1 ? date.getUTCDate() + 7 > lastDay : Math.floor((date.getUTCDate() - 1) / 7) + 1 === rule.ordinal);
}
