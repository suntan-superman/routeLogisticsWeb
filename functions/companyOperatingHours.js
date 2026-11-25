const { calendarDate } = require('./recurrenceRules');

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const asData = company => typeof company?.data === 'function' ? company.data() || {} : company || {};
const minutes = value => {
  if (typeof value !== 'string') return null;
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value || '');
  return match ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
};

function operatingSlot(company, job) {
  const hours = asData(company).businessHours;
  if (!hours || typeof hours !== 'object') return { open: true, configured: false };
  const day = calendarDate(job.date);
  if (Array.isArray(hours.closedDates) && hours.closedDates.includes(job.date)) return { open: false, code: 'closed-date', reason: 'The company is closed on this date.' };
  const weekday = WEEKDAYS[day.getUTCDay()];
  const rule = hours[weekday];
  if (!rule) return { open: true, configured: false };
  if (rule.closed === true) return { open: false, code: 'closed-day', reason: `The company is closed on ${weekday}.` };
  const start = minutes(job.time), open = minutes(rule.open), close = minutes(rule.close);
  const duration = Number(job.estimatedDuration ?? job.duration ?? 1);
  if (start !== null && open !== null && close !== null && Number.isFinite(duration) && (start < open || start + Math.ceil(duration * 60) > close)) {
    return { open: false, code: 'outside-hours', reason: `This visit falls outside ${weekday} business hours (${rule.open}–${rule.close}).` };
  }
  return { open: true, configured: true };
}

function nextOpenSlot(company, job, limit = 14) {
  const start = calendarDate(job.date);
  for (let offset = 1; offset <= limit; offset++) {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + offset);
    const date = day.toISOString().slice(0, 10);
    if (operatingSlot(company, { ...job, date }).open) return date;
  }
  return null;
}

module.exports = { operatingSlot, nextOpenSlot };
