const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepare } = require('./prepare-bls-import');

test('private BLS preparation yields ten selected contacts and forty fictional rows', async () => {
  const header = 'Name,Email,Phone,Address,City,State,ZIP,Notes';
  const source = [header, ...Array.from({ length: 11 }, (_, index) =>
    `Approved Contact ${index + 1},approved-${index + 1}@example.com,,${index + 1} Test Street,Bakersfield,CA,93301,PRIVATE NOTE`)].join('\n');
  const approvals = Array.from({ length: 10 }, (_, index) => `approved-${index + 1}@example.com`).join('\n');
  const { csv, reconciliation } = await prepare(source, approvals);
  const { parseCsv, previewCustomers } = await import('../routeLogisticsWeb/src/utils/customerCsv.js');
  assert.equal(previewCustomers(csv).customers.length, 50);
  assert.equal(parseCsv(reconciliation).length, 11);
  assert.equal(csv.includes('approved-11@example.com'), false);
  assert.equal(csv.includes('PRIVATE NOTE'), false);
  assert.equal(csv.includes('bls-test-40@example.com'), true);
  await assert.rejects(prepare(source, `${approvals}\napproved-11@example.com`), /Exactly 10/);
});
