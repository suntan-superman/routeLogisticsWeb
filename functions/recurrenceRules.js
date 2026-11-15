const { HttpsError } = require('firebase-functions/v2/https');

const DAY = 86400000;
const fail = message => { throw new HttpsError('invalid-argument', message); };
function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('Choose a valid service date.');
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail('Choose a valid service date.');
  return date;
}
function dateString(date) {
  const value = date.toISOString();
  if (!/^\d{4}-/.test(value)) fail('The recurrence exceeds the supported calendar range.');
  return value.slice(0, 10);
}
const integer = (value, minimum, maximum, label) => {
  if (!Number.isInteger(value) || value < minimum || value > maximum) fail(`Choose a valid ${label}.`);
  return value;
};
function monthDate(year, month, rule) {
  const first = new Date('2000-01-01T12:00:00Z');
  first.setUTCFullYear(year, month, 1);
  const last = new Date(first); last.setUTCMonth(last.getUTCMonth() + 1, 0);
  let day;
  if (rule.monthlyMode === 'weekday') {
    day = rule.ordinal === -1
      ? last.getUTCDate() - (last.getUTCDay() - rule.weekday + 7) % 7
      : 1 + (rule.weekday - first.getUTCDay() + 7) % 7 + (rule.ordinal - 1) * 7;
  } else day = Math.min(rule.dayOfMonth, last.getUTCDate());
  first.setUTCDate(day);
  return first;
}
function normalizeRecurrence(input, firstDate) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== undefined && input.version !== 1) fail('Choose a supported recurring appointment pattern.');
  if (!['weekly', 'monthly', 'quarterly'].includes(input.frequency)) fail('Choose weekly, monthly or quarterly recurrence.');
  const anchorDate = firstDate || input.anchorDate, anchor = calendarDate(anchorDate);
  const interval = input.interval === undefined ? 1 : integer(input.interval, 1, input.frequency === 'weekly' ? 52 : 12, 'recurrence interval');
  const rule = { version: 1, frequency: input.frequency, interval, anchorDate };
  if (input.frequency === 'weekly') {
    rule.weekday = input.weekday === undefined ? anchor.getUTCDay() : integer(input.weekday, 0, 6, 'service weekday');
    if (rule.weekday !== anchor.getUTCDay()) fail('Choose a first service date on the selected weekday.');
    return rule;
  }
  rule.monthlyMode = input.monthlyMode || 'dayOfMonth';
  if (!['dayOfMonth', 'weekday'].includes(rule.monthlyMode)) fail('Choose the monthly date or weekday pattern.');
  if (rule.monthlyMode === 'weekday') {
    rule.weekday = input.weekday === undefined ? anchor.getUTCDay() : integer(input.weekday, 0, 6, 'service weekday');
    const ordinal = input.ordinal === undefined ? Math.ceil(anchor.getUTCDate() / 7) : input.ordinal;
    rule.ordinal = ordinal === -1 || input.ordinal === undefined && ordinal === 5 ? -1 : integer(ordinal, 1, 4, 'weekday occurrence');
  } else rule.dayOfMonth = input.dayOfMonth === undefined ? anchor.getUTCDate() : integer(input.dayOfMonth, 1, 31, 'monthly service day');
  if (dateString(monthDate(anchor.getUTCFullYear(), anchor.getUTCMonth(), rule)) !== anchorDate) fail('Choose a first service date that matches the recurring monthly pattern.');
  return rule;
}
function nextRecurrenceDate(input, currentDate) {
  const rule = normalizeRecurrence(input, input?.anchorDate), anchor = calendarDate(rule.anchorDate), current = calendarDate(currentDate);
  if (current < anchor) return rule.anchorDate;
  if (rule.frequency === 'weekly') {
    const step = rule.interval * 7, elapsed = Math.floor((current - anchor) / DAY), next = new Date(anchor);
    next.setUTCDate(anchor.getUTCDate() + (Math.floor(elapsed / step) + 1) * step);
    return dateString(next);
  }
  const step = (rule.frequency === 'quarterly' ? 3 : 1) * rule.interval;
  const elapsed = (current.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + current.getUTCMonth() - anchor.getUTCMonth();
  let period = Math.max(0, Math.floor(elapsed / step));
  let next = monthDate(anchor.getUTCFullYear(), anchor.getUTCMonth() + period * step, rule);
  if (next <= current) next = monthDate(anchor.getUTCFullYear(), anchor.getUTCMonth() + ++period * step, rule);
  return dateString(next);
}
function firstOccurrenceOnOrAfter(input, requestedDate) {
  const date = calendarDate(requestedDate);
  date.setUTCDate(date.getUTCDate() - 1);
  return nextRecurrenceDate(input, dateString(date));
}
// Compatibility metadata only. Calendar rules never advance by these day counts.
function frequencyDaysForRule(input) {
  const rule = normalizeRecurrence(input, input?.anchorDate);
  return rule.interval * (rule.frequency === 'weekly' ? 7 : rule.frequency === 'quarterly' ? 90 : 30);
}
function occurrenceDates(plan, startDate, endDate, { limit = 100 } = {}) {
  const start = calendarDate(startDate), end = calendarDate(endDate);
  if (end < start) fail('Choose a scheduling window that ends after it starts.');
  integer(limit, 1, 1000, 'occurrence limit');
  if (!plan.active) return [];
  const next = calendarDate(plan.nextServiceDate), result = [];
  const calendar = plan.recurrence?.version === 1;
  let date;
  if (calendar) {
    if (firstOccurrenceOnOrAfter(plan.recurrence, plan.nextServiceDate) !== plan.nextServiceDate) fail('The next service date does not match this plan’s recurrence.');
    date = firstOccurrenceOnOrAfter(plan.recurrence, dateString(next > start ? next : start));
  }
  else {
    const step = integer(Number(plan.frequencyDays), 1, 3660, 'legacy service frequency');
    date = new Date(next); date.setUTCDate(next.getUTCDate() + Math.max(0, Math.ceil((start - next) / DAY / step)) * step);
    date = dateString(date);
  }
  while (calendarDate(date) <= end) {
    if (result.length === limit) throw new HttpsError('failed-precondition', 'This service plan has too many occurrences in the scheduling window.');
    result.push(date);
    if (calendar) date = nextRecurrenceDate(plan.recurrence, date);
    else { const nextDate = calendarDate(date); nextDate.setUTCDate(nextDate.getUTCDate() + Number(plan.frequencyDays)); date = dateString(nextDate); }
  }
  return result;
}
module.exports = { calendarDate, normalizeRecurrence, nextRecurrenceDate, firstOccurrenceOnOrAfter, frequencyDaysForRule, occurrenceDates };
