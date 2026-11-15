import { readFile } from 'node:fs/promises';
import { test, expect, signIn } from './support/fixtures.js';

// These scenarios use the real Auth/Firestore/Functions emulators. No network
// responses or application services are mocked. Each test owns its fixtures.
const insideAddress = scenario => scenario.insideAddress || '1600 Amphitheatre Parkway, Mountain View, CA 94043';
const outsideAddress = scenario => scenario.outsideAddress || '1 Infinite Loop, Cupertino, CA 95014';
const laterDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const annotate = (...ids) => test.info().annotations.push({ type: 'acceptance', description: ids.join(', ') });
const customerRow = (page, name) => page.getByRole('row').filter({ has: page.getByText(name, { exact: true }) });
const estimateCard = (page, title) => page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

async function openSeedEstimate(page, scenario) {
  await page.goto('/estimates');
  await expect(page.getByRole('heading', { name: 'Photo estimates', exact: true })).toBeVisible();
  await estimateCard(page, scenario.estimateTitle).getByRole('button', { name: 'Open estimate', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Version 1 · / })).toBeVisible();
}

async function checkProperty(scope, address, outcome) {
  await scope.getByLabel('Service property address', { exact: true }).fill(address);
  await scope.getByRole('button', { name: 'Check service property', exact: true }).click();
  await expect(scope.getByText(outcome, { exact: true })).toBeVisible();
}

