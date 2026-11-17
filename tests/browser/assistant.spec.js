import { test, expect, signIn } from './support/fixtures.js';

test('PW-AI-01 @smoke authenticated assistant opens, provides page help and navigates only to an authorized route', async ({ page, scenario }) => {
  test.info().annotations.push({ type: 'acceptance', description: 'AI-001, AI-002, SEC-002' });
  await signIn(page, scenario.accounts.manager);
  await page.goto('/dispatch');
  await page.getByRole('button', { name: 'Open Route Logistics Assistant', exact: true }).click();
  const assistant = page.getByRole('dialog', { name: 'Route Logistics Assistant', exact: true });
  await expect(assistant).toBeVisible();
  await assistant.getByRole('button', { name: 'Help with this page', exact: true }).click();
  await expect(assistant.getByText(/Use Dispatch for overdue, potentially late, or reassignment-requested work/)).toBeVisible();
  await assistant.getByRole('button', { name: 'Go to Jobs', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs$/);
});

test('PW-AI-02 mobile assistant is keyboard-dismissible and preserves the current page', async ({ page, scenario }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, scenario.accounts.technician);
  await page.goto('/my-work');
  await page.getByRole('button', { name: 'Open Route Logistics Assistant', exact: true }).click();
  const assistant = page.getByRole('dialog', { name: 'Route Logistics Assistant', exact: true });
  await expect(assistant).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(assistant).toHaveCount(0);
  await expect(page).toHaveURL(/\/my-work$/);
});
