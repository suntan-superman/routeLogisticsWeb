const { test, expect, signIn } = require('./support/fixtures.js');

test('Job Details tabs keep work accessible and show authorized property photos in a compact viewer', async ({ page, scenario }) => {
  await scenario.seedPropertyProfile();
  await scenario.seedPropertyPhotos();
  await signIn(page, scenario.accounts.owner);
  await page.goto('/jobs');
  await page.getByRole('button', { name: `View job details for ${scenario.customerName} · ${scenario.jobTitle}`, exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Job Details', exact: true });
  const panel = details.getByRole('tabpanel', { name: 'Overview job details' });
  await expect(details.getByText(scenario.customerName, { exact: true }).first()).toBeVisible();
  await expect(details.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  await expect(details.getByRole('region', { name: 'Property Profile' })).toBeHidden();
  await page.screenshot({ path: test.info().outputPath('job-details-after-desktop-light.png') });

  await details.getByRole('tab', { name: 'Property' }).click();
  const profile = details.getByRole('region', { name: 'Property Profile' });
  await expect(profile).toBeVisible();
  await profile.getByRole('tab', { name: 'Photos' }).click();
  await expect(profile.getByRole('region', { name: 'Approved property references' })).toContainText('Synthetic property exterior');
  await expect(profile.getByRole('region', { name: 'Pending technician proposals' })).toContainText('Synthetic gate proposal');
  await expect(profile.getByRole('region', { name: 'Job evidence for reference' })).toContainText('Synthetic front entrance');
  await profile.getByRole('button', { name: 'View Synthetic property exterior' }).click();
  await expect(page.getByRole('dialog', { name: 'Synthetic property exterior' })).toBeVisible();
  await page.getByRole('button', { name: 'Close photo' }).click();
  await profile.getByRole('button', { name: 'Approve' }).click();
  await expect(profile.getByRole('region', { name: 'Pending technician proposals' })).not.toContainText('Synthetic gate proposal');
  await expect(profile.getByRole('region', { name: 'Approved property references' })).toContainText('Synthetic gate proposal');
  await expect(profile.getByRole('region', { name: 'Job evidence for reference' })).toContainText('Synthetic front entrance');

  await details.getByRole('tab', { name: 'Service', exact: true }).click();
  await expect(details.getByRole('region', { name: 'Job instructions' })).toBeVisible();
  await details.getByRole('tab', { name: 'Photos', exact: true }).click();
  await expect(details.getByText('Synthetic front entrance', { exact: true }).last()).toBeVisible();
  await details.getByRole('tab', { name: 'History' }).click();
  await expect(details.getByText('No job changes recorded.')).toBeVisible();
  await details.getByRole('tab', { name: 'Overview' }).click();
  await expect(panel).toBeVisible();
  await expect.poll(() => panel.evaluate(element => element.scrollTop)).toBe(0);

  await details.getByRole('button', { name: 'Actions' }).click();
  await expect(details.getByRole('menuitem', { name: 'Permanently delete' })).toBeVisible();
  await details.getByRole('button', { name: 'Actions' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: test.info().outputPath('job-details-after-desktop-dark.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(details).toBeVisible();
  expect(await details.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('job-details-after-mobile-dark.png') });
});
