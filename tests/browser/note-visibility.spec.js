const path = require('node:path');
const { test, expect, signIn } = require('./support/fixtures.js');

// Local emulator fixtures only. Screenshots contain no production identities.
test('Phase 2B note audiences are visible in job details and estimate review', async ({ page, scenario }) => {
  await signIn(page, scenario.accounts.manager);
  await page.goto('/dispatch');
  await page.getByLabel('Service date', { exact: true }).fill(scenario.jobDate);
  await page.getByRole('button', { name: `${scenario.customerName} · ${scenario.jobTitle}`, exact: true }).click();
  const details = page.getByRole('dialog');
  await expect(details.getByRole('region', { name: 'Job instructions' }).getByLabel('Internal — management and assigned technicians')).toBeVisible();
  await expect(details.getByRole('region', { name: 'Work notes' }).getByLabel('Internal — management and assigned technicians')).toBeVisible();
  await details.screenshot({ path: path.resolve(__dirname, '../../test-results/phase2b-job-notes.png') });

  await page.goto('/estimates');
  await page.locator('article').filter({ has: page.getByRole('heading', { name: scenario.estimateTitle, exact: true }) }).getByRole('button', { name: 'Open estimate' }).click();
  await page.getByRole('tab', { name: /Scope & Pricing/ }).click();
  await expect(page.locator('span[aria-label="Customer-facing"]')).toBeVisible();
  await expect(page.locator('span[aria-label="Management only"]')).toBeVisible();
  await expect(page.locator('span[aria-label="Internal — management and assigned technicians"]')).toBeVisible();
  await page.locator('section').filter({ has: page.getByRole('heading', { name: 'Scope and terms' }) }).screenshot({ path: path.resolve(__dirname, '../../test-results/phase2b-estimate-notes.png') });
});
