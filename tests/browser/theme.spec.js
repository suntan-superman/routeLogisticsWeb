import { test, expect, signIn } from './support/fixtures.js';
import { selectValue, selectOptions, expectSelectValue } from './support/select.js';

const appearance = page => page.getByRole('combobox', { name: 'Appearance', exact: true });
async function expectTheme(page, theme, preference) {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/(?:^|\s)dark(?:\s|$)/);
  else await expect(page.locator('html')).not.toHaveClass(/(?:^|\s)dark(?:\s|$)/);
  if (preference) await expectSelectValue(appearance(page), preference);
}
async function chooseTheme(page, preference) {
  await selectValue(appearance(page), preference);
  if (preference !== 'system') await expectTheme(page, preference, preference);
}

// Read actual rendered CSS, including transparent ancestor layers, instead of
// asserting token names. The browser canvas resolves each supported CSS color.
async function colors(locator) {
  await expect(locator).toBeVisible();
  return locator.evaluate(element => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const rgba = color => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data].map((value, index) => index === 3 ? value / 255 : value); };
    const blend = (front, back) => [0, 1, 2].map(index => front[index] * front[3] + back[index] * (1 - front[3])).concat(1);
    const luminance = color => color.slice(0, 3).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const ancestors = []; for (let node = element; node; node = node.parentElement) ancestors.unshift(node);
    const background = ancestors.reduce((base, node) => blend(rgba(getComputedStyle(node).backgroundColor), base), [255, 255, 255, 1]);
    const style = getComputedStyle(element), foreground = blend(rgba(style.color), background), ink = luminance(foreground), paper = luminance(background);
    return { color: style.color, background, foreground, backgroundLuminance: paper, contrast: (Math.max(ink, paper) + 0.05) / (Math.min(ink, paper) + 0.05), colorScheme: style.colorScheme };
  });
}
async function expectReadable(locator, label, minimum = 4.5) {
  const result = await colors(locator);
  expect(result.contrast, `${label}: rendered foreground/background contrast ${JSON.stringify(result)}`).toBeGreaterThanOrEqual(minimum);
  return result;
}
async function expectGreenOption(option, label) {
  const result = await expectReadable(option, label);
  expect(result.background[1], `${label} keeps the shared green selection`).toBeGreaterThan(result.background[0]);
  expect(result.background[1]).toBeGreaterThan(result.background[2]);
}

test('PW-THEME-01 @smoke system appearance follows OS changes and explicit preference persists across reloads and tabs', async ({ page, context }) => {
  test.info().annotations.push({ type: 'acceptance', description: 'Web appearance: system changes, explicit preference, reload and real cross-tab storage synchronization' });
  await page.emulateMedia({ colorScheme: 'dark' }); await page.goto('/login');
  await expectTheme(page, 'dark', 'system');
  await page.emulateMedia({ colorScheme: 'light' }); await expectTheme(page, 'light', 'system');
  await chooseTheme(page, 'dark'); expect(await page.evaluate(() => localStorage.getItem('rl-web-theme'))).toBe('dark');
  await page.reload(); await expectTheme(page, 'dark', 'dark');
  await page.emulateMedia({ colorScheme: 'light' }); await expectTheme(page, 'dark', 'dark');
  const other = await context.newPage();
  try {
    await other.emulateMedia({ colorScheme: 'light' }); await other.goto('/login'); await expectTheme(other, 'dark', 'dark');
    await chooseTheme(other, 'light'); await expectTheme(page, 'light', 'light');
    await page.emulateMedia({ colorScheme: 'dark' }); await expectTheme(page, 'light', 'light');
    await chooseTheme(other, 'system'); await expectTheme(page, 'dark', 'system'); await expectTheme(other, 'light', 'system');
    await page.reload(); await expectTheme(page, 'dark', 'system'); expect(await page.evaluate(() => localStorage.getItem('rl-web-theme'))).toBe('system');
  } finally { await other.close(); }
});

