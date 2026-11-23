const { test, expect, signIn } = require('./support/fixtures');

test('PW-ONBOARD-01 @onboarding public owner registration verifies, resumes and activates exactly one company', async ({ page, scenario }) => {
  const email = `${scenario.prefix}-new-owner@example.test`;
  const password = 'Onboarding!123';
  const companyName = `${scenario.prefix} New Company`;
  const authorizationLink = await scenario.authorizeCompanyRegistration(email);

  await page.goto(authorizationLink);
  await expect(page).toHaveURL(/\/login/);

  await page.goto('/');
  await expect(page.getByRole('link', { name: /Log in/i, exact: true }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Add Your Company', exact: true }).first().click();
  await expect(page).toHaveURL(/\/signup\?intent=company$/);
  await page.getByLabel('Your name').fill('Synthetic New Owner');
  await page.getByLabel('Company name').fill(companyName);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Verify your email to continue' })).toBeVisible();

  const uid = await scenario.verifyAccount(email);
  await page.getByRole('button', { name: 'Refresh access' }).click();
  await expect(page.getByRole('heading', { name: 'Set up your workspace' })).toBeVisible();
  await expect(page.getByLabel('Company name *')).toHaveValue(companyName);
  await page.getByLabel('Company phone').fill('(202) 555-0199');
  await page.getByRole('button', { name: 'Save & continue' }).click();
  await expect(page.getByRole('heading', { name: 'Owner account & email verification' })).toBeVisible();

  await page.getByRole('button', { name: 'Save & sign out' }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fonboarding$/);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Owner account & email verification' })).toBeVisible();
  await page.getByRole('button', { name: 'Save & continue' }).click();
  await expect(page.getByRole('heading', { name: /Invite managers and technicians/ })).toBeVisible();
  await page.getByRole('button', { name: 'Save & continue' }).click();
  await page.getByLabel('Service name').fill('Synthetic inspection');
  await page.getByRole('button', { name: 'Add service' }).click();
  await page.getByRole('button', { name: 'Save & continue' }).click();
  await expect(page.getByRole('heading', { name: 'Business hours' })).toBeVisible();
  await page.getByRole('button', { name: 'Save & continue' }).click();
  await expect(page.getByRole('heading', { name: /Import customers/ })).toBeVisible();
  await page.getByRole('button', { name: 'Save & continue' }).click();
  await expect(page.getByLabel('Workside authorization code')).toHaveValue(/^[A-Za-z0-9_-]{43}$/);
  await page.getByRole('button', { name: 'Activate company' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4173/');
  await expect(page.getByText(companyName).first()).toBeVisible();

  const owned = (await scenario.list('companies')).filter(row => row.ownerId === uid);
  expect(owned).toHaveLength(1);
  expect(owned[0].businessName).toBe(companyName);
  expect(owned[0].services).toEqual(['Synthetic inspection']);
});

test('PW-ONBOARD-02 @onboarding existing owner reviews an explicit section while manager access remains denied', async ({ page, scenario }) => {
  const customerBefore = await scenario.read('customers', scenario.ids.customerId);
  const memberBefore = await scenario.read('teamMembers', scenario.accounts.technician.membershipId);
  await signIn(page, scenario.accounts.owner);
  await page.goto('/company-setup');
  await page.getByRole('link', { name: 'Review Company Setup' }).click();
  await expect(page.getByRole('heading', { name: 'Review Company Setup' })).toBeVisible();
  const phone = page.getByLabel('Company phone');
  await expect(phone).toHaveValue('(202) 555-0101');
  await phone.fill('+12025550199');
  await page.getByRole('button', { name: 'Save company information' }).click();
  await expect(page.getByRole('status')).toContainText('saved successfully');
  await expect(page.getByRole('button', { name: 'Save company information' })).toBeDisabled();
  expect(await scenario.read('customers', scenario.ids.customerId)).toEqual(customerBefore);
  expect(await scenario.read('teamMembers', scenario.accounts.technician.membershipId)).toEqual(memberBefore);

  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page.getByRole('textbox', { name: 'Email address', exact: true })).toBeVisible();
  await signIn(page, scenario.accounts.manager);
  await page.goto('/company-setup/review');
  await expect(page.getByRole('alert')).toContainText('Only the company owner or an administrator');
});
