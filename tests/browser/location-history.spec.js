const path = require('node:path');
const { createRequire } = require('node:module');
const { test, expect, signIn } = require('./support/fixtures.js');
const { selectValue } = require('./support/select.js');
const admin = createRequire(path.resolve(__dirname, '../../functions/package.json'));
const { getApps } = admin('firebase-admin/app');
const { getFirestore } = admin('firebase-admin/firestore');
const { PDFDocument } = admin('pdf-lib');

test('Location History keeps filters private in a dedicated window and prints an observed-fix report', async ({ page, scenario }) => {
  const app = getApps().find(candidate => candidate.name === 'browser-tests');
  const db = getFirestore(app);
  const now = Date.now();
  const minutesAgo = [65, 62, 59, 56, 53, 50, 32, 29, 26, 23, 20, 17];
  await db.doc(`companies/${scenario.ids.companyId}`).update({ timeZone: 'America/Los_Angeles' });
  await Promise.all(minutesAgo.map((minutes, index) => db.doc(`rlLocationHistory/${scenario.prefix}-history-${index}`).set({
    companyId: scenario.ids.companyId,
    memberId: scenario.accounts.technician.membershipId,
    userId: scenario.accounts.technician.uid,
    lat: 35.38 + (index < 6 ? index * 0.00001 : 0.009 + index * 0.00001),
    lng: -119.01,
    accuracy: 8,
    capturedAt: new Date(now - minutes * 60000),
    synthetic: true,
  })));
  await signIn(page, scenario.accounts.manager);
  await page.goto('/location-history');
  await selectValue(page.getByLabel('Technician', { exact: true }), scenario.accounts.technician.membershipId);
  await page.getByRole('button', { name: 'Load history' }).click();
  await expect(page.getByText('12 fixes loaded')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print Location Report' })).toBeVisible();
  const report = page.locator('.rl-history-print-report');
  await expect(report).toContainText('Synthetic technician');
  await expect(report).toContainText('Company time zone');
  await expect(report).toContainText('America/Los_Angeles');
  await expect(report).toContainText('Estimated stops (2)');
  await expect(report).toContainText('GPS gaps (1)');
  await expect(report.locator('svg')).toHaveCount(1);
  await page.emulateMedia({ media: 'print' });
  await page.screenshot({ path: path.resolve(__dirname, '../../test-results/location-history-print.png'), fullPage: true });
  for (const format of ['Letter', 'A4']) {
    const pdf = await PDFDocument.load(await page.pdf({ format, printBackground: true }));
    expect(pdf.getPageCount()).toBeGreaterThan(0);
  }
  await page.emulateMedia({ media: 'screen' });
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open Map in New Window' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/location-history\/map$/);
  expect(popup.url()).not.toContain(scenario.accounts.technician.membershipId);
  await expect(popup.getByText('12 fixes loaded')).toBeVisible();
  await expect(popup.getByText('Synthetic technician').first()).toBeVisible();
  await popup.close();

  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=';
  await db.doc(`companies/${scenario.ids.companyId}`).update({ logo: `data:image/png;base64,${png}` });
  await page.reload();
  await selectValue(page.getByLabel('Technician', { exact: true }), scenario.accounts.technician.membershipId);
  await page.getByRole('button', { name: 'Load history' }).click();
  await expect(page.locator('.rl-history-print-header img')).toHaveCount(1);
  await page.emulateMedia({ media: 'print' });
  await page.screenshot({ path: path.resolve(__dirname, '../../test-results/location-history-print-with-logo.png'), fullPage: true });
  const logoPdf = await PDFDocument.load(await page.pdf({ format: 'Letter', printBackground: true }));
  expect(logoPdf.getPageCount()).toBeGreaterThan(0);

  // Exercise a longer retained range and enough estimated stops for a second printed page.
  await Promise.all(Array.from({ length: 120 }, (_, index) => {
    const group = Math.floor(index / 6), sample = index % 6;
    return db.doc(`rlLocationHistory/${scenario.prefix}-long-${index}`).set({
      companyId: scenario.ids.companyId, memberId: scenario.accounts.technician.membershipId,
      userId: scenario.accounts.technician.uid, lat: 35.5 + group * 0.003 + sample * 0.00001,
      lng: -119.01, accuracy: 8, capturedAt: new Date(now - (840 - group * 33 - sample * 3) * 60000), synthetic: true,
    });
  }));
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now - 86400000)).map(part => [part.type, part.value]));
  await page.emulateMedia({ media: 'screen' });
  await page.getByLabel('Start date').fill(`${parts.year}-${parts.month}-${parts.day}`);
  await page.getByRole('button', { name: 'Load history' }).click();
  await expect(page.getByText('132 fixes loaded')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  const longPdf = await PDFDocument.load(await page.pdf({ format: 'A4', printBackground: true }));
  expect(longPdf.getPageCount()).toBeGreaterThan(1);
});
