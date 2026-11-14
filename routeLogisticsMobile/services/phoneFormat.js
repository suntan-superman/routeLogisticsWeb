// Format North American numbers while typing; preserve explicit international numbers.
function formatPhone(value) {
  const raw = String(value ?? '').trim();
  if (raw.startsWith('+') && !raw.startsWith('+1')) return raw;
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+1') || (digits.length > 10 && digits.startsWith('1'))) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (!digits) return '';
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
function displayPhone(value) {
  const raw = String(value ?? '').trim(), digits = raw.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1')) ? formatPhone(raw) : raw;
}
module.exports = { formatPhone, displayPhone };
