const { test, expect } = require('./support/fixtures');

test('PW-MARKETING-01 @smoke public homepage presents verified workflows and stable account routes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Run your field operations from one place.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log In', exact: true }).first()).toHaveAttribute('href', '/login');
  await expect(page.getByRole('link', { name: 'Customer Portal', exact: true }).first()).toHaveAttribute('href', '/portal');
  await expect(page.getByRole('link', { name: 'Add Your Company', exact: true }).first()).toHaveAttribute('href', '/signup?intent=company');
  await expect(page.getByRole('link', { name: 'Explore Features', exact: true })).toHaveAttribute('href', '#features');
  for (const id of ['dispatch-preview-title','mobile-preview-title','history-preview-title','estimate-preview-title','attention-preview-title']) await expect(page.locator(`#${id}`)).toBeVisible();
  const pillars = page.locator('.marketing-pillar-card');
  await expect(pillars).toHaveCount(5);
  for (const title of ['Reliability', 'Simplicity', 'Scheduling Intelligence', 'Revenue Protection', 'Transparent Pricing']) await expect(pillars.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('Pricing is not yet published.')).toBeVisible();
  if (process.env.RL_CAPTURE_MARKETING === 'true') await page.screenshot({ path: 'test-results/five-pillars-desktop.png', fullPage: true });
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://route-logistics.com/');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Connected Field Service Operations/);
  const graph = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
  expect(graph['@graph'].map(item => item['@type'])).toEqual(['Organization', 'SoftwareApplication']);
  expect(await page.locator('body').innerText()).not.toMatch(/Acme|tech3@|David Lopez|Luis Gonzales|QuickBooks|live payment/i);
});

test('PW-MARKETING-02 mobile navigation is accessible and common viewports do not overflow', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport); await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Run your field operations from one place.' })).toBeVisible();
  if (process.env.RL_CAPTURE_MARKETING === 'true') await page.screenshot({ path: 'test-results/five-pillars-mobile.png', fullPage: true });
  const menu = page.getByRole('button', { name: 'Open navigation' }); await expect(menu).toBeVisible(); await menu.click();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Customer Portal' })).toHaveAttribute('href', '/portal');
  await expect(page.getByRole('link', { name: 'How It Works', exact: true }).last()).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();

  await expect(page.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content');
  expect(await page.locator('h1').count()).toBe(1);
  expect(await page.locator('section[aria-labelledby]').evaluateAll(sections => sections.every(section => document.getElementById(section.getAttribute('aria-labelledby'))))).toBe(true);
  expect(await page.locator('a, button').evaluateAll(elements => elements.every(element => (element.getAttribute('aria-label') || element.textContent || element.getAttribute('title') || '').trim().length > 0))).toBe(true);
  expect(await page.locator('img:not([alt])').count()).toBe(0);
});
