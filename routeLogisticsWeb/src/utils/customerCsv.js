const columns = { name: 'name', email: 'email', phone: 'phone', address: 'address', city: 'city', state: 'state', zip: 'zipCode', zipcode: 'zipCode', postalcode: 'zipCode', notes: 'notes' };
// RFC 4180 fields, including escaped quotes and embedded newlines. Reject malformed CSV.
export function parseCsv(text) {
  if (typeof text !== 'string' || text.length > 5_000_000) throw new Error('Choose a CSV file under 5 MB.');
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  const input = text.replace(/^\uFEFF/, '');
  const pushField = () => { row.push(field); field = ''; closed = false; };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += char;
    } else if (char === ',') pushField();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      pushField(); if (row.some((v) => v.trim())) rows.push(row); row = [];
    } else if (char === '"' && !field && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new Error('Malformed CSV: unexpected character beside a quote.');
      field += char;
    }
  }
  if (quoted) throw new Error('Malformed CSV: a quoted field was not closed.');
  pushField(); if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
export function previewCustomers(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header || !rows.length) throw new Error('Include a header row and at least one customer.');
  if (rows.length > 5000) throw new Error('Import up to 5,000 customers at a time.');
  const keys = header.map((h) => columns[h.toLowerCase().replace(/[\s_-]/g, '')] || null);
  if (!keys.includes('name')) throw new Error('A Name column is required.');
  if (new Set(keys.filter(Boolean)).size !== keys.filter(Boolean).length) throw new Error('Remove duplicate column headings.');
  const errors = [], customers = [], seen = new Set();
  let duplicates = 0;
  rows.forEach((row, index) => {
    const line = index + 2;
    if (row.length !== header.length) { errors.push(`Row ${line}: expected ${header.length} columns.`); return; }
    const customer = Object.fromEntries(keys.flatMap((key, i) => key ? [[key, row[i].trim()]] : []));
    customer.email = (customer.email || '').toLowerCase();
    if (!customer.name || customer.name.length > 200) { errors.push(`Row ${line}: name is required (up to 200 characters).`); return; }
    if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) { errors.push(`Row ${line}: invalid email address.`); return; }
    if (Object.entries(customer).some(([key, value]) => value.length > (key === 'notes' ? 4000 : 500))) { errors.push(`Row ${line}: field is too long.`); return; }
    const identity = customer.email || [customer.name, customer.phone, customer.address].join('|').toLowerCase();
    if (seen.has(identity)) { duplicates++; return; }
    seen.add(identity); customers.push(customer);
  });
  return { customers, errors, duplicates };
}
export function csvCell(value) {
  let text = String(value ?? '');
  // Prevent spreadsheet formulas in exported user-provided values.
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
