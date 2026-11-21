const { mkdir } = require('node:fs/promises');
const { test, expect, signIn } = require('./support/fixtures.js');

async function expectBelowSticky(page, heading, headerTestId) {
  await expect.poll(async () => {
    const headingTop = await heading.evaluate(node => node.getBoundingClientRect().top);
    const headerBottom = await page.getByTestId(headerTestId).evaluate(node => node.getBoundingClientRect().bottom);
    return headingTop - headerBottom;
  }).toBeGreaterThanOrEqual(-2);
  await expect(heading).toBeInViewport();
}

test('company settings keeps one section visible and restores tab history', async ({ page, scenario }) => {
  await signIn(page, scenario.accounts.owner);
  await page.goto('/company-setup');
  await expect(page.getByRole('heading', { name: 'Company Settings' })).toBeVisible();
  await page.getByRole('tab', { name: /Team/ }).click();
  await expect(page.getByRole('heading', { name: 'Team Members' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole('tab', { name: /Services/ }).click();
  const services = page.getByRole('heading', { name: 'Service Categories' });
  const team = page.getByRole('heading', { name: 'Team Members' });
  await expect(services).toBeInViewport();
  await expectBelowSticky(page, services, 'company-settings-sticky-header');
  await expect(page.getByRole('heading', { name: 'Team Members' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(team).toBeVisible();
  await expectBelowSticky(page, team, 'company-settings-sticky-header');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(services).toBeVisible();
  await expectBelowSticky(page, services, 'company-settings-sticky-header');
  await page.evaluate(() => window.history.back());
  await expect(team).toBeVisible();
  await expectBelowSticky(page, team, 'company-settings-sticky-header');
  await page.evaluate(() => window.history.forward());
  await expect(services).toBeVisible();
  await expectBelowSticky(page, services, 'company-settings-sticky-header');
  await page.getByRole('tab', { name: /Services/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Team Members' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Team/ })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('heading', { name: 'Service Categories' })).toBeVisible();
  await mkdir('docs/audits/ui-redesign', { recursive: true });
  await page.screenshot({ path: 'docs/audits/ui-redesign/company-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/audits/ui-redesign/company-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole('tab', { name: /Team/ }).click();
  await expectBelowSticky(page, team, 'company-settings-sticky-header');
  await page.getByRole('tab', { name: /Services/ }).click();
  await expectBelowSticky(page, services, 'company-settings-sticky-header');
});

test('estimate tabs isolate controls and preserve the server version', async ({ page, scenario }) => {
  await signIn(page, scenario.accounts.owner);
  await page.goto('/estimates');
  await page.getByRole('button', { name: 'Open estimate' }).first().click();
  await expect(page.getByRole('tab', { name: /Details/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: /Scope & Pricing/ }).click();
  await expect(page.getByRole('heading', { name: 'Labor and materials' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Customer or prospect' })).toHaveCount(0);
  await page.getByRole('tab', { name: /Photos/ }).click();
  await expect(page.getByRole('heading', { name: /Work photos/ })).toBeVisible();
  await page.getByRole('tab', { name: /Review & Send/ }).click();
  const review = page.getByRole('heading', { name: 'Review, PDF and customer approval' });
  await expect(page.getByRole('button', { name: 'Preview customer PDF' })).toBeVisible();
  await expectBelowSticky(page, review, 'estimate-sticky-header');
  await expect(page.getByRole('button', { name: 'Save estimate version' })).toHaveCount(0);
  await mkdir('docs/audits/ui-redesign', { recursive: true });
  await page.screenshot({ path: 'docs/audits/ui-redesign/estimate-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole('tab', { name: /Photos/ }).click();
  await expectBelowSticky(page, page.getByRole('heading', { name: /Work photos/ }), 'estimate-sticky-header');
  await page.getByRole('tab', { name: /Review & Send/ }).click();
  await expectBelowSticky(page, review, 'estimate-sticky-header');
  await page.screenshot({ path: 'docs/audits/ui-redesign/estimate-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'Back to estimates' }).click();
  await page.getByRole('button', { name: 'Open estimate' }).first().click();
  await expect(page.getByRole('tab', { name: /Review & Send/ })).toHaveAttribute('aria-selected', 'true');
});
