const { selectValue, selectOptions } = require('./support/select');
const { createHash } = require('node:crypto');
const { test, expect, signIn, portalSignIn } = require('./support/fixtures');

// These tests use the real browser, Firebase client SDKs and local emulators.
// The shared fixture refuses production projects and reads OTPs only from the
// emulator's private mail collection. No API response is intercepted or mocked.
const hash = value => createHash('sha256').update(value).digest('hex');
const records = page => page.getByRole('region', { name: 'Selected provider records' });
const feedback = page => page.getByRole('region', { name: 'Service feedback', exact: true });
const editor = page => page.getByRole('form', { name: 'Platform content editor' });

async function selectProvider(page, companyId) {
  await selectValue(page.getByRole('combobox', { name: 'Service provider' }), `company:${companyId}`);
  await expect(records(page)).toBeVisible();
}

async function enterPortal(page, scenario) {
  await portalSignIn(page, scenario);
  await selectProvider(page, scenario.ids.companyId);
}

async function openCompletedReview(page, scenario) {
  await enterPortal(page, scenario);
  const job = await scenario.readDoc(`jobs/${scenario.ids.completedJobId}`);
  const row = feedback(page).locator('div.rounded-lg.border').filter({ has: page.getByText(job.serviceType, { exact: false }) });
  await row.getByRole('button', { name: 'Review this visit', exact: true }).click();
  const form = page.getByRole('form', { name: 'Service feedback form' });
  await expect(form).toBeVisible();
  return form;
}

async function submitReview(page, scenario, { publicConsent = false, rating = 1 } = {}) {
  const form = await openCompletedReview(page, scenario);
  await form.getByRole('radio', { name: `${rating} ${rating === 1 ? 'star' : 'stars'}`, exact: true }).check();
  await form.getByRole('radio', { name: 'No', exact: true }).check();
  await form.getByRole('textbox', { name: 'Review comments' }).fill('Synthetic acceptance feedback: the test visit did not meet expectations.');
  const consent = form.getByRole('checkbox', { name: /I separately permit public display/ });
  await expect(consent).not.toBeChecked();
  if (publicConsent) await consent.check();
  await form.getByRole('button', { name: 'Submit review', exact: true }).click();
  await expect(feedback(page).getByText('Thank you. Your review was submitted successfully.', { exact: true })).toBeVisible();
}

async function enterCms(page, scenario) {
  await signIn(page, scenario.accounts.platformAdmin);
  await page.goto('/platform-admin');
  await expect(page.getByRole('heading', { name: 'Platform content', exact: true })).toBeVisible();
  await expect(editor(page)).toBeVisible();
}

async function fillFaq(page, scenario, suffix = 'faq') {
  const slug = `pw-${scenario.ids.companyId.toLowerCase().replace(/[^a-z0-9-]/g, '')}-${suffix}`.slice(0, 95);
  const title = `How does customer portal sign-in work? ${suffix}`;
  await editor(page).getByRole('textbox', { name: 'Content title' }).fill(title);
  await editor(page).getByLabel('URL slug', { exact: true }).fill(slug);
  await editor(page).getByLabel('Answer', { exact: true }).fill('Customers use an email sign-in code to view service records shared by their authorized providers. This factual FAQ is an emulator-only acceptance record.');
  return { title, slug };
}

