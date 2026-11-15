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
const timeOptionLabel = value => { const [hour, minute] = value.split(':').map(Number); return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`; };

async function chooseCustomer(scope, name) {
  const customer = scope.getByRole('combobox', { name: 'Customer', exact: true });
  await customer.click();
  await customer.fill(name);
  await scope.getByRole('listbox').getByRole('option', { name, exact: true }).click();
}

async function chooseTime(scope, label, value) {
  await scope.getByRole('combobox', { name: label, exact: true }).click();
  await scope.getByRole('listbox').getByRole('option', { name: timeOptionLabel(value), exact: true }).click();
}

async function chooseTechnician(scope, name = 'Synthetic technician') {
  const picker = scope.getByRole('combobox', { name: 'Assigned technician', exact: true });
  await expect(picker).toBeEnabled();
  await picker.click();
  await picker.fill(name);
  await scope.getByRole('listbox').getByRole('option', { name, exact: true }).click();
}

async function openSeedEstimate(page, scenario) {
  await page.goto('/estimates');
  await expect(page.getByRole('heading', { name: 'Photo estimates', exact: true })).toBeVisible();
  await estimateCard(page, scenario.estimateTitle).getByRole('button', { name: 'Open estimate', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Version 1 · / })).toBeVisible();
}

async function checkProperty(scope, address, outcome) {
  const input = scope.getByLabel('Service property address', { exact: true });
  const unlock = scope.getByRole('button', { name: 'Enable Editing', exact: true });
  if (await input.isDisabled() && await unlock.count()) await unlock.click();
  await input.fill(address);
  await scope.getByRole('button', { name: 'Check service property', exact: true }).click();
  await expect(scope.getByText(outcome, { exact: true })).toBeVisible();
}

async function setSyntheticCustomerAddress(page, scenario) {
  // Change only this test's already-authorized emulator customer through the
  // real customer editor. Its seeded historical job deliberately stays put.
  // Both the edited customer and the later job use tenant-private cached
  // canonical addresses. No Google API lookup is needed by this journey.
  await page.goto('/customers');
  await expect(customerRow(page, scenario.customerName)).toBeVisible();
  await customerRow(page, scenario.customerName).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Edit Customer', exact: true }).click();
  const edit = page.getByRole('heading', { name: 'Edit Customer', exact: true }).locator('../..');
  await edit.getByPlaceholder('123 Main Street', { exact: true }).fill(outsideAddress(scenario));
  await edit.getByPlaceholder('Bakersfield', { exact: true }).fill('');
  await edit.getByPlaceholder('CA', { exact: true }).fill('');
  await edit.getByPlaceholder('93311', { exact: true }).fill('');
  await edit.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(page.getByText('Customer updated successfully!', { exact: true })).toBeVisible();
  return scenario.read('customers', scenario.ids.customerId);
}

async function openAddressJob(page, scenario, title) {
  await page.goto('/jobs');
  await page.getByRole('button', { name: 'New Job', exact: true }).click();
  const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Schedule New Job', exact: true }) });
  await chooseCustomer(form, scenario.customerName);
  await form.getByPlaceholder('e.g. General Pest Control', { exact: true }).fill(title);
  await form.locator('input[type="date"]').fill(laterDate());
  await chooseTime(form, 'Start time', '10:45');
  return form;
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
  // Use the exact tenant-private Google validation cache entry seeded by the
  // emulator fixture. The backend still validates it; no provider call occurs.
  await editor.getByPlaceholder('123 Main Street', { exact: true }).fill(insideAddress(scenario));
  await editor.getByPlaceholder('Bakersfield', { exact: true }).fill('');
  await editor.getByPlaceholder('CA', { exact: true }).fill('');
  await editor.getByPlaceholder('93311', { exact: true }).fill('');
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
  expect(saved[0]).toMatchObject({ companyId: scenario.ids.companyId, address: insideAddress(scenario), city: '', state: '', zipCode: '', notes: 'Updated synthetic browser note.', isActive: true, addressValidation: { source: 'google-address-validation' } });
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
  await chooseCustomer(form, scenario.customerName);
  await form.getByPlaceholder('e.g. General Pest Control', { exact: true }).fill(service);
  await form.locator('input[type="date"]').fill(date);
  await chooseTime(form, 'Start time', '14:30');
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
  await chooseTime(page, 'Time', '11:15');
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

test('PW-OPS-13 saved job addresses are locked and an explicitly edited one-off visit leaves the customer unchanged', async ({ page, scenario }) => {
  annotate('DSP-002', 'CRM-002');
  const historyBefore = await scenario.read('jobs', scenario.ids.jobId);
  await signIn(page, scenario.accounts.owner);
  const customerBefore = await setSyntheticCustomerAddress(page, scenario);
  const service = `One-off browser property ${scenario.ids.companyId}`;
  const form = await openAddressJob(page, scenario, service);
  const address = form.getByLabel('Service property address', { exact: true });
  await expect(address).toHaveValue(outsideAddress(scenario));
  await expect(address).toBeDisabled();
  await expect(form.getByText(/Using the customer's saved address/)).toBeVisible();
  const customer = form.getByRole('combobox', { name: 'Customer', exact: true });
  await customer.click();
  const selected = form.getByRole('listbox').getByRole('option', { name: scenario.customerName, exact: true });
  await expect(selected).toHaveAttribute('aria-selected', 'true');
  await selected.hover();
  await expect.poll(() => selected.evaluate(node => {
    const [red, green, blue] = getComputedStyle(node).backgroundColor.match(/[\d.]+/g).map(Number);
    return green > red && green > blue;
  })).toBe(true);
  await customer.press('Escape');
  await expect(form.getByRole('listbox')).toHaveCount(0);
  await expect(form).toBeVisible();
  await customer.click();
  await customer.fill('zz-no-customer-match-zz');
  await expect(form.getByRole('listbox').getByRole('option')).toHaveCount(0);
  await customer.press('Escape');
  await expect(customer).toHaveValue(scenario.customerName);
  await expect(address).toHaveValue(outsideAddress(scenario));
  await customer.click();
  await customer.fill(scenario.customerName);
  const targetId = await form.getByRole('listbox').getByRole('option', { name: scenario.customerName, exact: true }).getAttribute('id');
  await customer.press('Home');
  for (let attempts = 0; attempts < 20 && await customer.getAttribute('aria-activedescendant') !== targetId; attempts++) await customer.press('ArrowDown');
  await expect(customer).toHaveAttribute('aria-activedescendant', targetId);
  await customer.press('Enter');
  await expect(customer).toHaveValue(scenario.customerName);
  await expect(form.getByRole('listbox')).toHaveCount(0);
  await customer.click(); await customer.press('Tab');
  await expect(form.getByRole('listbox')).toHaveCount(0);
  await expect(customer).not.toBeFocused();
  await customer.click();
  await form.getByRole('heading', { name: 'Schedule New Job', exact: true }).click();
  await expect(form.getByRole('listbox')).toHaveCount(0);
  const startTime = form.getByRole('combobox', { name: 'Start time', exact: true });
  await startTime.click();
  const times = form.getByRole('listbox').getByRole('option');
  await expect(times).toHaveCount(96);
  for (const option of await times.locator('span:first-child').allTextContents()) expect(option.trim()).toMatch(/^\d{1,2}:(00|15|30|45) (AM|PM)$/);
  await form.getByRole('listbox').getByRole('option', { name: '9:15 AM', exact: true }).click();
  await expect(startTime).toHaveValue('9:15 AM');
  await expect(form.getByRole('checkbox', { name: "Update customer's saved address", exact: true })).toHaveCount(0);
  await form.getByRole('button', { name: 'Enable Editing', exact: true }).click();
  await expect(address).toBeEnabled();
  await checkProperty(form, insideAddress(scenario), 'Property is inside coverage');
  const permanent = form.getByRole('checkbox', { name: "Update customer's saved address", exact: true });
  await expect(permanent).not.toBeChecked();
  await form.getByRole('button', { name: 'Schedule Job', exact: true }).click();
  await expect(page.getByText('Job scheduled', { exact: true })).toBeVisible();
  await expect(form).toHaveCount(0);
  const jobs = (await scenario.list('jobs')).filter(job => job.serviceType === service);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({ companyId: scenario.ids.companyId, customerId: scenario.ids.customerId, address: insideAddress(scenario), time: '09:15', serviceProperty: { address: insideAddress(scenario) } });
  expect(await scenario.read('customers', scenario.ids.customerId)).toEqual(customerBefore);
  expect(await scenario.read('jobs', scenario.ids.jobId)).toEqual(historyBefore);
});

test('PW-OPS-14 permanent address opt-in updates the selected customer and refreshes the next locked job default', async ({ page, scenario }) => {
  annotate('DSP-002', 'CRM-002', 'SEC-003');
  const historyBefore = await scenario.read('jobs', scenario.ids.jobId);
  const duplicateBefore = await scenario.read('customers', scenario.ids.duplicateCustomerId);
  await signIn(page, scenario.accounts.owner);
  const customerBefore = await setSyntheticCustomerAddress(page, scenario);
  const service = `Permanent browser property ${scenario.ids.companyId}`;
  const form = await openAddressJob(page, scenario, service);
  const address = form.getByLabel('Service property address', { exact: true });
  await expect(address).toHaveValue(outsideAddress(scenario));
  await expect(address).toBeDisabled();
  await checkProperty(form, insideAddress(scenario), 'Property is inside coverage');
  const permanent = form.getByRole('checkbox', { name: "Update customer's saved address", exact: true });
  await expect(permanent).not.toBeChecked();
  await permanent.check();
  await form.getByRole('button', { name: 'Schedule Job', exact: true }).click();
  await expect(page.getByText('Job scheduled and customer address updated.', { exact: true })).toBeVisible();
  await expect(form).toHaveCount(0);
  const jobs = (await scenario.list('jobs')).filter(job => job.serviceType === service);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({ companyId: scenario.ids.companyId, customerId: scenario.ids.customerId, address: insideAddress(scenario), serviceProperty: { address: insideAddress(scenario) } });
  const updated = await scenario.read('customers', scenario.ids.customerId);
  expect(updated.address).toContain('1600 Amphitheatre Parkway');
  expect(updated.address).not.toBe(customerBefore.address);
  expect(updated).toMatchObject({ companyId: customerBefore.companyId, userId: customerBefore.userId, name: customerBefore.name, email: customerBefore.email, phone: customerBefore.phone });
  expect(await scenario.read('customers', scenario.ids.duplicateCustomerId)).toEqual(duplicateBefore);
  expect(await scenario.read('jobs', scenario.ids.jobId)).toEqual(historyBefore);
  // No page reload: the scheduling parent's successful-save refresh must make
  // the corrected customer address available to the very next new-job form.
  await page.getByRole('button', { name: 'New Job', exact: true }).click();
  const next = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Schedule New Job', exact: true }) });
  await chooseCustomer(next, scenario.customerName);
  await expect(next.getByLabel('Service property address', { exact: true })).toHaveValue(insideAddress(scenario));
  await expect(next.getByLabel('Service property address', { exact: true })).toBeDisabled();
  expect((await scenario.list('jobs')).filter(job => job.serviceType === service)).toHaveLength(1);
});

test('PW-OPS-15 scheduling assigns a technician and a conflicting visit offers quarter-hour alternatives without saving automatically', async ({ page, scenario }) => {
  annotate('DSP-002', 'DSP-003', 'DSP-004', 'DSP-009');
  await signIn(page, scenario.accounts.owner);
  const firstService = `Assigned browser visit ${scenario.ids.companyId}`, secondService = `Alternate browser visit ${scenario.ids.companyId}`;
  const date = laterDate();
  const first = await openAddressJob(page, scenario, firstService);
  await first.locator('input[type="date"]').fill(date);
  await chooseTime(first, 'Start time', '09:00');
  await first.locator('input[type="number"]').first().fill('1.25');
  await checkProperty(first, insideAddress(scenario), 'Property is inside coverage');
  await chooseTechnician(first);
  await expect(first.getByText('Available for this appointment', { exact: true })).toBeVisible();
  await first.getByRole('button', { name: 'Schedule Job', exact: true }).click();
  await expect(page.getByText('Job scheduled', { exact: true })).toBeVisible();
  await expect(first).toHaveCount(0);
  const savedFirst = (await scenario.list('jobs')).filter(job => job.serviceType === firstService);
  expect(savedFirst).toHaveLength(1);
  expect(savedFirst[0]).toMatchObject({ companyId: scenario.ids.companyId, date, time: '09:00', estimatedDuration: 1.25, assignedTo: scenario.accounts.technician.membershipId, assignedToUid: scenario.accounts.technician.uid, assignedToName: 'Synthetic technician' });

  const second = await openAddressJob(page, scenario, secondService);
  await second.locator('input[type="date"]').fill(date);
  await chooseTime(second, 'Start time', '09:45');
  await checkProperty(second, insideAddress(scenario), 'Property is inside coverage');
  await chooseTechnician(second);
  const availability = second.getByRole('region', { name: 'Technician availability', exact: true });
  await expect(availability.getByText('This appointment needs another time or technician', { exact: true })).toBeVisible();
  await second.getByRole('button', { name: 'Schedule Job', exact: true }).click();
  await expect(second.getByRole('button', { name: 'Schedule Job', exact: true })).toBeEnabled();
  await expect(second).toBeVisible();
  expect((await scenario.list('jobs')).filter(job => job.serviceType === secondService)).toHaveLength(0);
  const alternative = availability.getByRole('group', { name: 'Available alternative times', exact: true }).getByRole('button').first();
  await expect(alternative).toContainText('10:15 AM');
  await alternative.click();
  await expect(second.getByRole('combobox', { name: 'Start time', exact: true })).toHaveValue('10:15 AM');
  await expect(second.locator('input[type="date"]')).toHaveValue(date);
  expect((await scenario.list('jobs')).filter(job => job.serviceType === secondService)).toHaveLength(0);
  await expect(availability.getByText('Available for this appointment', { exact: true })).toBeVisible();
  await second.getByRole('button', { name: 'Schedule Job', exact: true }).click();
  await expect(page.getByText('Job scheduled', { exact: true })).toBeVisible();
  await expect(second).toHaveCount(0);
  const savedSecond = (await scenario.list('jobs')).filter(job => job.serviceType === secondService);
  expect(savedSecond).toHaveLength(1);
  expect(savedSecond[0]).toMatchObject({ date, time: '10:15', assignedTo: scenario.accounts.technician.membershipId, assignedToUid: scenario.accounts.technician.uid, assignedToName: 'Synthetic technician' });
  expect((await scenario.read('jobs', savedFirst[0].id)).time).toBe('09:00');
  expect((await scenario.list('jobs')).filter(job => [firstService, secondService].includes(job.serviceType) && job.time === '09:45')).toHaveLength(0);
});

test('PW-OPS-16 weekly scheduling creates the first assigned visit and plan together and reserves future Thursdays', async ({ page, scenario }) => {
  annotate('DSP-002', 'DSP-003', 'DSP-005', 'DSP-009');
  await signIn(page, scenario.accounts.owner);
  const firstDateValue = new Date(`${laterDate()}T12:00:00Z`);
  while (firstDateValue.getUTCDay() !== 4) firstDateValue.setUTCDate(firstDateValue.getUTCDate() + 1);
  const firstDate = firstDateValue.toISOString().slice(0, 10);
  firstDateValue.setUTCDate(firstDateValue.getUTCDate() + 7);
  const nextDate = firstDateValue.toISOString().slice(0, 10), service = `Weekly browser visit ${scenario.ids.companyId}`;
  const customerBefore = await scenario.read('customers', scenario.ids.customerId);
  const form = await openAddressJob(page, scenario, service);
  await form.locator('input[type="date"]').fill(firstDate);
  await chooseTime(form, 'Start time', '09:00');
  await checkProperty(form, insideAddress(scenario), 'Property is inside coverage');
  await chooseTechnician(form);
  await form.getByRole('combobox', { name: 'Appointment type', exact: true }).selectOption('recurring');
  await form.getByRole('combobox', { name: 'Repeat frequency', exact: true }).selectOption('weekly');
  await expect(form.getByText('Every Thursday', { exact: true })).toBeVisible();
  await form.getByRole('combobox', { name: 'Recurring technician fallback', exact: true }).selectOption('auto');
  await expect(form.getByText('Available for this appointment', { exact: true })).toBeVisible();
  await form.getByRole('button', { name: 'Schedule Job', exact: true }).click();
  await expect(page.getByText('Recurring appointment scheduled.', { exact: true })).toBeVisible();
  await expect(form).toHaveCount(0);
  const visits = (await scenario.list('jobs')).filter(job => job.serviceType === service);
  const plans = (await scenario.list('servicePlans')).filter(plan => plan.serviceType === service);
  expect(visits).toHaveLength(1); expect(plans).toHaveLength(1);
  expect(visits[0]).toMatchObject({ date: firstDate, time: '09:00', servicePlanId: plans[0].id, servicePlanDate: firstDate, assignedTo: scenario.accounts.technician.membershipId, assignedToUid: scenario.accounts.technician.uid, assignedToName: 'Synthetic technician' });
  expect(plans[0]).toMatchObject({ companyId: scenario.ids.companyId, customerId: scenario.ids.customerId, active: true, preferredTechnicianId: scenario.accounts.technician.membershipId, preferredTechnicianUid: scenario.accounts.technician.uid, assignmentFallback: 'auto', nextServiceDate: nextDate, lastJobId: visits[0].id, lastGeneratedFor: firstDate, recurrence: { version: 1, frequency: 'weekly', interval: 1, anchorDate: firstDate, weekday: 4 } });
  expect(await scenario.read('customers', scenario.ids.customerId)).toEqual(customerBefore);
  expect((await scenario.list('jobs')).filter(job => job.servicePlanId === plans[0].id && job.date === nextDate)).toHaveLength(0);

  const futureService = `Conflicting future browser visit ${scenario.ids.companyId}`;
  const future = await openAddressJob(page, scenario, futureService);
  await future.locator('input[type="date"]').fill(nextDate);
  await chooseTime(future, 'Start time', '09:00');
  await chooseTechnician(future);
  const availability = future.getByRole('region', { name: 'Technician availability', exact: true });
  await expect(availability.getByText('This appointment needs another time or technician', { exact: true })).toBeVisible();
  await expect(availability.getByRole('listitem').filter({ hasText: 'Recurring appointment' })).toBeVisible();
  await expect(availability.getByRole('group', { name: 'Available alternative times', exact: true }).getByRole('button').first()).toContainText('10:00 AM');
  expect((await scenario.list('jobs')).filter(job => job.serviceType === futureService)).toHaveLength(0);
});
