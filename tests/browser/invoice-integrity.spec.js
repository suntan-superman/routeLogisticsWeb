import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test, expect, signIn } from './support/fixtures.js';

const req = createRequire(path.resolve(__dirname, '../../functions/package.json'));
const { getApps } = req('firebase-admin/app'), { getFirestore } = req('firebase-admin/firestore');
const hash = value => createHash('sha256').update(value).digest('hex');

async function seedApprovedConvertedJob(scenario) {
  if (process.env.RL_BROWSER_TESTS !== 'true' || process.env.GCLOUD_PROJECT !== 'demo-routelogistics'
    || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw Error('Synthetic invoice fixtures require local emulators.');
  const app = getApps().find(item => item.name === 'browser-tests');
  if (!app) throw Error('The isolated browser fixture app is required.');
  const db = getFirestore(app), at = new Date().toISOString();
  const estimate = await scenario.read('estimates', scenario.ids.estimateId);
  const approved = { ...estimate, status: 'approved', taxRate: 8.25, tax: 8.25, taxCents: 825, total: 108.25, totalCents: 10825 };
  const batch = db.batch();
  batch.set(db.doc(`rlEstimateVersions/${hash(`${scenario.ids.estimateId}:1`)}`), { ...approved, estimateId: scenario.ids.estimateId });
  batch.update(db.doc(`rlEstimateApprovalSecrets/${scenario.ids.estimateId}`), { status: 'approved', approvedAt: at, approvedByName: 'Synthetic customer' });
  batch.update(db.doc(`estimates/${scenario.ids.estimateId}`), { ...approved, status: 'converted', convertedJobId: scenario.ids.completedJobId, convertedCustomerId: scenario.ids.customerId });
  batch.set(db.doc(`rlEstimateConversions/${scenario.ids.estimateId}`), { companyId: scenario.ids.companyId, estimateId: scenario.ids.estimateId, version: 1, jobId: scenario.ids.completedJobId, customerId: scenario.ids.customerId, actorId: scenario.accounts.owner.uid, createdAt: at });
  // Model a historical converted job without totalCost/billingSnapshot. Billing
  // must resolve its immutable approved version rather than filling in zero.
  batch.update(db.doc(`jobs/${scenario.ids.completedJobId}`), { estimateId: scenario.ids.estimateId, estimateVersion: 1, estimatedCost: 108.25, total: 108.25, updatedAt: at });
  await batch.commit();
}

test('PW-INVOICE-01 @smoke owner reviews approved 108.25 terms, creates once and explicitly replaces a void without deleting history', async ({ page, scenario }) => {
  test.setTimeout(120000);
  test.info().annotations.push({ type: 'acceptance', description: 'INV-INT-001, INV-INT-002, INV-INT-004, G12, G13, G14' });
  await seedApprovedConvertedJob(scenario);
  const originalInvoice = await scenario.read('invoices', scenario.ids.invoiceId), foreignJob = await scenario.read('jobs', scenario.ids.foreignJobId);
  const createdForJob = async () => (await scenario.list('invoices')).filter(invoice => invoice.jobId === scenario.ids.completedJobId);
  await signIn(page, scenario.accounts.owner); await page.goto('/jobs');
  const openJob = page.getByRole('button', { name: `View job details for ${scenario.customerName} · ${scenario.completedServiceType}`, exact: true });
  await openJob.click(); const details = page.getByRole('dialog', { name: 'Job Details', exact: true });
  expect(await createdForJob()).toHaveLength(0);
  await details.getByRole('button', { name: 'Create Invoice', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Review invoice', exact: true });
  await expect(preview.getByText('Approved estimate version 1', { exact: true })).toBeVisible();
  const line = preview.getByRole('row').filter({ hasText: 'Synthetic inspection' });
  await expect(line).toContainText('$100.00'); await expect(preview).toContainText('$8.25'); await expect(preview).toContainText('$108.25');
  expect(await createdForJob()).toHaveLength(0);
  const createdResponse = page.waitForResponse(response => response.url().includes('/rlManageInvoice') && response.request().method() === 'POST' && response.request().postDataJSON()?.data?.action === 'create');
  await preview.getByRole('button', { name: 'Create draft invoice', exact: true }).click();
  const created = await createdResponse; expect(created.ok()).toBe(true); const result = (await created.json()).result;
  await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible();
  const records = await createdForJob(); expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ id: result.id, status: 'draft', revision: 1, subtotalCents: 10000, taxCents: 825, totalCents: 10825, subtotal: 100, tax: 8.25, total: 108.25, estimateId: scenario.ids.estimateId, estimateVersion: 1 });
  expect(records[0].lineItems).toEqual([expect.objectContaining({ description: 'Synthetic inspection', quantity: 1, unitPriceCents: 10000, amountCents: 10000 })]);
  const invoiceRow = page.locator(`[id="invoice-${result.id}"]`);
  await expect(invoiceRow).toContainText('$108.25'); await expect(invoiceRow.getByText('Historical invoice — source needs review', { exact: true })).toHaveCount(0);
  await page.goto('/jobs'); await openJob.click(); await details.getByRole('button', { name: 'Create Invoice', exact: true }).click();
  await expect(preview.getByText(`Existing invoice: ${records[0].invoiceNumber}`, { exact: true })).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Create draft invoice', exact: true })).toHaveCount(0);
  await preview.getByRole('button', { name: 'Open existing invoice', exact: true }).click();
  await expect(invoiceRow).toBeVisible(); expect(await createdForJob()).toHaveLength(1);
  await invoiceRow.getByRole('button', { name: 'Mark sent', exact: true }).click();
  await expect(invoiceRow.getByText('sent', { exact: true })).toBeVisible();
  await invoiceRow.getByRole('button', { name: 'Void', exact: true }).click();
  await page.getByRole('dialog', { name: 'Void this invoice?', exact: true }).getByRole('button', { name: 'Void invoice', exact: true }).click();
  await expect(invoiceRow.getByText('void', { exact: true })).toBeVisible();
  await invoiceRow.getByRole('button', { name: 'Review replacement', exact: true }).click();
  const replacement = page.getByRole('dialog', { name: 'Review replacement invoice', exact: true });
  await expect(replacement).toContainText('$108.25'); expect(await createdForJob()).toHaveLength(1);
  await replacement.getByRole('button', { name: 'Create replacement draft', exact: true }).click();
  await expect(page.getByText('Replacement draft created', { exact: true })).toBeVisible();
  const final = await createdForJob(); expect(final).toHaveLength(2); expect(final.filter(row => row.status !== 'void')).toHaveLength(1);
  expect(final.find(row => row.id === result.id)).toMatchObject({ status: 'void', revision: 3 });
  expect(final.find(row => row.id !== result.id)).toMatchObject({ replacementOf: result.id, total: 108.25, revision: 1 });
  expect((await scenario.list('rlInvoiceAudit')).filter(row => row.invoiceId === result.id && row.action === 'invoice.create')).toHaveLength(1);
  expect((await scenario.list('rlMail')).filter(row => final.some(invoice => invoice.id === row.invoiceId))).toHaveLength(0);
  expect(await scenario.read('invoices', scenario.ids.invoiceId)).toEqual(originalInvoice); expect(await scenario.read('jobs', scenario.ids.foreignJobId)).toEqual(foreignJob);
});
