// Formats US phone numbers as (555) 123-4567 while typing; other international numbers are left alone.
export function formatPhone(value) {
  const raw = String(value ?? '').trim();
  if (raw.startsWith('+') && !raw.startsWith('+1')) return raw;
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+1') || (digits.length > 10 && digits.startsWith('1'))) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
