const { test, expect, signIn } = require('./support/fixtures');

test('management qualification controls stay within Company Services and Team', async ({ page, scenario }) => {
  await signIn(page, scenario.accounts.owner);
  await page.goto('/company-setup');
  await page.getByRole('tab', { name: /Services/ }).click();
  const services = page.getByRole('region', { name: 'Technician qualifications' });
  await expect(services.getByText('Company qualification catalog')).toBeVisible();
  await expect(services.getByText('Required qualifications by service')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/phase2c-qualifications-services.png', fullPage: true });

  await page.getByRole('tab', { name: /Team/ }).click();
  const team = page.getByRole('region', { name: 'Technician qualifications' });
  await expect(team.getByText('Team qualification record')).toBeVisible();
  await expect(team.getByText('Future assignments needing review')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/phase2c-qualifications-team.png', fullPage: true });
});
