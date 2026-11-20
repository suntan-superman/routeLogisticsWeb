// Offline preparation only. Input and output belong in ignored .migration/.
// Usage: node scripts/prepare-bls-import.js .migration/acme-export.csv .migration/bls-approved-emails.txt
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { cleanCustomer, syntheticImportRow } = require('../functions/customers');

async function prepare(sourceText, approvalsText) {
  const { parseCsv, previewCustomers, csvCell } = await import(pathToFileURL(path.resolve(__dirname, '../routeLogisticsWeb/src/utils/customerCsv.js')));
  const [header, ...rawRows] = parseCsv(sourceText);
  const expected = ['Name', 'Email', 'Phone', 'Address', 'City', 'State', 'ZIP'];
  if (!expected.every(column => header.includes(column))) throw Error('Use the existing Customer Management export with its expected columns.');
  const index = Object.fromEntries(header.map((column, i) => [column, i]));
  const approvals = approvalsText.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean);
  if (approvals.length !== 10 || new Set(approvals).size !== 10) throw Error('Exactly 10 distinct approved shared emails are required.');
  const rows = approvals.map(email => {
    const matches = rawRows.filter(row => row[index.Email]?.trim().toLowerCase() === email);
    if (matches.length !== 1) throw Error('Each approved email must identify exactly one source export row.');
    const row = matches[0], value = column => String(row[index[column]] || '').replace(/^'(?=[=+@-])/, '');
    return { name: value('Name'), email: value('Email').toLowerCase(), phone: value('Phone'), address: value('Address'), city: value('City'), state: value('State'), zipCode: value('ZIP'), notes: '' };
  });
  const synthetic = Array.from({ length: 40 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return { name: `BLS Test Customer ${n}`, email: `bls-test-${n}@example.com`, phone: '', address: `${i + 101} Example Lane (Synthetic)`, city: 'Bakersfield', state: 'CA', zipCode: '', notes: '' };
  });
  if (!synthetic.every(syntheticImportRow)) throw Error('Synthetic import marker validation failed.');
  const all = [...rows, ...synthetic];
  all.forEach(cleanCustomer);
  const columns = ['Name', 'Email', 'Phone', 'Address', 'City', 'State', 'ZIP', 'Notes'];
  const fields = ['name', 'email', 'phone', 'address', 'city', 'state', 'zipCode', 'notes'];
  const csv = [columns, ...all.map(row => fields.map(field => row[field]))].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const result = previewCustomers(csv);
  if (result.errors.length || result.duplicates || result.customers.length !== 50) throw Error('The generated CSV did not pass the existing import preview.');
  if (new Set(all.map(row => row.email)).size !== 50) throw Error('Customer emails are duplicated.');
  const reconciliation = [columns, ...rows.map(row => fields.map(field => row[field]))].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  return { csv, reconciliation };
}

async function main() {
  const [sourceArg, approvalsArg] = process.argv.slice(2);
  if (!sourceArg || !approvalsArg) throw Error('Provide the authorized Acme export and a private file listing exactly 10 approved shared email addresses.');
  const privateDir = path.resolve(__dirname, '../.migration');
  const insidePrivate = file => path.resolve(file).startsWith(privateDir + path.sep);
  if (![sourceArg, approvalsArg].every(insidePrivate)) throw Error('Keep both input files inside the ignored .migration directory.');
  const { csv, reconciliation } = await prepare(fs.readFileSync(sourceArg, 'utf8'), fs.readFileSync(approvalsArg, 'utf8'));
  fs.mkdirSync(privateDir, { recursive: true });
  const importPath = path.join(privateDir, 'bls-customers-import.csv'), reconciliationPath = path.join(privateDir, 'bls-shared-reconciliation.csv');
  if (fs.existsSync(importPath) || fs.existsSync(reconciliationPath)) throw Error('BLS output already exists. Review it before generating another version.');
  fs.writeFileSync(importPath, csv, { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(reconciliationPath, reconciliation, { mode: 0o600, flag: 'wx' });
  process.stdout.write('Validated 50 BLS import rows: 10 approved shared contacts and 40 synthetic contacts. Files saved under ignored .migration/.\n');
}

if (require.main === module) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
module.exports = { prepare };