async function saveCms(page, message = 'Draft saved successfully.') {
  const responsePromise = page.waitForResponse(response => response.url().includes('/rlPlatformCms')
    && response.request().method() === 'POST'
    && response.request().postDataJSON()?.data?.action === 'save');
  await editor(page).getByRole('button', { name: 'Save content', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.result?.item).toBeTruthy();
  await expect(page.getByText(message, { exact: true }).first()).toBeVisible();
  await expect(editor(page).getByRole('button', { name: 'Save content', exact: true })).toBeDisabled();
  return payload.result.item;
}

test.describe('Customer portal — real Firebase emulator journeys', () => {
  test('PW-POR-01 @smoke rejects a wrong OTP, accepts the current code and signs out', async ({ page, scenario }) => {
    await page.goto('/portal');
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(scenario.customerEmail);
    await page.getByRole('button', { name: 'Email a sign-in code', exact: true }).click();
    const codeField = page.getByRole('textbox', { name: 'Six-digit code', exact: true });
    await expect(codeField).toBeVisible();
    const code = await scenario.getPortalCode();
    const wrong = code === '000000' ? '000001' : '000000';
    await codeField.fill(wrong);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Code is invalid or expired');
    await expect(page.getByRole('combobox', { name: 'Service provider' })).toHaveCount(0);
    await codeField.fill(code);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Service provider' })).toBeEnabled();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /^noindex,\s*nofollow$/);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('form', { name: 'Customer email sign-in' })).toBeVisible();
    await expect(records(page)).toHaveCount(0);
  });

  test('PW-POR-02 @smoke switches authorized providers without leaking visits and groups duplicate customers', async ({ page, scenario }) => {
    const [company, other, job, otherJob] = await Promise.all([
      scenario.readDoc(`companies/${scenario.ids.companyId}`), scenario.readDoc(`companies/${scenario.ids.otherCompanyId}`),
      scenario.readDoc(`jobs/${scenario.ids.jobId}`), scenario.readDoc(`jobs/${scenario.ids.otherJobId}`),
    ]);
    await enterPortal(page, scenario);
    const options = await selectOptions(page.getByRole('combobox', { name: 'Service provider' }));
    await expect(options).toHaveCount(2);
    await expect(records(page).getByRole('heading', { name: company.name, exact: true })).toBeVisible();
    await expect(records(page).getByText('Matching customer records have been combined for this provider.', { exact: true })).toBeVisible();
    await expect(records(page)).toContainText(job.serviceType);
    await expect(records(page)).not.toContainText(otherJob.serviceType);
    await selectProvider(page, scenario.ids.otherCompanyId);
    await expect(records(page).getByRole('heading', { name: other.name, exact: true })).toBeVisible();
    await expect(records(page)).toContainText(otherJob.serviceType);
    await expect(records(page)).not.toContainText(job.serviceType);
    await selectProvider(page, scenario.ids.companyId);
    await expect(records(page)).toContainText(job.serviceType);
  });

  test('PW-POR-03 retrieves authorized image/PDF bytes and clears the preview on provider switch', async ({ page, scenario }) => {
    await enterPortal(page, scenario);
    // The independent feedback read expands content directly above the file
    // controls. Wait for its actual ready state before a pointer click.
    await expect(feedback(page).getByRole('button', { name: 'Refresh feedback', exact: true })).toBeEnabled();
    await records(page).getByRole('button', { name: 'View photo', exact: true }).click();
    const preview = page.getByRole('region', { name: 'Shared file preview' });
    await expect(preview.getByRole('img')).toHaveAttribute('src', /^data:image\/(?:png|jpeg|webp);base64,/);
    await expect.poll(() => preview.getByRole('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await preview.getByRole('button', { name: 'Close file', exact: true }).click();
    await records(page).getByRole('button', { name: 'Open document', exact: true }).click();
    const downloadLink = preview.getByRole('link', { name: 'Download PDF document', exact: true });
    await expect(downloadLink).toHaveAttribute('href', /^data:application\/pdf;base64,/);
    const [download] = await Promise.all([page.waitForEvent('download'), downloadLink.click()]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    expect(await download.failure()).toBeNull();
    await selectProvider(page, scenario.ids.otherCompanyId);
    await expect(preview).toHaveCount(0);
    await expect(records(page).getByRole('button', { name: 'View photo', exact: true })).toHaveCount(0);
  });

  test('PW-POR-04 opens the selected tenant invoice and read-only payment history', async ({ page, scenario }) => {
    const original = await scenario.readDoc(`invoices/${scenario.ids.invoiceId}`);
    await enterPortal(page, scenario);
    // Reviews render immediately above invoices. Wait for that independent read
    // to settle so its layout expansion cannot move the summary between mouse
    // down/up. This is an explicit UI-ready condition, not a timing delay.
    await expect(feedback(page).getByRole('button', { name: 'Refresh feedback', exact: true })).toBeEnabled();
    const invoice = records(page).locator('details').filter({ has: page.locator('summary').filter({ hasText: original.invoiceNumber }) });
    await invoice.locator('summary').click();
    await expect(invoice).toHaveJSProperty('open', true);
    await expect(records(page).getByRole('heading', { name: 'Payment history', exact: true })).toBeVisible();
    await expect(records(page).getByText('No reconciled payments recorded.', { exact: true })).toBeVisible();
    await expect(records(page)).toContainText(original.lineItems[0].description);
    await records(page).getByRole('button', { name: 'Refresh history', exact: true }).click();
    await expect(records(page).getByText('No reconciled payments recorded.', { exact: true })).toBeVisible();
    const after = await scenario.readDoc(`invoices/${scenario.ids.invoiceId}`);
    // The emulator also runs the normal metadata-stamping trigger. Compare the
    // financial/tenant fields rather than treating its timestamp as a payment.
    for (const field of ['companyId', 'customerId', 'status', 'total', 'subtotal', 'tax', 'lineItems', 'amountPaid', 'testPaymentStatus']) {
      expect(after[field], `${field} changed during a read-only invoice view`).toEqual(original[field]);
    }
    await selectProvider(page, scenario.ids.otherCompanyId);
    await expect(records(page)).not.toContainText(original.invoiceNumber);
  });

  test('PW-POR-05 records honest negative feedback once and keeps synthetic reviews private', async ({ page, scenario }) => {
    await submitReview(page, scenario);
    await expect(feedback(page).getByLabel('1 out of 5 stars', { exact: true })).toBeVisible();
    await expect(feedback(page)).toContainText('On-time arrival: No');
    await expect(feedback(page)).toContainText('Synthetic test feedback');
    const original = await scenario.readReview(scenario.ids.completedJobId);
    expect(original).toMatchObject({ rating: 1, onTime: false, publicConsent: false, synthetic: true, publicStatus: 'private' });
    await feedback(page).getByRole('button', { name: 'Refresh feedback', exact: true }).click();
    await expect(feedback(page).getByLabel('1 out of 5 stars', { exact: true })).toHaveCount(1);
    await expect(feedback(page).getByRole('button', { name: 'Review this visit', exact: true })).toHaveCount(0);
    expect(await scenario.readReview(scenario.ids.completedJobId)).toEqual(original);
    const stats = await scenario.readDoc(`rlReviewStats/${hash(`company:${scenario.ids.companyId}`)}`);
    expect(stats.count).toBe(1);
  });

  test('PW-POR-06 allows independent public-display permission to be withdrawn without replacing feedback', async ({ page, scenario }) => {
    await submitReview(page, scenario, { rating: 5, publicConsent: true });
    const first = await scenario.readReview(scenario.ids.completedJobId);
    expect(first.publicConsent).toBe(true);
    expect(first.publicStatus).toBe('private');
    await feedback(page).getByRole('button', { name: 'Withdraw public-display permission', exact: true }).click();
    await expect(feedback(page).getByText('Public-display permission withdrawn. Your review remains private feedback.', { exact: true })).toBeVisible();
    const after = await scenario.readReview(scenario.ids.completedJobId);
    expect(after).toMatchObject({ rating: first.rating, comment: first.comment, onTime: first.onTime, publicConsent: false, publicStatus: 'private' });
    expect(after.publicConsentWithdrawnAt).toBeTruthy();
    await page.reload();
    await selectProvider(page, scenario.ids.companyId);
    await expect(feedback(page).getByRole('button', { name: 'Grant public-display permission', exact: true })).toBeVisible();
  });

  test('PW-POR-07 revokes a provider association before file access and removes its records on refresh', async ({ page, scenario }) => {
    const [company, job] = await Promise.all([scenario.readDoc(`companies/${scenario.ids.companyId}`), scenario.readDoc(`jobs/${scenario.ids.jobId}`)]);
    await enterPortal(page, scenario);
    await scenario.revokeAssociation(scenario.ids.companyId);
    await records(page).getByRole('button', { name: 'View photo', exact: true }).click();
    const preview = page.getByRole('region', { name: 'Shared file preview' });
    await expect(preview.getByRole('alert')).toContainText(/association is no longer available|file is not available/i);
    await expect(preview.getByRole('img')).toHaveCount(0);
    await page.getByRole('button', { name: 'Refresh visits and invoices', exact: true }).click();
    await expect(await selectOptions(page.getByRole('combobox', { name: 'Service provider' }))).toHaveCount(1);
    await expect(records(page).getByRole('heading', { name: company.name, exact: true })).toHaveCount(0);
    await expect(records(page)).not.toContainText(job.serviceType);
    await expect(preview).toHaveCount(0);
  });
});

test.describe('Platform content — genuine UI authorization and publication', () => {
  test('PW-CMS-01 requires staff sign-in for the independent platform-admin area', async ({ page }) => {
    await page.goto('/platform-admin');
    await expect(page.getByRole('heading', { name: 'Platform administration', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', /next=%2Fplatform-admin/);
    await expect(editor(page)).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /^noindex,\s*nofollow$/);
  });

  for (const role of ['owner', 'technician']) {
    test(`PW-CMS-${role === 'owner' ? '02' : '03'} denies ${role} platform privileges`, async ({ page, scenario }) => {
      await signIn(page, scenario.accounts[role]);
      await page.goto('/platform-admin');
      await expect(page.getByRole('heading', { name: 'Platform access required', exact: true })).toBeVisible();
      await expect(page.getByRole('alert')).toContainText('Explicit Route Logistics platform administrator access is required.');
      await expect(editor(page)).toHaveCount(0);
    });
  }

  test('PW-CMS-04 @smoke saves and previews a factual FAQ and protects a dirty draft', async ({ page, scenario }) => {
    await enterCms(page, scenario);
    const faq = await fillFaq(page, scenario, 'draft');
    await expect(editor(page).getByRole('button', { name: 'Save content', exact: true })).toBeEnabled();
    const saved = await saveCms(page);
    expect(await scenario.readDoc(`rlPublicContent/${saved.id}`)).toBeNull();
    await editor(page).getByRole('button', { name: 'Preview content', exact: true }).click();
    const preview = page.getByRole('region', { name: 'Private content preview' });
    await expect(preview.getByRole('heading', { name: faq.title, exact: true })).toBeVisible();
    await expect(preview).toContainText('This content is not published by previewing it.');
    await editor(page).getByRole('textbox', { name: 'Content title' }).fill(`${faq.title} edited`);
    await page.getByRole('navigation', { name: 'Content type' }).getByRole('button', { name: 'Testimonials', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Leave without saving?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(editor(page).getByRole('textbox', { name: 'Content title' })).toHaveValue(`${faq.title} edited`);
    await saveCms(page);
    await expect(page.getByRole('heading', { name: 'Content audit history', exact: true })).toBeVisible();
    await expect(page.getByText('updated · draft · Revision 2', { exact: true })).toBeVisible();
  });

  test('PW-CMS-05 @smoke publishes factual FAQ metadata and removes public access when archived', async ({ page, scenario, context }) => {
    await enterCms(page, scenario);
    const faq = await fillFaq(page, scenario, 'published');
    await editor(page).locator('summary').filter({ hasText: 'Search and sharing metadata' }).click();
    await editor(page).getByLabel('SEO title', { exact: true }).fill('Customer portal email sign-in | Route Logistics');
    await editor(page).getByLabel('Meta description', { exact: true }).fill('Customers sign in by email code and view only records shared by their authorized service providers.');
    await editor(page).getByLabel('Open Graph title', { exact: true }).fill('Customer portal sign-in');
    await selectValue(editor(page).getByRole('combobox', { name: 'Publication status', exact: true }), 'published');
    const published = await saveCms(page, 'Content published successfully.');
    expect(await scenario.readDoc(`rlPublicContent/${published.id}`)).toMatchObject({ status: 'published', slug: faq.slug });
    const sitemap = await page.request.get(scenario.functionUrl('rlPublicContent'), { params: { path: '/sitemap.xml' } });
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain(`https://route-logistics.com/faqs/${faq.slug}`);
    const rendered = await page.request.get(scenario.functionUrl('rlPublicContent'), { params: { path: `/faqs/${faq.slug}` } });
    expect(rendered.status()).toBe(200);
    expect(await rendered.text()).toContain(faq.title);
    const publicPage = await context.newPage();
    try {
      await publicPage.goto(`/faqs/${faq.slug}`);
      await expect(publicPage.getByRole('heading', { name: faq.title, exact: true })).toBeVisible();
      await expect(publicPage).toHaveTitle('Customer portal email sign-in | Route Logistics');
      await expect(publicPage.locator('meta[name="description"]')).toHaveAttribute('content', 'Customers sign in by email code and view only records shared by their authorized service providers.');
      await expect(publicPage.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://route-logistics.com/faqs/${faq.slug}`);
      await expect(publicPage.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Customer portal sign-in');
      await expect(publicPage.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
      const structured = await publicPage.locator('script[type="application/ld+json"]').textContent();
      expect(JSON.parse(structured)['@graph']).toEqual(expect.arrayContaining([expect.objectContaining({ '@type': 'FAQPage' })]));
      await selectValue(editor(page).getByRole('combobox', { name: 'Publication status', exact: true }), 'archived');
      await saveCms(page, 'Content archived. It is no longer available publicly.');
      expect(await scenario.readDoc(`rlPublicContent/${published.id}`)).toBeNull();
      const archived = await page.request.get(scenario.functionUrl('rlPublicContent'), { params: { path: `/faqs/${faq.slug}` } });
      expect(archived.status()).toBe(404);
      expect(archived.headers()['x-robots-tag']).toContain('noindex');
      const afterSitemap = await page.request.get(scenario.functionUrl('rlPublicContent'), { params: { path: '/sitemap.xml' } });
      expect(await afterSitemap.text()).not.toContain(`https://route-logistics.com/faqs/${faq.slug}`);
      await publicPage.reload();
      await expect(publicPage.getByRole('heading', { name: 'This page is not available', exact: true })).toBeVisible();
      await expect(publicPage.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
      await expect(publicPage.getByRole('heading', { name: faq.title, exact: true })).toHaveCount(0);
    } finally { await publicPage.close(); }
  });

  test('PW-CMS-06 keeps a draft image private and blocks an unverified testimonial publication', async ({ page, scenario }) => {
    await enterCms(page, scenario);
    await page.getByRole('navigation', { name: 'Content type' }).getByRole('button', { name: 'Testimonials', exact: true }).click();
    await editor(page).getByRole('textbox', { name: 'Content title' }).fill('Unpublished emulator acceptance fixture');
    await editor(page).getByLabel('URL slug', { exact: true }).fill(`pw-${scenario.ids.companyId.toLowerCase().replace(/[^a-z0-9-]/g, '')}-private-image`.slice(0, 95));
    await editor(page).getByLabel('Customer quotation', { exact: true }).fill('This is a labeled emulator-only draft for testing image handling, not a customer endorsement.');
    const saved = await saveCms(page);
    await editor(page).getByLabel('Image description (alt text)', { exact: true }).fill('One-pixel emulator image fixture');
    const uploadResponse = page.waitForResponse(response => response.url().includes('/rlPlatformContentImage')
      && response.request().method() === 'POST'
      && response.request().postDataJSON()?.data?.action === 'upload');
    await editor(page).getByLabel('Upload image', { exact: true }).setInputFiles({
      name: 'emulator-fixture.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64'),
    });
    const imagePayload = await (await uploadResponse).json();
    expect(imagePayload.result?.image?.id).toBeTruthy();
    await expect(page.getByText('Image uploaded privately. Save content to attach it; publication follows the content status.', { exact: true })).toBeVisible();
    await expect(editor(page).getByRole('img', { name: 'One-pixel emulator image fixture', exact: true })).toBeVisible();
    await saveCms(page);
    expect(await scenario.readDoc(`rlPublicContent/${saved.id}`)).toBeNull();
    const publicImage = await page.request.get(scenario.functionUrl('rlPublicContentImage'), { params: { id: imagePayload.result.image.id } });
    expect(publicImage.status()).toBe(404);
    await selectValue(editor(page).getByRole('combobox', { name: 'Publication status', exact: true }), 'published');
    await expect(page.getByText('Publishing requires authenticity confirmation, an evidence reference and the customer/company attribution above.', { exact: true })).toBeVisible();
    await expect(editor(page).getByRole('button', { name: 'Save content', exact: true })).toBeDisabled();
    await expect(page.getByRole('link', { name: 'View published page', exact: true })).toHaveCount(0);
  });
});
