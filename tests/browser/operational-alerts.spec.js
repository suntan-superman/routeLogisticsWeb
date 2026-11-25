const { test, expect, signIn } = require('./support/fixtures.js');
const { createRequire } = require('node:module');
const path = require('node:path');
const req = createRequire(path.resolve(__dirname, '../../functions/package.json'));
const { getApps } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { operationalAlertHandlers } = require('../../functions/operationalAlerts');

test('management can add an internal critical job alert and view it in light and dark layouts', async ({ page, scenario }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await signIn(page, scenario.accounts.owner);
  await page.goto('/jobs');
  await page.getByRole('button', { name: `View job details for ${scenario.customerName} · ${scenario.jobTitle}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Job Details', exact: true });
  const alerts = dialog.getByRole('region', { name: 'Job alerts' });
  await expect(alerts.getByText('No active alerts for this job.')).toBeVisible();
  await alerts.getByRole('button', { name: 'Add job alert' }).click();
  await alerts.getByRole('textbox', { name: 'Title' }).fill('Unsafe side entrance');
  await alerts.getByRole('textbox', { name: 'Description' }).fill('Synthetic test warning. Call the office before entering.');
  await alerts.getByRole('combobox', { name: 'Category' }).click();
  await alerts.getByRole('option', { name: 'Safety' }).click();
  await alerts.getByRole('combobox', { name: 'Severity' }).click();
  await alerts.getByRole('option', { name: 'Critical' }).click();
  await alerts.getByRole('button', { name: 'Save alert' }).click();
  await expect(alerts.getByText('Critical · Unsafe side entrance')).toBeVisible();
  await expect(alerts.getByText(/Awaiting acknowledgment from/)).toBeVisible();
  const savedJob = await scenario.read('jobs', scenario.ids.jobId);
  const savedAlert = savedJob.operationalAlerts.find(row => row.title === 'Unsafe side entrance');
  const db = getFirestore(getApps().find(app => app.name === 'browser-tests'));
  await operationalAlertHandlers(db)({
    data: { action: 'acknowledge', jobId: scenario.ids.jobId, alertKey: `job:${savedAlert.id}:${savedAlert.version}`, operationId: 'browser-critical-ack-0001', occurredAt: new Date().toISOString() },
    auth: { uid: scenario.accounts.technician.uid, token: { companyId: scenario.ids.companyId, membershipId: scenario.accounts.technician.membershipId, role: 'technician', email_verified: true } },
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(alerts.getByText(/Acknowledged by/)).toBeVisible();
  await expect(alerts.getByText(/Awaiting acknowledgment from/)).toHaveCount(0);
  await alerts.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('job-alert-desktop-light.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: test.info().outputPath('job-alert-desktop-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(alerts.getByText('Critical · Unsafe side entrance')).toBeVisible();
  await alerts.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('job-alert-mobile-width.png'), fullPage: true });
  expect(await dialog.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return bounds.left >= -1 && bounds.right <= window.innerWidth + 1;
  })).toBe(true);
});
