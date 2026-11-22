import { selectValue, selectOptions, expectSelectValue } from './support/select.js';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
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

test('PW-NOTES-01 technician note replay is idempotent and Jobs/Dispatch share work details', async ({ page, scenario }) => {
  annotate('DSP-003', 'SEC-002', 'SEC-003', 'FR-001');
  const original = await scenario.read('jobs', scenario.ids.jobId), foreign = await scenario.read('jobs', scenario.ids.foreignJobId);
  await signIn(page, scenario.accounts.technician);
  const readRequest = page.waitForRequest(request => request.url().includes('/rlReadWorkspace') && request.method() === 'POST');
  await page.goto('/my-work');
  const authorization = await (await readRequest).headerValue('authorization');
  expect(Boolean(authorization?.startsWith('Bearer '))).toBe(true);
  const endpoint = scenario.functionUrl('rlApplyJobOperation');
  expect(new URL(endpoint).origin).toBe('http://127.0.0.1:5001');
  const workNotes = `${scenario.prefix} Technician observations after the visit.\nGate access was checked; no appointment changes requested.`;
  const payload = { operationId: randomUUID(), jobId: scenario.ids.jobId, patch: { notes: workNotes }, expectedVersion: original.updatedAt };
  const response = await page.request.post(endpoint, { headers: { authorization }, data: { data: payload } });
  expect(response.ok()).toBe(true);
  const accepted = (await response.json()).result;
  expect(accepted.status).toBe('synced'); expect(typeof accepted.version).toBe('string');
  const replay = await page.request.post(endpoint, { headers: { authorization }, data: { data: payload } });
  expect(replay.ok()).toBe(true); expect((await replay.json()).result).toEqual(accepted);
  let saved = await scenario.read('jobs', scenario.ids.jobId);
  expect(saved.workNotes).toBe(workNotes); expect(saved.notes).toBe(original.notes);
  expect(saved.updatedAt).toBe(accepted.version);
  for (const field of ['status', 'assignedTo', 'assignedToUid', 'date', 'time', 'privateNotes']) expect(saved[field]).toEqual(original[field]);
  const operations = (await scenario.list('rlOperations')).filter(row => row.companyId === scenario.ids.companyId && row.jobId === scenario.ids.jobId && row.userId === scenario.accounts.technician.uid);
  expect(operations).toHaveLength(1); expect(operations[0].result).toEqual(accepted);
  const visitNote = `${scenario.prefix} Synthetic arrival evidence; no real service visit.`;
  const visit = await page.request.post(scenario.functionUrl('rlJobVisit'), { headers: { authorization }, data: { data: { action: 'record', evidenceVersion: 1,
    jobId: scenario.ids.jobId, operationId: randomUUID(), type: 'arrived', note: visitNote, occurredAt: new Date().toISOString(),
    expectedVersion: accepted.version, expectedAssignee: scenario.accounts.technician.membershipId } } });
  expect(visit.ok()).toBe(true); expect((await visit.json()).result.status).toBe('synced');
  saved = await scenario.read('jobs', scenario.ids.jobId);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:[?#]|$)/);
  await signIn(page, scenario.accounts.manager);
  await page.goto('/dispatch'); await page.getByLabel('Service date', { exact: true }).fill(scenario.jobDate);
  await page.getByRole('button', { name: `${scenario.customerName} · ${scenario.jobTitle}`, exact: true }).click();
  const dialog = page.getByRole('dialog');
  const observations = dialog.getByRole('region', { name: 'Work notes', exact: true });
  const instructions = dialog.getByRole('region', { name: 'Job instructions', exact: true });
  expect(await observations.locator('p').textContent()).toBe(workNotes);
  expect(await instructions.locator('p').textContent()).toBe(scenario.jobInstructions);
  await expect(observations.getByText(scenario.jobInstructions, { exact: true })).toHaveCount(0);
  await expect(instructions.getByText(workNotes, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.getByRole('button', { name: `${scenario.customerName} · ${scenario.jobTitle}`, exact: true }).click();
  expect(await dialog.getByRole('region', { name: 'Work notes', exact: true }).locator('p').textContent()).toBe(workNotes);
  await expect(dialog.getByRole('region', { name: 'Visit record', exact: true }).getByText(visitNote, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.goto('/jobs');
  const openJobsDetails = page.getByRole('button', { name: `View job details for ${scenario.customerName} · ${scenario.jobTitle}`, exact: true });
  await expect(openJobsDetails).toBeVisible(); await openJobsDetails.click();
  const jobsDialog = page.getByRole('dialog', { name: 'Job Details', exact: true });
  await expect(jobsDialog).toBeVisible();
  expect(await jobsDialog.getByRole('region', { name: 'Work notes', exact: true }).locator('p').textContent()).toBe(workNotes);
  expect(await jobsDialog.getByRole('region', { name: 'Job instructions', exact: true }).locator('p').textContent()).toBe(scenario.jobInstructions);
  await expect(jobsDialog.getByRole('region', { name: 'Visit record', exact: true }).getByText(visitNote, { exact: true })).toBeVisible();
  await jobsDialog.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(jobsDialog).toHaveCount(0); await openJobsDetails.click();
  expect(await jobsDialog.getByRole('region', { name: 'Work notes', exact: true }).locator('p').textContent()).toBe(workNotes);
  await expect(jobsDialog.getByRole('region', { name: 'Visit record', exact: true }).getByText(visitNote, { exact: true })).toBeVisible();
  expect(await scenario.read('jobs', scenario.ids.jobId)).toEqual(saved);
  expect(await scenario.read('jobs', scenario.ids.foreignJobId)).toEqual(foreign);
});

test('PW-OPS-22 technician request reaches dispatch and manager resolution preserves the appointment', async ({ page, scenario }) => {
  annotate('DSP-003', 'SEC-002', 'SEC-003');
  const original = await scenario.read('jobs', scenario.ids.jobId), foreign = await scenario.read('jobs', scenario.ids.foreignJobId);
  await signIn(page, scenario.accounts.technician);
  const readRequest = page.waitForRequest(request => request.url().includes('/rlReadWorkspace') && request.method() === 'POST');
  await page.goto('/my-work');
  const authorization = await (await readRequest).headerValue('authorization');
  expect(Boolean(authorization?.startsWith('Bearer '))).toBe(true);
  const endpoint = scenario.functionUrl('rlJobException');
  expect(new URL(endpoint).origin).toBe('http://127.0.0.1:5001');
  const payload = { action: 'request', jobId: scenario.ids.jobId, operationId: randomUUID(), expectedVersion: original.updatedAt, reason: 'vehicle', notes: 'Synthetic vehicle issue; management review only.' };
  const response = await page.request.post(endpoint, { headers: { authorization }, data: { data: payload } });
  expect(response.ok()).toBe(true);
  const requested = await response.json(); expect(requested.result.request.status).toBe('pending');
  const replay = await page.request.post(endpoint, { headers: { authorization }, data: { data: payload } });
  expect(replay.ok()).toBe(true); expect((await replay.json()).result.replayed).toBe(true);
  const afterRequest = await scenario.read('jobs', scenario.ids.jobId);
  for (const field of ['status', 'assignedTo', 'updatedAt', 'date', 'time']) expect(afterRequest[field]).toEqual(original[field]);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:[?#]|$)/);
  await signIn(page, scenario.accounts.manager);
  await page.goto('/dispatch'); await page.getByLabel('Service date', { exact: true }).fill(scenario.jobDate);
  await page.getByRole('button', { name: 'Reassignment requested (1)', exact: true }).click();
  await page.getByRole('button', { name: `${scenario.customerName} · ${scenario.jobTitle}`, exact: true }).click();
  const review = page.getByRole('region', { name: 'Operational exception review', exact: true });
  await expect(review.getByText('Vehicle problem', { exact: true })).toBeVisible();
  await expect(review.getByText(payload.notes, { exact: true })).toBeVisible();
  await review.getByRole('textbox', { name: 'Reassignment resolution explanation', exact: true }).fill('Synthetic review: current assignment retained.');
  await review.getByRole('button', { name: 'Resolve request', exact: true }).click();
  await expect(review.getByText('Reassignment request resolved. The assignment is unchanged.', { exact: true })).toBeVisible();
  const after = await scenario.read('jobs', scenario.ids.jobId);
  expect(after.reassignmentRequest).toBeNull();
  for (const field of ['status', 'assignedTo', 'updatedAt', 'date', 'time']) expect(after[field]).toEqual(original[field]);
  const requests = (await scenario.list('rlJobExceptions')).filter(row => row.companyId === scenario.ids.companyId && row.jobId === scenario.ids.jobId);
  expect(requests).toHaveLength(1); expect(requests[0].status).toBe('resolved');
  expect(await scenario.read('jobs', scenario.ids.foreignJobId)).toEqual(foreign);
});
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
  const option = scope.getByRole('listbox').getByRole('option', { name });
  await expect(option).toHaveCount(1);
  await option.click();
}

test('PW-UI-01 @smoke dropdowns use green searchable options and preserve keyboard, empty and nested-label selection',async({page,scenario})=>{
  await signIn(page,scenario.accounts.owner);await page.goto('/jobs');
  const status=page.getByRole('combobox',{name:'Job status filter',exact:true});await expect(status).toBeVisible();
  await selectValue(status,'completed');await expectSelectValue(status,'completed');
  const options=await selectOptions(status),selected=options.filter({has:page.locator('span').filter({hasText:/^Completed$/})});
  await expect(selected).toHaveAttribute('aria-selected','true');await selected.hover();
  await expect.poll(()=>selected.evaluate(element=>{const[r,g,b]=getComputedStyle(element).backgroundColor.match(/[\d.]+/g).map(Number);return g>r&&g>b;})).toBe(true);
  await status.press('ArrowDown');await status.press('Escape');await expectSelectValue(status,'completed');await expect(status).toHaveValue('Completed');
  await status.click();await status.fill('no-such-status-option');await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(0);await status.press('Escape');await expectSelectValue(status,'completed');
  await expect(page.locator('select')).toHaveCount(0);
  await page.getByRole('button',{name:'New Job',exact:true}).click();const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Schedule New Job',exact:true})});
  const customer=form.getByRole('combobox',{name:'Customer',exact:true});await expect(customer).toHaveAttribute('aria-required','true');
  expect(await customer.evaluate(element=>element.validity.valid)).toBe(false);
  const priority=form.getByRole('combobox',{name:'Priority',exact:true});await selectValue(priority,'high');await expectSelectValue(priority,'high');await expect(priority).toHaveValue('High');
  const repeat=form.getByRole('combobox',{name:'Appointment type',exact:true});await selectValue(repeat,'recurring');await expectSelectValue(repeat,'recurring');
  await expect(form.getByRole('listbox')).toHaveCount(0);await expect(form.getByRole('combobox',{name:'Repeat frequency',exact:true})).toBeVisible();
});

test('PW-SYNC-01 @smoke an authorized field completion refreshes Jobs counts without reload or losing a scheduling draft',async({page,browser,scenario})=>{
  test.setTimeout(90000);
  await signIn(page,scenario.accounts.owner);await page.goto('/jobs');
  const statistic=name=>page.locator('dl').filter({has:page.locator('dt').filter({hasText:new RegExp(`^${name}$`)})}).locator('dd');
  await expect(statistic('Scheduled')).toHaveText('1');await expect(statistic('Completed')).toHaveText('1');
  await page.getByRole('button',{name:'New Job',exact:true}).click();
  const form=page.locator('form').filter({has:page.getByRole('heading',{name:'Schedule New Job',exact:true})});
  const draft=form.getByPlaceholder('Gate code, pets, areas of concern…',{exact:true});await draft.fill('Keep this unsaved dispatch instruction');
  let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  // A second browser context is a separate signed-in field session. Its actual
  // UI submits the ordinary authorized job-operation callable, without mocks.
  const fieldContext=await browser.newContext({baseURL:'http://127.0.0.1:4173',serviceWorkers:'block'});
  try{
    const field=await fieldContext.newPage();await signIn(field,scenario.accounts.technician);await field.goto('/my-work');
    await field.getByLabel('Service date',{exact:true}).fill(scenario.jobDate);
    await field.getByRole('button').filter({has:field.getByText(scenario.jobTitle,{exact:true})}).click();
    await field.getByRole('textbox',{name:'Work notes',exact:true}).fill('Synthetic field completion for automatic refresh acceptance');
    await field.getByRole('button',{name:'Complete job',exact:true}).click();
    await expect.poll(async()=>(await scenario.read('jobs',scenario.ids.jobId)).status).toBe('completed');
    // Returning focus must immediately refresh authorized reads; the periodic
    // observer is the fallback. Neither path remounts the open scheduling form.
    await page.bringToFront();await expect(statistic('Completed')).toHaveText('2',{timeout:45000});await expect(statistic('Scheduled')).toHaveText('0');
    await expect(draft).toHaveValue('Keep this unsaved dispatch instruction');await expect(form).toBeVisible();expect(navigations).toBe(0);
    expect(await scenario.read('jobs',scenario.ids.foreignJobId)).toMatchObject({companyId:scenario.ids.otherCompanyId,status:'scheduled'});
  }finally{await fieldContext.close();}
});

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
  await expect(page.getByRole('alert')).toContainText('Explicit Route Logistics platform administrator access is required.');
  await expect(page.getByRole('button', { name: /Create FAQ|New FAQ|Publish/i })).toHaveCount(0);
});

test('PW-OPS-03 @smoke manager can dispatch and manage invoices within the company', async ({ page, scenario }) => {
  annotate('SEC-002', 'DSP-003');
  await signIn(page, scenario.accounts.manager);
  await page.goto('/dispatch');
  await expect(page.getByRole('heading', { name: 'Dispatch Board', exact: true })).toBeVisible();
  await page.getByLabel('Service date', { exact: true }).fill(scenario.jobDate);
  await expect(page.getByRole('button', { name: `${scenario.customerName} · ${scenario.jobTitle}`, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Invoices', exact: true })).toBeVisible();
  await page.goto('/invoices');
  await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New manual invoice', exact: true })).toBeVisible();
  const companyInvoice = page.getByRole('row').filter({ hasText: scenario.invoiceNumber });
  await expect(companyInvoice).toBeVisible();
  await expect(companyInvoice).toContainText(scenario.customerName);
});

test('PW-OPS-04 @smoke technician sees only assigned work and cannot open customer administration', async ({ page, scenario }) => {
  annotate('SEC-002', 'SEC-003', 'DSP-002');
  const foreignJob = await scenario.read('jobs', scenario.ids.foreignJobId);
  const assignedBefore = await scenario.read('jobs', scenario.ids.jobId);
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
  const instructions = page.getByRole('region', { name: 'Job instructions', exact: true });
  await expect(instructions.getByRole('heading', { name: 'Job instructions', exact: true })).toBeVisible();
  expect(await instructions.locator('p').textContent()).toBe(scenario.jobInstructions);
  await expect(instructions.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Work notes', exact: true })).toHaveValue(scenario.workNotes);
  await expect(page.getByText(scenario.jobPrivateNotes)).toHaveCount(0);
  await page.getByRole('button', { name: 'Close job', exact: true }).click();
  await expect(instructions).toHaveCount(0);
  await assigned.click();
  await expect(page.getByRole('button', { name: 'Close job', exact: true })).toBeVisible();
  await expect(instructions).toBeVisible();
  expect(await instructions.locator('p').textContent()).toBe(scenario.jobInstructions);
  await expect(page.getByRole('textbox', { name: 'Work notes', exact: true })).toHaveValue(scenario.workNotes);
  await expect(page.getByText(scenario.jobPrivateNotes)).toHaveCount(0);
  expect(await scenario.read('jobs', scenario.ids.jobId)).toEqual(assignedBefore);
  await page.goto('/customers');
  // CI's Functions emulator can still be resolving the signed-in workspace
  // after a full navigation. Require the denied state, never a blank page.
  await expect(page.getByRole('heading', { name: 'Access unavailable', exact: true })).toBeVisible({ timeout: 30_000 });
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
  // The existing fixture deliberately shares this service address. New customer
  // creation now requires an explicit separate-contact decision instead of
  // silently duplicating an existing contact at that location.
  const duplicates = editor.getByRole('region', { name: 'Possible duplicate customers', exact: true });
  await expect(duplicates).toBeVisible();
  await duplicates.getByLabel('Create an intentionally separate customer', { exact: true }).check();
  await duplicates.getByLabel('Separate customer record reason', { exact: true }).fill('Authorized synthetic browser contact at a shared test property.');
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
  await expectSelectValue(card.getByLabel(`Assign ${scenario.customerName}`, { exact: true }), '');
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
  await expectSelectValue(assignment, scenario.accounts.technician.membershipId);
  await selectValue(assignment, '');
  await expect.poll(async () => (await scenario.read('jobs', scenario.ids.jobId)).assignedTo).toBeFalsy();
  await expect(assignment).toBeEnabled();
  await selectValue(assignment, scenario.accounts.technician.membershipId);
  await expect.poll(async () => (await scenario.read('jobs', scenario.ids.jobId)).assignedTo).toBe(scenario.accounts.technician.membershipId);
  await page.reload();
  await page.getByLabel('Service date', { exact: true }).fill(scenario.jobDate);
  await expectSelectValue(assignment, scenario.accounts.technician.membershipId);
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
  await selectValue(page.getByRole('combobox', { name: 'Company customer', exact: true }), scenario.ids.customerId);
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
  const row = page.getByRole('row').filter({ hasText: scenario.invoiceNumber });
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

test('PW-OPS-21 saved address warnings stay open for correction or Done without creating duplicate jobs',async({page,scenario})=>{
  test.setTimeout(90000);annotate('DSP-002','CRM-002','DEF-ADDRESS-WARNING');
  await signIn(page,scenario.accounts.owner);
  const service=`Warned address correction ${scenario.ids.companyId}`,keepService=`Keep warned address ${scenario.ids.companyId}`;
  const entered='Address pending';
  const jobForm=()=>page.locator('form').filter({has:page.getByLabel('Service property address',{exact:true})});
  const savedJobs=async title=>(await scenario.list('jobs')).filter(job=>job.serviceType===title);
  await openAddressJob(page,scenario,service);let form=jobForm();
  const customerBefore=await scenario.read('customers',scenario.ids.customerId);
  await form.getByRole('button',{name:'Enable Editing',exact:true}).click();
  // Safe incomplete text fails server-side shape validation before Google ADC
  // or a paid Maps API request. The corrected address uses the fixture's exact
  // tenant-private canonical cache entry; provider transports remain disabled.
  await form.getByLabel('Service property address',{exact:true}).fill(entered);
  await form.getByRole('button',{name:'Schedule Job',exact:true}).click();
  let warning=form.getByRole('status',{name:'Saved job address warning',exact:true});
  await expect(warning).toBeVisible();await expect(warning).toContainText('Job saved. Review the address if needed.');
  await expect(form.getByRole('heading',{name:'Edit Job',exact:true})).toBeVisible();
  await expect(form.getByRole('button',{name:'Save Changes',exact:true})).toBeDisabled();
  const initiallySaved=await savedJobs(service);expect(initiallySaved).toHaveLength(1);const id=initiallySaved[0].id;
  expect(initiallySaved[0]).toMatchObject({companyId:scenario.ids.companyId,customerId:scenario.ids.customerId,address:entered,status:'scheduled',serviceProperty:{address:entered,validated:false,source:'operator-entered'},serviceAreaEligibility:{status:'address-unverified',eligible:false}});
  await form.getByRole('button',{name:'Edit address',exact:true}).click();
  await form.getByLabel('Service property address',{exact:true}).fill(insideAddress(scenario));
  await form.getByRole('button',{name:'Save Changes',exact:true}).click();await expect(form).toHaveCount(0);
  const corrected=await savedJobs(service);expect(corrected).toHaveLength(1);expect(corrected[0].id).toBe(id);
  expect(corrected[0]).toMatchObject({address:insideAddress(scenario),serviceProperty:{address:insideAddress(scenario),validated:true},serviceAreaEligibility:{status:'inside',eligible:true}});
  expect(corrected[0].updatedAt).not.toBe(initiallySaved[0].updatedAt);
  await expect(page.getByRole('row').filter({hasText:service})).toBeVisible();
  // Exercise the separate Done choice: this leaves the explicitly saved job
  // in place, with its unverified status, and does not ask to discard it.
  await openAddressJob(page,scenario,keepService);form=jobForm();
  await form.getByRole('button',{name:'Enable Editing',exact:true}).click();
  await form.getByLabel('Service property address',{exact:true}).fill(entered);
  await form.getByRole('button',{name:'Schedule Job',exact:true}).click();
  warning=form.getByRole('status',{name:'Saved job address warning',exact:true});await expect(warning).toBeVisible();
  const beforeDone=await savedJobs(keepService);expect(beforeDone).toHaveLength(1);
  await form.getByRole('button',{name:'Done',exact:true}).click();await expect(form).toHaveCount(0);
  await expect(page.getByRole('dialog',{name:'Leave without saving?',exact:true})).toHaveCount(0);
  const afterDone=await savedJobs(keepService);expect(afterDone).toHaveLength(1);expect(afterDone[0].id).toBe(beforeDone[0].id);
  expect(afterDone[0]).toMatchObject({address:entered,status:'scheduled',serviceProperty:{validated:false},serviceAreaEligibility:{status:'address-unverified',eligible:false}});
  await expect(page.getByRole('row').filter({hasText:keepService})).toBeVisible();
  const customerAfter=await scenario.read('customers',scenario.ids.customerId);
  for(const key of ['companyId','userId','name','email','phone','address','city','state','zipCode'])expect(customerAfter[key],`${key} changed without permanent address approval`).toEqual(customerBefore[key]);
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
  await selectValue(form.getByRole('combobox', { name: 'Appointment type', exact: true }), 'recurring');
  await selectValue(form.getByRole('combobox', { name: 'Repeat frequency', exact: true }), 'weekly');
  await expect(form.getByText('Every Thursday', { exact: true })).toBeVisible();
  await selectValue(form.getByRole('combobox', { name: 'Recurring technician fallback', exact: true }), 'auto');
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

test('PW-OPS-19 scheduling resolves profile names and selects the correct same-name staff member by email', async ({ page, scenario }) => {
  annotate('DSP-002', 'DSP-003');
  const sharedName = 'Shared Synthetic Technician';
  const first = await scenario.setSchedulingIdentity('technician', { name: sharedName });
  const selected = await scenario.setSchedulingIdentity('manager', { name: sharedName });
  const originalJob = await scenario.read('jobs', scenario.ids.jobId);
  for (const staff of [first, selected]) {
    expect(await scenario.read('teamMembers', staff.membershipId)).toMatchObject({
      companyId: scenario.ids.companyId, uid: staff.uid, email: staff.email, name: null, displayName: null, fullName: null, firstName: null, lastName: null, status: 'active',
    });
    expect(await scenario.read('users', staff.uid)).toMatchObject({ companyId: scenario.ids.companyId, name: sharedName });
  }
  await signIn(page, scenario.accounts.owner);
  const service = `Identifiable staff browser visit ${scenario.ids.companyId}`;
  const form = await openAddressJob(page, scenario, service);
  await checkProperty(form, insideAddress(scenario), 'Property is inside coverage');
  const picker = form.getByRole('combobox', { name: 'Assigned technician', exact: true });
  await expect(picker).toBeEnabled();
  await picker.click();
  await picker.fill(sharedName);
  const choices = form.getByRole('listbox');
  const firstLabel = `${sharedName} · ${first.email}`, selectedLabel = `${sharedName} · ${selected.email}`;
  await expect(choices.getByRole('option')).toHaveCount(2);
  await expect(choices.getByRole('option', { name: firstLabel, exact: true })).toBeVisible();
  await expect(choices.getByRole('option', { name: selectedLabel, exact: true })).toBeVisible();
  // Searching a unique email must distinguish otherwise identical profile names.
  await picker.fill(selected.email);
  await expect(choices.getByRole('option')).toHaveCount(1);
  await expect(choices.getByRole('option', { name: firstLabel, exact: true })).toHaveCount(0);
  await choices.getByRole('option', { name: selectedLabel, exact: true }).click();
  await expect(picker).toHaveValue(selectedLabel);
  await expect(form.getByText('Available for this appointment', { exact: true })).toBeVisible();
  await form.getByRole('button', { name: 'Schedule Job', exact: true }).click();
  await expect(page.getByText('Job scheduled', { exact: true })).toBeVisible();
  await expect(form).toHaveCount(0);
  const visits = (await scenario.list('jobs')).filter(job => job.serviceType === service);
  expect(visits).toHaveLength(1);
  expect(visits[0]).toMatchObject({ companyId: scenario.ids.companyId, assignedTo: selected.membershipId, assignedToUid: selected.uid, assignedToName: sharedName });
  expect(visits[0].assignedTo).not.toBe(first.membershipId);
  expect(await scenario.read('jobs', scenario.ids.jobId)).toEqual(originalJob);
  await page.reload();
  const row = page.getByRole('row').filter({ has: page.getByText(service, { exact: true }) });
  await row.getByRole('button', { name: 'Edit Job', exact: true }).click();
  const edit = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Edit Job', exact: true }) });
  await expect(edit.getByRole('combobox', { name: 'Assigned technician', exact: true })).toHaveValue(selectedLabel);
});

test('PW-OPS-20 owner marks staff office-only without changing existing work and restores field assignment explicitly', async ({ page, scenario }) => {
  annotate('DSP-002', 'DSP-003', 'SEC-003');
  const staff = scenario.accounts.technician;
  const membershipBefore = await scenario.read('teamMembers', staff.membershipId);
  const profileBefore = await scenario.read('users', staff.uid);
  const originalJob = await scenario.read('jobs', scenario.ids.jobId);
  const savedAvailability = async () => (await scenario.list('rlStaffAvailability')).find(row => row.companyId === scenario.ids.companyId && row.userId === staff.uid);
  const teamRow = () => page.getByRole('listitem').filter({ has: page.getByText('Synthetic technician', { exact: true }) });
  await signIn(page, scenario.accounts.owner);

  async function saveFieldWork(enabled) {
    await page.goto('/team-locations');
    const row = teamRow();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Field work settings', exact: true }).click();
    const settings = row.getByRole('group', { name: 'Field work for Synthetic technician', exact: true });
    const checkbox = settings.getByRole('checkbox', { name: 'Can be assigned field work', exact: true });
    if (enabled) await expect(checkbox).not.toBeChecked();
    else await expect(checkbox).toBeChecked();
    await expect(settings.getByRole('button', { name: 'Save field work setting', exact: true })).toBeDisabled();
    await checkbox.setChecked(enabled);
    const savedResponse = page.waitForResponse(response => response.url().includes('/rlManageStaffAvailability') && response.request().method() === 'POST');
    await settings.getByRole('button', { name: 'Save field work setting', exact: true }).click();
    const response = await savedResponse;
    expect(response.ok()).toBe(true);
    await expect(row.getByText(enabled ? 'Field work assignments enabled.' : 'Staff member marked office-only.', { exact: true })).toBeVisible();
    await expect.poll(async () => (await savedAvailability())?.fieldWorkEnabled).toBe(enabled);
    return response;
  }

  const disabledResponse = await saveFieldWork(false);
  await expect(teamRow()).toBeVisible();
  await expect(teamRow().getByText('Office only', { exact: true })).toBeVisible();
  expect(await scenario.read('teamMembers', staff.membershipId)).toEqual(membershipBefore);
  expect(await scenario.read('users', staff.uid)).toEqual(profileBefore);
  expect(await scenario.read('jobs', scenario.ids.jobId)).toEqual(originalJob);

  await page.goto('/jobs');
  await page.getByRole('button', { name: 'New Job', exact: true }).click();
  const emptyForm = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Schedule New Job', exact: true }) });
  const picker = emptyForm.getByRole('combobox', { name: 'Assigned technician', exact: true });
  await expect(picker).toBeEnabled();
  await picker.click();
  await picker.fill(staff.email);
  await expect(emptyForm.getByRole('listbox').getByRole('option')).toHaveCount(0);
  await expect(emptyForm.getByRole('listbox').getByText('No matches found.', { exact: true })).toBeVisible();
  await picker.press('Escape');
  // Searching an unselected option does not dirty the appointment.
  await emptyForm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(emptyForm).toHaveCount(0);

  // Reuse this synthetic owner's real callable authorization without exposing
  // it. This request bypasses only the picker, not backend authorization.
  const authorization = await disabledResponse.request().headerValue('authorization');
  expect(Boolean(authorization?.startsWith('Bearer '))).toBe(true);
  const endpoint = scenario.functionUrl('rlManageJob');
  expect(new URL(endpoint).origin).toBe('http://127.0.0.1:5001');
  expect(new URL(endpoint).pathname).toBe('/demo-routelogistics/us-central1/rlManageJob');
  const forgedService = `Rejected office-only assignment ${scenario.ids.companyId}`;
  const rejected = await page.request.post(endpoint, {
    headers: { authorization },
    data: { data: { action: 'create', job: {
      customerId: scenario.ids.customerId, customerName: scenario.customerName,
      serviceType: forgedService, date: laterDate(), time: '10:45', estimatedDuration: 1,
      assignedTo: staff.membershipId, address: insideAddress(scenario),
      serviceProperty: { address: insideAddress(scenario) }, serviceCategory: 'Pest Control', totalCost: 0,
    } } },
  });
  expect(rejected.ok()).toBe(false);
  const failure = (await rejected.json()).error;
  expect(failure).toMatchObject({ status: 'FAILED_PRECONDITION', details: { scheduling: { available: false } } });
  expect(failure.message).toContain('office-only');
  expect((await scenario.list('jobs')).filter(job => job.serviceType === forgedService)).toHaveLength(0);
  expect(await scenario.read('jobs', scenario.ids.jobId)).toEqual(originalJob);

  await saveFieldWork(true);
  await expect(teamRow().getByText('Office only', { exact: true })).toHaveCount(0);
  const service = `Restored field assignment ${scenario.ids.companyId}`;
  const restored = await openAddressJob(page, scenario, service);
  await checkProperty(restored, insideAddress(scenario), 'Property is inside coverage');
  await chooseTechnician(restored);
  await expect(restored.getByRole('combobox', { name: 'Assigned technician', exact: true })).toHaveValue(`Synthetic technician · ${staff.email}`);
  await expect(restored.getByText('Available for this appointment', { exact: true })).toBeVisible();
  await restored.getByRole('button', { name: 'Schedule Job', exact: true }).click();
  await expect(page.getByText('Job scheduled', { exact: true })).toBeVisible();
  const visits = (await scenario.list('jobs')).filter(job => job.serviceType === service);
  expect(visits).toHaveLength(1);
  expect(visits[0]).toMatchObject({ companyId: scenario.ids.companyId, assignedTo: staff.membershipId, assignedToUid: staff.uid });
  expect(await scenario.read('teamMembers', staff.membershipId)).toEqual(membershipBefore);
  expect(await scenario.read('users', staff.uid)).toEqual(profileBefore);
  expect(await scenario.read('jobs', scenario.ids.jobId)).toEqual(originalJob);
});

test.describe('Temporary staff availability', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  const technicianRow = page => page.getByRole('listitem').filter({ has: page.getByText('Synthetic technician', { exact: true }) });
  const savedAvailability = async scenario => (await scenario.list('rlStaffAvailability')).find(row => row.companyId === scenario.ids.companyId && row.userId === scenario.accounts.technician.uid);
  const operationalRows = async (scenario, collection) => (await scenario.list(collection)).filter(row => row.companyId === scenario.ids.companyId && (row.userId === scenario.accounts.technician.uid || row.uid === scenario.accounts.technician.uid || row.memberId === scenario.accounts.technician.membershipId));

  async function savePeriod(page, scenario, { date, reason, start, end, revision }) {
    const row = technicianRow(page);
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Change availability', exact: true }).click();
    await selectValue(row.getByRole('combobox', { name: 'Temporary staff status', exact: true }), reason);
    await row.getByLabel('Availability from date', { exact: true }).fill(date);
    await chooseTime(row, 'From time', start);
    await row.getByLabel('Availability until date', { exact: true }).fill(date);
    await chooseTime(row, 'Until time', end);
    await row.getByRole('button', { name: 'Save availability', exact: true }).click();
    await expect(row.getByText('Staff availability saved.', { exact: true })).toBeVisible();
    await expect.poll(async () => (await savedAvailability(scenario))?.revision).toBe(revision);
    await expect(row.getByRole('button', { name: 'Change availability', exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Change availability', exact: true })).toBeEnabled();
    await expect(row.getByRole('button', { name: 'Change availability', exact: true })).toHaveAttribute('data-availability-revision', String(revision));
  }

  test('PW-OPS-17 manager sick-leave override blocks scheduling without altering membership or existing appointments', async ({ page, scenario }) => {
    annotate('DSP-009', 'SEC-003', 'MOB-DUAL-AVAIL');
    const membershipBefore = await scenario.read('teamMembers', scenario.accounts.technician.membershipId);
    const originalJob = await scenario.read('jobs', scenario.ids.jobId);
    const locationBefore = await operationalRows(scenario, 'rlLocations');
    const shiftBefore = await operationalRows(scenario, 'rlWorkShifts');
    const date = laterDate();
    await signIn(page, scenario.accounts.manager);
    await page.goto('/team-locations');
    await expect(page.getByRole('heading', { name: 'Team shifts and locations', exact: true })).toBeVisible();
    await savePeriod(page, scenario, { date, reason: 'sick', start: '09:00', end: '17:00', revision: 1 });
    expect((await savedAvailability(scenario)).periods).toEqual([expect.objectContaining({ status: 'unavailable', reason: 'sick' })]);

    const service = `Sick-leave blocked browser visit ${scenario.ids.companyId}`;
    const form = await openAddressJob(page, scenario, service);
    await form.locator('input[type="date"]').fill(date);
    await checkProperty(form, insideAddress(scenario), 'Property is inside coverage');
    await chooseTechnician(form);
    const availability = form.getByRole('region', { name: 'Technician availability', exact: true });
    await expect(availability.getByText('This appointment needs another time or technician', { exact: true })).toBeVisible();
    await expect(availability.getByRole('listitem').filter({ hasText: 'Staff unavailable' })).toBeVisible();
    const rejectedSave = page.waitForResponse(response => response.url().includes('/rlManageJob') && response.request().method() === 'POST');
    await form.getByRole('button', { name: 'Schedule Job', exact: true }).click();
    const rejected = await rejectedSave;
    expect(rejected.ok()).toBe(false);
    expect((await rejected.json()).error).toMatchObject({ status: 'FAILED_PRECONDITION', details: { scheduling: { available: false } } });
    await expect(form).toBeVisible();
    expect((await scenario.list('jobs')).filter(job => job.serviceType === service)).toHaveLength(0);
    expect(await scenario.read('jobs', scenario.ids.jobId)).toEqual(originalJob);
    expect(await scenario.read('teamMembers', scenario.accounts.technician.membershipId)).toEqual(membershipBefore);
    expect(await operationalRows(scenario, 'rlLocations')).toEqual(locationBefore);
    expect(await operationalRows(scenario, 'rlWorkShifts')).toEqual(shiftBefore);
  });

  test('PW-OPS-18 owner emergency window permits a free appointment while the surrounding vacation remains blocked', async ({ page, scenario }) => {
    annotate('DSP-003', 'DSP-009', 'SEC-003', 'MOB-DUAL-AVAIL');
    const membershipBefore = await scenario.read('teamMembers', scenario.accounts.technician.membershipId);
    const originalJob = await scenario.read('jobs', scenario.ids.jobId);
    const locationBefore = await operationalRows(scenario, 'rlLocations');
    const shiftBefore = await operationalRows(scenario, 'rlWorkShifts');
    const date = laterDate();
    await signIn(page, scenario.accounts.owner);
    await page.goto('/team-locations');
    await savePeriod(page, scenario, { date, reason: 'vacation', start: '09:00', end: '17:00', revision: 1 });
    await savePeriod(page, scenario, { date, reason: 'emergency', start: '10:00', end: '12:00', revision: 2 });
    const periods = (await savedAvailability(scenario)).periods;
    expect(periods.map(({ status, reason }) => ({ status, reason }))).toEqual([{ status: 'unavailable', reason: 'vacation' }, { status: 'available', reason: 'emergency' }]);
    expect(periods[1].endsAt).not.toBe(periods[0].endsAt);

    const service = `Emergency-window browser visit ${scenario.ids.companyId}`;
    const form = await openAddressJob(page, scenario, service);
    await form.locator('input[type="date"]').fill(date);
    await checkProperty(form, insideAddress(scenario), 'Property is inside coverage');
    await chooseTechnician(form);
    await expect(form.getByText('Available for this appointment', { exact: true })).toBeVisible();
    await form.getByRole('button', { name: 'Schedule Job', exact: true }).click();
    await expect(page.getByText('Job scheduled', { exact: true })).toBeVisible();
    const visits = (await scenario.list('jobs')).filter(job => job.serviceType === service);
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ date, time: '10:45', assignedTo: scenario.accounts.technician.membershipId, assignedToUid: scenario.accounts.technician.uid });

    const outside = await openAddressJob(page, scenario, `Outside emergency window ${scenario.ids.companyId}`);
    await outside.locator('input[type="date"]').fill(date);
    await chooseTime(outside, 'Start time', '12:15');
    await chooseTechnician(outside);
    const unavailable = outside.getByRole('region', { name: 'Technician availability', exact: true });
    await expect(unavailable.getByText('This appointment needs another time or technician', { exact: true })).toBeVisible();
    await expect(unavailable.getByRole('listitem').filter({ hasText: 'Staff unavailable' })).toBeVisible();
    expect((await scenario.list('jobs')).filter(job => job.serviceType === `Outside emergency window ${scenario.ids.companyId}`)).toHaveLength(0);
    expect(await scenario.read('teamMembers', scenario.accounts.technician.membershipId)).toEqual(membershipBefore);
    expect(await scenario.read('jobs', scenario.ids.jobId)).toEqual(originalJob);
    expect(await operationalRows(scenario, 'rlLocations')).toEqual(locationBefore);
    expect(await operationalRows(scenario, 'rlWorkShifts')).toEqual(shiftBefore);
  });
});
