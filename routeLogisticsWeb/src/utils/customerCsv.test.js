import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, previewCustomers, csvCell } from './customerCsv.js';
import { returnPath } from './returnPath.js';
test('CSV handles BOM, Windows line endings, quoted commas, quotes and embedded newlines', () => {
  assert.deepEqual(parseCsv('\uFEFFName,Notes\r\n"Doe, Jane","Said ""hello""\nAgain"\r\n'), [['Name', 'Notes'], ['Doe, Jane', 'Said "hello"\nAgain']]);
  assert.throws(() => parseCsv('Name\n"unclosed'));
  assert.throws(() => parseCsv('Name\n"closed"junk'));
});
test('CSV validates every row and deduplicates normalized emails', () => {
  const out = previewCustomers('Name,Email,ZIP\nAlice,A@EXAMPLE.COM,00123\nDuplicate,a@example.com,00123\n,invalid,\nBob,b@example.com');
  assert.equal(out.customers.length, 1); assert.equal(out.duplicates, 1); assert.equal(out.errors.length, 2);
  assert.equal(out.customers[0].zipCode, '00123');
  assert.throws(() => previewCustomers('Name,Name\na,b'));
});
test('CSV exports escape quotes and spreadsheet formula injection', () => {
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell('=HYPERLINK("evil")'), '"\'=HYPERLINK(""evil"")"');
  assert.equal(csvCell('  +SUM(1)'), '"\'  +SUM(1)"');
});
test('return routes preserve invite fragment and reject external or unknown destinations', () => {
  const next = '/accept-invite?id=rl_123#code=' + 'a'.repeat(64);
  assert.equal(returnPath('?next=' + encodeURIComponent(next)), next);
  for (const next of ['//evil.com', 'https://evil.com', '/company-setup', '/accept-invite?id=bad']) assert.equal(returnPath('?next=' + encodeURIComponent(next)), null);
});