test('PW-OPS-01 @smoke unauthenticated operational routes require sign-in', async ({ page }) => {
  annotate('ONB-001', 'SEC-001', 'SEC-002');
  await page.goto('/dispatch');
  await expect(page).toHaveURL(/\/login(?:[?#]|$)/);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dispatch Board', exact: true })).toHaveCount(0);
  await page.goto('/customers');
  await expect(page).toHaveURL(/\/login(?:[?#]|$)/);
  await expect(page.getByRole('button', { name: 'Add Customer', exact: true })).toHaveCount(0);
});

test('PW-OPS-02 @smoke company owner sees operational data without inheriting platform administration', async ({ page, scenario }) => {
  annotate('ONB-001', 'SEC-002', 'CMS-001');
  await signIn(page, scenario.accounts.owner);
  await page.goto('/customers');
  await expect(page.getByRole('heading', { name: 'Customer Management', exact: true })).toBeVisible();
  await expect(customerRow(page, scenario.customerName)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dispatch Board', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Customer', exact: true })).toBeEnabled();
  await page.goto('/platform-admin');
  await expect(page.getByRole('heading', { name: 'Platform access required', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('This account does not have platform administration access.');
  await expect(page.getByRole('button', { name: /Create FAQ|New FAQ|Publish/i })).toHaveCount(0);
});

test('PW-OPS-03 @smoke manager can dispatch but cannot access financial invoices', async ({ page, scenario }) => {
  annotate('SEC-002', 'DSP-003');
  await signIn(page, scenario.accounts.manager);
  await page.goto('/dispatch');
  await expect(page.getByRole('heading', { name: 'Dispatch Board', exact: true })).toBeVisible();
  await page.getByLabel('Service date', { exact: true }).fill(scenario.jobDate);
  await expect(page.getByRole('button', { name: `${scenario.customerName} · ${scenario.jobTitle}`, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Invoices', exact: true })).toHaveCount(0);
  await page.goto('/invoices');
  await expect(page.getByRole('heading', { name: 'Access unavailable', exact: true })).toBeVisible();
  await expect(page.getByText('Your role does not allow this screen.', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: scenario.invoiceNumber, exact: true })).toHaveCount(0);
});

test('PW-OPS-04 @smoke technician sees only assigned work and cannot open customer administration', async ({ page, scenario }) => {
  annotate('SEC-002', 'SEC-003', 'DSP-002');
  const foreignJob = await scenario.read('jobs', scenario.ids.foreignJobId);
  await signIn(page, scenario.accounts.technician);
  await page.goto('/my-work');
  await expect(page.getByRole('heading', { name: 'My Work', exact: true })).toBeVisible();
  await page.getByLabel('Service date', { exact: true }).fill(scenario.jobDate);
  const assigned = page.getByRole('button').filter({ has: page.getByText(scenario.jobTitle, { exact: true }) });
  await expect(assigned).toBeVisible();
  await expect(page.getByText(foreignJob.serviceType, { exact: true })).toHaveCount(0);
  await assigned.click();
  await expect(page.getByRole('button', { name: 'Close job', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start work', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close job', exact: true }).click();
  await assigned.click();
  await expect(page.getByRole('button', { name: 'Close job', exact: true })).toBeVisible();
  await page.goto('/customers');
  await expect(page.getByRole('heading', { name: 'Access unavailable', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Customer', exact: true })).toHaveCount(0);
});

test('PW-OPS-05 @smoke owner creates and edits a customer with persisted success feedback', async ({ page, scenario }) => {
  annotate('CRM-001', 'CRM-002');
  await signIn(page, scenario.accounts.owner);
  await page.goto('/customers');
  // Fetching the seeded rows removes the initial empty-state Add Customer CTA.
  // Wait for real data rather than racing two identically named buttons.
  await expect(customerRow(page, scenario.customerName)).toBeVisible();
  await page.getByRole('button', { name: 'Add Customer', exact: true }).click();
  const editor = page.getByRole('heading', { name: 'Add New Customer', exact: true }).locator('../..');
  const name = `Browser customer ${scenario.ids.companyId}`;
  await editor.getByPlaceholder('Enter customer name', { exact: true }).fill(name);
  await editor.getByPlaceholder('email@example.com', { exact: true }).fill(`customer-${scenario.ids.companyId}@example.invalid`);
  await editor.getByPlaceholder('(555) 123-4567', { exact: true }).fill('2025550146');
  await editor.getByPlaceholder('123 Main Street', { exact: true }).fill('1600 Amphitheatre Parkway');
  await editor.getByPlaceholder('Bakersfield', { exact: true }).fill('Mountain View');
  await editor.getByPlaceholder('CA', { exact: true }).fill('CA');
  await editor.getByPlaceholder('93311', { exact: true }).fill('94043');
  await editor.getByPlaceholder('Additional notes about this customer...', { exact: true }).fill('Synthetic browser customer; do not contact.');
  await editor.getByRole('button', { name: 'Add Customer', exact: true }).click();
  await expect(page.getByText('Customer added successfully!', { exact: true })).toBeVisible();
  await expect(customerRow(page, name)).toBeVisible();
  // The current table's action buttons have icons only. Enter through the first
  // (view) action, then use the accessible Edit Customer button in its details.
  await customerRow(page, name).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Edit Customer', exact: true }).click();
  const edit = page.getByRole('heading', { name: 'Edit Customer', exact: true }).locator('../..');
  await expect(edit.getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled();
  await edit.getByPlaceholder('Additional notes about this customer...', { exact: true }).fill('Updated synthetic browser note.');
  await edit.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(page.getByText('Customer updated successfully!', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByPlaceholder('Search customers by name, email, phone, or address...', { exact: true }).fill(name);
  await customerRow(page, name).getByRole('button').first().click();
  await expect(page.getByText('Updated synthetic browser note.', { exact: true })).toBeVisible();
  const saved = (await scenario.list('customers')).filter(customer => customer.name === name);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ companyId: scenario.ids.companyId, notes: 'Updated synthetic browser note.', isActive: true });
});

test.describe('Pacific Jobs calendar-date regression', () => {
  // Only this synthetic browser journey changes timezone; application and
  // scheduling timezone configuration remain untouched.
  test.use({ timezoneId: 'America/Los_Angeles' });

test('PW-OPS-06 manager schedules an eligible property and the job appears on dispatch', async ({ page, scenario }) => {
  annotate('DSP-002', 'DSP-003', 'DEF-JOBS-DATE');
  expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe('America/Los_Angeles');
  await signIn(page, scenario.accounts.manager);
  await page.goto('/jobs');
  await page.getByRole('button', { name: 'New Job', exact: true }).click();
  const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Schedule New Job', exact: true }) });
  const service = `Browser scheduled service ${scenario.ids.companyId}`;
  const date = '2026-11-14';
  const displayedDate = 'Nov 14, 2026';
  await form.locator('select').first().selectOption(scenario.ids.customerId);
  await form.getByPlaceholder('e.g. General Pest Control', { exact: true }).fill(service);
  await form.locator('input[type="date"]').fill(date);
  await form.locator('input[type="time"]').fill('14:30');
  await checkProperty(form, insideAddress(scenario), 'Property is inside coverage');
  await form.getByRole('button', { name: 'Schedule Job', exact: true }).click();
  const savedMessage = page.getByText('Job scheduled', { exact: true });
  const pastDateConfirmation = form.getByRole('button', { name: 'Schedule anyway', exact: true });
  let submissionState;
  await expect.poll(async () => {
    submissionState = await pastDateConfirmation.isVisible() ? 'confirm-past-date'
      : await savedMessage.isVisible() ? 'saved' : 'waiting';
    return submissionState;
  }).toMatch(/^(confirm-past-date|saved)$/);
  // The fixed regression date becomes historical. Acknowledge it through the
  // existing form rather than bypassing the application's past-date guard.
  if (submissionState === 'confirm-past-date') {
    await expect(form.getByText('This date and time is in the past.', { exact: true })).toBeVisible();
    await pastDateConfirmation.click();
  }
  await expect(savedMessage).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Schedule New Job', exact: true })).toHaveCount(0);
  const row = page.getByRole('row').filter({ has: page.getByText(service, { exact: true }) });
  await expect(row.getByText(displayedDate, { exact: true })).toBeVisible();
  const jobs = (await scenario.list('jobs')).filter(job => job.serviceType === service);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({ companyId: scenario.ids.companyId, customerId: scenario.ids.customerId, date, time: '14:30', status: 'scheduled' });
  await row.getByRole('button', { name: 'View Job', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Job Details', exact: true });
  await expect(details.getByRole('heading', { name: 'Date & Time', exact: true }).locator('..').locator('p')).toHaveText(`${displayedDate} at 2:30 PM`);
  await details.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(details).toHaveCount(0);
  const afterDisplay = await scenario.read('jobs', jobs[0].id);
  for (const field of ['date', 'time', 'startTime', 'endTime', 'scheduledStartTime', 'scheduledEndTime', 'estimatedDuration', 'assignedTo', 'customerId', 'companyId', 'serviceProperty', 'createdAt']) {
    expect(afterDisplay[field], `Viewing the date changed stored ${field}`).toEqual(jobs[0][field]);
  }
  await page.goto('/dispatch');
  await page.getByLabel('Service date', { exact: true }).fill(date);
  const card = page.locator('article').filter({ has: page.getByRole('button', { name: `${scenario.customerName} · ${service}`, exact: true }) });
  await expect(card).toBeVisible();
  await expect(card.getByLabel(`Assign ${scenario.customerName}`, { exact: true })).toHaveValue('');
  expect((await scenario.read('jobs', jobs[0].id)).date).toBe(date);
});
});

test('PW-OPS-07 dispatch assignment persists and details reopen without changing another tenant', async ({ page, scenario }) => {
  annotate('DSP-003', 'DSP-006', 'SEC-003');
  const foreignBefore = await scenario.read('jobs', scenario.ids.foreignJobId);
  await signIn(page, scenario.accounts.manager);
  await page.goto('/dispatch');
  await page.getByLabel('Service date', { exact: true }).fill(scenario.jobDate);
  const title = `${scenario.customerName} · ${scenario.jobTitle}`;
  const card = page.locator('article').filter({ has: page.getByRole('button', { name: title, exact: true }) });
  const assignment = card.getByLabel(`Assign ${scenario.customerName}`, { exact: true });
  await expect(assignment).toHaveValue(scenario.accounts.technician.membershipId);
  await assignment.selectOption('');
  await expect.poll(async () => (await scenario.read('jobs', scenario.ids.jobId)).assignedTo).toBeFalsy();
  await expect(assignment).toBeEnabled();
  await assignment.selectOption(scenario.accounts.technician.membershipId);
  await expect.poll(async () => (await scenario.read('jobs', scenario.ids.jobId)).assignedTo).toBe(scenario.accounts.technician.membershipId);
  await page.reload();
  await page.getByLabel('Service date', { exact: true }).fill(scenario.jobDate);
  await expect(assignment).toHaveValue(scenario.accounts.technician.membershipId);
  await card.getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('dialog', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await expect(page.getByRole('dialog', { name: title, exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('dialog', { name: title, exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('job-details-backdrop')).toHaveCount(0);
  await expect(card.getByRole('button', { name: title, exact: true })).toBeFocused();
  expect(await scenario.read('jobs', scenario.ids.foreignJobId)).toEqual(foreignBefore);
});

test('PW-OPS-08 owner saves service coverage and receives inside and outside property outcomes', async ({ page, scenario }) => {
  annotate('DSP-002', 'SEC-003');
  const existingJob = await scenario.read('jobs', scenario.ids.jobId);
  await signIn(page, scenario.accounts.owner);
  await page.goto('/company-setup');
  const settings = page.getByRole('region', { name: 'Service area settings', exact: true });
  await expect(settings.getByRole('button', { name: 'Save service areas', exact: true })).toBeDisabled();
  await settings.getByLabel('Default company coverage ZIP codes', { exact: true }).fill('94043, 94040');
  await settings.getByRole('button', { name: 'Save service areas', exact: true }).click();
  await expect(settings.getByText('Service areas saved. Existing appointments and history are unchanged.', { exact: true })).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Save service areas', exact: true })).toBeDisabled();
  await checkProperty(settings, insideAddress(scenario), 'Property is inside coverage');
  await checkProperty(settings, outsideAddress(scenario), 'Property is outside coverage');
  await page.reload();
  // The server normalizes and sorts ZIP codes before persisting the policy.
  await expect(settings.getByLabel('Default company coverage ZIP codes', { exact: true })).toHaveValue('94040, 94043');
  expect(await scenario.read('jobs', scenario.ids.jobId)).toEqual(existingJob);
});

test('PW-OPS-09 owner creates an estimate with server-calculated tax and persisted line pricing', async ({ page, scenario }) => {
  annotate('EST-001', 'EST-004');
  await signIn(page, scenario.accounts.owner);
  await page.goto('/estimates');
  await page.getByRole('button', { name: 'New photo estimate', exact: true }).click();
  const title = `Browser estimate ${scenario.ids.companyId}`;
  await page.getByRole('combobox', { name: 'Company customer', exact: true }).selectOption(scenario.ids.customerId);
  await page.getByLabel('Estimate title', { exact: true }).fill(title);
  await page.getByLabel('Service type', { exact: true }).fill('Synthetic browser maintenance');
  await page.getByLabel('Scope of work', { exact: true }).fill('Synthetic emulator-only scope. No actual service or accounting export.');
  await page.getByLabel('Tax rate (%)', { exact: true }).fill('7.5');
  await checkProperty(page, insideAddress(scenario), 'Property is inside coverage');
  await page.getByLabel('Description', { exact: true }).nth(0).fill('Synthetic labor');
  await page.getByLabel('Quantity', { exact: true }).nth(0).fill('2');
  await page.getByLabel('Unit price ($)', { exact: true }).nth(0).fill('75.25');
  await page.getByLabel('Description', { exact: true }).nth(1).fill('Synthetic material');
  await page.getByLabel('Quantity', { exact: true }).nth(1).fill('3');
  await page.getByLabel('Unit price ($)', { exact: true }).nth(1).fill('10.10');
  await page.getByRole('button', { name: 'Save estimate version', exact: true }).click();
  await expect(page.getByText('Estimate saved. Totals and version were calculated on the server.', { exact: true })).toBeVisible();
  await expect(page.getByText('Server total $194.36', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save estimate version', exact: true })).toBeDisabled();
  const records = (await scenario.list('estimates')).filter(estimate => estimate.title === title);
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ companyId: scenario.ids.companyId, status: 'draft', version: 1, subtotalCents: 18080, taxCents: 1356, totalCents: 19436 });
  await page.reload();
  await estimateCard(page, title).getByRole('button', { name: 'Open estimate', exact: true }).click();
  await expect(page.getByText('Server total $194.36', { exact: true })).toBeVisible();
});

test('PW-OPS-10 estimate PDF downloads from the authorized callable as an actual PDF', async ({ page, scenario }) => {
  annotate('EST-006', 'SEC-003');
  await signIn(page, scenario.accounts.owner);
  await openSeedEstimate(page, scenario);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download estimate PDF', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`estimate-${scenario.ids.estimateId}-v1.pdf`);
  expect(await download.failure()).toBeNull();
  const file = await readFile(await download.path());
  expect(file.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  expect(file.length).toBeGreaterThan(500);
  expect((await scenario.read('estimates', scenario.ids.estimateId)).status).toBe('sent');
});

test('PW-OPS-11 recipient approval converts once to a tenant-scoped scheduled job', async ({ page, scenario }) => {
  annotate('EST-008', 'EST-009');
  await page.goto(scenario.approvalUrl);
  await expect(page.getByRole('heading', { name: scenario.estimateTitle, exact: true })).toBeVisible();
  await page.getByLabel('Your full name', { exact: true }).fill('Synthetic browser approver');
  await page.getByRole('checkbox', { name: /I approve this estimate/ }).check();
  await page.getByRole('button', { name: 'Approve this estimate', exact: true }).click();
  await expect(page.getByText('Your approval is recorded. Your provider will confirm scheduling.', { exact: true })).toBeVisible();
  expect((await scenario.read('estimates', scenario.ids.estimateId)).status).toBe('approved');
  await signIn(page, scenario.accounts.owner);
  await openSeedEstimate(page, scenario);
  await page.getByLabel('Service date', { exact: true }).fill(laterDate());
  await page.getByLabel('Time', { exact: true }).fill('11:15');
  await page.getByRole('button', { name: 'Convert approved estimate to job', exact: true }).click();
  await page.getByRole('dialog', { name: 'Confirm estimate action', exact: true }).getByRole('button', { name: 'Confirm job conversion', exact: true }).click();
  await expect(page.getByText(/^Converted job: .*Conversion is recorded once\.$/)).toBeVisible();
  const jobs = (await scenario.list('jobs')).filter(job => job.estimateId === scenario.ids.estimateId);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({ companyId: scenario.ids.companyId, customerId: scenario.ids.customerId, status: 'scheduled', time: '11:15', estimateVersion: 1 });
  await page.reload();
  await estimateCard(page, scenario.estimateTitle).getByRole('button', { name: 'Open estimate', exact: true }).click();
  await expect(page.getByText(/^Converted job: .*Conversion is recorded once\.$/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Convert approved estimate to job', exact: true })).toHaveCount(0);
  expect((await scenario.list('jobs')).filter(job => job.estimateId === scenario.ids.estimateId)).toHaveLength(1);
});

test('PW-OPS-12 owner can view invoice and payment history without changing invoice status', async ({ page, scenario }) => {
  annotate('SEC-002');
  const before = await scenario.read('invoices', scenario.ids.invoiceId);
  await signIn(page, scenario.accounts.owner);
  await page.goto('/invoices');
  await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible();
  const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: scenario.invoiceNumber, exact: true }) });
  await expect(row).toBeVisible();
  await expect(row.getByRole('cell', { name: scenario.customerName, exact: true })).toBeVisible();
  await expect(row.getByRole('cell', { name: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(before.total), exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Payment history', exact: true }).click();
  const history = page.getByRole('dialog', { name: 'Invoice payment history', exact: true });
  await expect(history.getByRole('heading', { name: 'Payment history', exact: true })).toBeVisible();
  await expect(history.getByText('No reconciled payments recorded.', { exact: true })).toBeVisible();
  await history.getByRole('button', { name: 'Close history', exact: true }).click();
  await expect(history).toHaveCount(0);
  expect(await scenario.read('invoices', scenario.ids.invoiceId)).toEqual(before);
});
