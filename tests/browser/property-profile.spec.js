const { test, expect, signIn } = require('./support/fixtures.js');

test('property profile stays scoped to the selected property in desktop and mobile layouts', async ({ page, scenario }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await scenario.seedPropertyProfile();
  await signIn(page, scenario.accounts.owner);
  await page.goto('/jobs');
  await page.getByRole('button', { name: `View job details for ${scenario.customerName} · ${scenario.jobTitle}`, exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Job Details', exact: true });
  await details.getByRole('tab', { name: 'Property', exact: true }).click();
  const profile = page.getByRole('region', { name: 'Property Profile' });
  await expect(profile).toBeVisible();
  await expect(profile.getByText('Synthetic front gate', { exact: false })).toBeVisible();
  await expect(profile.getByText('Call before entering', { exact: false })).toBeVisible();
  await expect(profile.getByText('Synthetic office entry', { exact: false })).toHaveCount(0);
  await profile.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('property-profile-desktop.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(profile).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('property-profile-desktop-dark.png'), fullPage: true });
  await profile.getByRole('tab', { name: 'Photos' }).click();
  await expect(profile.getByText('No approved reference photographs yet.')).toBeVisible();
  await expect(profile.getByText('Loading property information…')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await profile.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('property-profile-mobile-width.png'), fullPage: true });
});