test('PW-THEME-02 authenticated Jobs and inquiry dialogs remain readable without changing records, roles or print output', async ({ page, scenario }) => {
  test.setTimeout(90000);
  test.info().annotations.push({ type: 'acceptance', description: 'Web appearance: authenticated operations, modal and dropdown contrast, native controls, print, sign-out persistence and unchanged authorization' });
  const before = { job: await scenario.read('jobs', scenario.ids.jobId), customer: await scenario.read('customers', scenario.ids.customerId), member: await scenario.read('teamMembers', scenario.accounts.technician.membershipId) };
  await signIn(page, scenario.accounts.owner);
  for (const mode of ['light', 'dark']) {
    await page.getByRole('link', { name: 'Jobs', exact: true }).filter({ visible: true }).click(); await chooseTheme(page, mode);
    await expectReadable(page.getByRole('heading', { name: 'Job Management', exact: true }), `${mode} Jobs heading`, 3);
    const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: `View job details for ${scenario.customerName} · ${scenario.serviceType}`, exact: true }) });
    await expect(row).toBeVisible(); await expectReadable(row.getByText(/^scheduled$/i), `${mode} scheduled status`);
    await page.screenshot({ path: test.info().outputPath(`jobs-${mode}.png`), fullPage: true });
    await expectReadable(page.getByRole('button', { name: 'New Job', exact: true }), `${mode} New Job action`);
    await page.getByRole('button', { name: 'New Job', exact: true }).click();
    const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Schedule New Job', exact: true }) });
    await expectReadable(form.getByRole('heading', { name: 'Schedule New Job', exact: true }), `${mode} job modal heading`, 3);
    await expectReadable(form.getByRole('combobox', { name: 'Customer', exact: true }), `${mode} customer input`);
    const date = form.locator('input[type="date"]'); await expectReadable(date, `${mode} native date field`);
    expect((await colors(date)).colorScheme, `${mode} native controls inherit the selected color scheme`).toMatch(new RegExp(`\\b${mode}\\b`));
    const priority = form.getByRole('combobox', { name: 'Priority', exact: true }), options = await selectOptions(priority);
    await expectGreenOption(options.and(page.locator('[data-option-value="medium"]')), `${mode} active priority option`);
    await expectReadable(options.and(page.locator('[data-option-value="low"]')), `${mode} remaining priority option`);
    await page.screenshot({ path: test.info().outputPath(`job-dialog-${mode}.png`), fullPage: true });
    await priority.press('Escape'); await form.getByRole('button', { name: 'Close', exact: true }).click(); await expect(form).toHaveCount(0);
    await page.getByRole('link', { name: 'Customers', exact: true }).filter({ visible: true }).click(); await page.getByRole('button', { name: 'New Inquiry', exact: true }).click();
    const inquiry = page.getByRole('dialog', { name: 'New Inquiry', exact: true });
    await expectReadable(inquiry.getByRole('heading', { name: 'New Inquiry', exact: true }), `${mode} inquiry modal heading`, 3);
    await expectReadable(inquiry.getByLabel('Find existing customer', { exact: true }), `${mode} inquiry search input`);
    await expectReadable(inquiry.locator('label').filter({ hasText: /^Find existing customer/ }), `${mode} inquiry field label`);
    await inquiry.getByRole('button', { name: 'Close inquiry', exact: true }).click(); await expect(inquiry).toHaveCount(0);
  }
  await page.getByRole('link', { name: 'Jobs', exact: true }).filter({ visible: true }).click(); await expectTheme(page, 'dark', 'dark');
  const desktop = page.viewportSize(); await page.setViewportSize({ width: 390, height: 844 });
  await expect(appearance(page)).toBeVisible(); const compactAppearance = await appearance(page).boundingBox();
  expect(compactAppearance.x).toBeGreaterThanOrEqual(0); expect(compactAppearance.x + compactAppearance.width).toBeLessThanOrEqual(390);
  const notifications = page.getByRole('button', { name: /Enable notifications|Notifications on/ });
  if (await notifications.count()) { await expect(notifications).toBeVisible(); const box = await notifications.boundingBox(); expect(box.x + box.width).toBeLessThanOrEqual(390); }
  const topbar = page.locator('.sticky.top-0').filter({ has: appearance(page) });
  expect(await topbar.evaluate(element => element.scrollWidth <= element.clientWidth), 'The compact workspace appearance header fits its viewport').toBe(true);
  await page.setViewportSize(desktop);
  await page.emulateMedia({ media: 'print' });
  expect((await colors(page.locator('body'))).backgroundLuminance, 'Printed pages use a white background').toBeGreaterThanOrEqual(0.95);
  await expectReadable(page.getByRole('heading', { name: 'Job Management', exact: true }), 'printed heading', 3);
  await page.emulateMedia({ media: 'screen' }); await expectTheme(page, 'dark', 'dark');
  await page.getByRole('button', { name: 'Sign out', exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/login(?:[?#]|$)/); await expectTheme(page, 'dark', 'dark');
  await signIn(page, scenario.accounts.technician); await page.goto('/customers');
  await expectTheme(page, 'dark'); await expect(page.getByRole('heading', { name: 'Access unavailable', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Customer', exact: true })).toHaveCount(0);
  expect(await scenario.read('jobs', scenario.ids.jobId)).toEqual(before.job);
  expect(await scenario.read('customers', scenario.ids.customerId)).toEqual(before.customer);
  expect(await scenario.read('teamMembers', scenario.accounts.technician.membershipId)).toEqual(before.member);
});

test('PW-THEME-03 @smoke narrow-screen sign-in and its custom appearance menu are readable in light and dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/login');
  for (const mode of ['light', 'dark']) {
    await chooseTheme(page, mode);
    await expectReadable(page.getByRole('heading', { name: 'Welcome back', exact: true }), `${mode} mobile login heading`, 3);
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill('synthetic-theme@example.test');
    await expectReadable(page.getByRole('textbox', { name: 'Email address', exact: true }), `${mode} mobile email input`);
    await expectReadable(page.locator('label[for="email"]'), `${mode} mobile field label`);
    await expectReadable(page.getByRole('button', { name: 'Sign in', exact: true }), `${mode} mobile sign-in action`);
    const options = await selectOptions(appearance(page));
    await expectGreenOption(options.and(page.locator(`[data-option-value="${mode}"]`)), `${mode} current appearance choice`);
    await expectReadable(options.and(page.locator('[data-option-value="system"]')), `${mode} system appearance choice`);
    await appearance(page).press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${mode} login fits the mobile viewport`).toBe(true);
    const box = await appearance(page).boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390);
    await expect(page.getByRole('textbox', { name: 'Email address', exact: true })).toHaveValue('synthetic-theme@example.test');
  }
  // Appearance changes never submit credentials or send OTP/email requests.
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled(); await expect(page).toHaveURL(/\/login(?:[?#]|$)/);
});

test('PW-THEME-04 calendar toolbar, work cells and date popup use the selected palette without changing appointments', async ({ page, scenario }) => {
  test.skip(process.env.RL_BROWSER_CALENDAR_LICENSE_CONFIGURED !== 'true', 'Calendar UI coverage requires the existing authorized Syncfusion client license; do not bypass the vendor license banner.');
  test.info().annotations.push({ type: 'acceptance', description: 'Web appearance: real Syncfusion calendar toolbar, time/date headers, work-cell surfaces and date popup in both themes; no appointment mutation' });
  const before = await scenario.read('jobs', scenario.ids.jobId);
  await signIn(page, scenario.accounts.owner);
  const customerLoad = page.waitForResponse(response => response.url().endsWith('/rlReadWorkspace') && response.request().method() === 'POST' && response.request().postDataJSON()?.data?.resource === 'customers');
  await page.getByRole('link', { name: 'Calendar', exact: true }).filter({ visible: true }).click();
  // Initial customer hydration refreshes the vendor's event data and closes its
  // popup. Wait for that read before testing presentation, rather than sleeping.
  await customerLoad;
  const schedule = page.locator('.custom-schedule.e-schedule'), range = schedule.locator('.e-date-range .e-tbar-btn');
  await expect(schedule).toBeVisible();
  for (const mode of ['light', 'dark']) {
    await chooseTheme(page, mode);
    await expectReadable(schedule.locator('.e-date-range .e-tbar-btn-text'), `${mode} calendar date toolbar`);
    await expectReadable(schedule.locator('.e-active-view .e-tbar-btn-text'), `${mode} calendar selected view`);
    await expectReadable(schedule.getByRole('link', { name: /^\d{1,2}$/ }).first(), `${mode} calendar day/date heading`);
    await expectReadable(schedule.locator('.e-time-cells-wrap .e-time-cells').first(), `${mode} calendar time label`);
    const working = await colors(schedule.locator('.e-work-cells.e-work-hours').first());
    const nonworking = await colors(schedule.locator('.e-work-cells:not(.e-work-hours)').first());
    if (mode === 'dark') { expect(working.backgroundLuminance).toBeLessThan(0.12); expect(nonworking.backgroundLuminance).toBeLessThan(0.12); }
    else { expect(working.backgroundLuminance).toBeGreaterThan(0.85); expect(nonworking.backgroundLuminance).toBeGreaterThan(0.85); }
    await range.click(); const popup = schedule.locator('.e-header-popup.e-popup-open'); await expect(popup).toBeVisible();
    await expectReadable(popup.locator('.e-calendar .e-title'), `${mode} calendar date-popup month`);
    await expectReadable(popup.locator('.e-calendar .e-week-header th').first(), `${mode} calendar date-popup weekday`);
    await expectGreenOption(popup.locator('.e-calendar td.e-selected .e-day'), `${mode} calendar selected date`);
    await expectGreenOption(popup.getByRole('button', { name: 'Today', exact: true }), `${mode} calendar Today action`);
    await expectReadable(popup.locator('.e-calendar td:not(.e-selected):not(.e-other-month) .e-day').first(), `${mode} calendar available date`);
    await page.screenshot({ path: test.info().outputPath(`calendar-${mode}.png`), fullPage: true });
    await range.click(); await expect(popup).toHaveCount(0);
  }
  await expect(page.getByRole('heading', { name: 'Schedule New Job', exact: true })).toHaveCount(0);
  expect(await scenario.read('jobs', scenario.ids.jobId)).toEqual(before);
});
