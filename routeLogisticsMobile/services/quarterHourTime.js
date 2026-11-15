const QUARTER_MINUTES = Object.freeze([0, 15, 30, 45]);
const pad = value => String(value).padStart(2, '0');

function parseClockTime(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]), second = Number(match[3] || 0), period = match[4]?.toUpperCase();
  if (period) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (period === 'PM' ? 12 : 0);
  } else if (hour > 23) return null;
  return { hour, minute, second };
}

function isQuarterHourTime(value) {
  const time = parseClockTime(value);
  return !!time && time.second === 0 && QUARTER_MINUTES.includes(time.minute);
}

function quarterHourValue(hour, minute, period) {
  if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !QUARTER_MINUTES.includes(minute) || !['AM', 'PM'].includes(period)) throw new Error('Choose an hour, AM or PM, and 00, 15, 30, or 45 minutes.');
  return `${pad(hour % 12 + (period === 'PM' ? 12 : 0))}:${pad(minute)}`;
}

function timeLabel(value) {
  const time = parseClockTime(value);
  return time ? `${time.hour % 12 || 12}:${pad(time.minute)} ${time.hour >= 12 ? 'PM' : 'AM'}` : String(value || '');
}

function pickerTime(value) {
  const time = parseClockTime(value);
  return { hour: time ? time.hour % 12 || 12 : 9, minute: value ? isQuarterHourTime(value) ? time.minute : null : 0, period: time && time.hour >= 12 ? 'PM' : 'AM' };
}

module.exports = { QUARTER_MINUTES, parseClockTime, isQuarterHourTime, quarterHourValue, timeLabel, pickerTime };
