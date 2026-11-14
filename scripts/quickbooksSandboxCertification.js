// Operator-only certification. Importing this module never opens credentials or
// performs network requests. Deployed accounting-write flags are never changed.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomBytes } = require('node:crypto');
const { quickBooksHandlers, mappingId } = require('../functions/quickbooks');
const { hash } = require('../functions/security');
const { createQuickBooksSandboxTransport, COMPANY_ID, REALM_ID, COMPANY_NAME } = require('./lib/quickbooksSandboxTransport');
const PROJECT = 'mi-factotum-field-service';
const REQUIRED_LEGACY_FUNCTIONS = [
  'initiateQuickBooksOAuth', 'handleQuickBooksOAuthCallback', 'disconnectQuickBooks', 'getQuickBooksConnectionStatus',
  'syncCustomerToQuickBooks', 'syncServicesToQuickBooks', 'quickbooksWebhook', 'scheduledCustomerSync',
  'createCustomerProfileOnSignup', 'onJobAssignment', 'syncJobToCustomerPortal', 'syncInvoiceToCustomerPortal',
  'generateRecurringJobs', 'cleanupExpiredJobPhotos', 'cleanupOldLocations', 'syncCustomersToProfiles',
];
const REQUIRED_LEGACY_SCHEDULES = ['scheduledCustomerSync', 'generateRecurringJobs', 'cleanupExpiredJobPhotos', 'cleanupOldLocations'].map(name => `projects/${PROJECT}/locations/us-central1/jobs/firebase-schedule-${name}-us-central1`);
const ROOT = path.resolve(__dirname, '..');
const functionRequire = createRequire(path.join(ROOT, 'functions/package.json'));
const fail = message => { throw Object.assign(new Error(message), { safeMessage: message }); };
const timestampVersion = value => {
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/);
  if (!match || !Number.isFinite(Date.parse(match[1] + 'Z'))) fail('An original customer timestamp is invalid.');
  return `${Date.parse(match[1] + 'Z') / 1000}.${(match[2] || '').padEnd(9, '0')}`;
};

function validateRetirementArtifact(value, now = Date.now()) {
  if (value?.project !== PROJECT || value?.realmId !== REALM_ID || value?.legacyConsumersDisabled !== true || !Number.isFinite(Date.parse(value?.verifiedAt)) || Date.parse(value.verifiedAt) > now + 10000 || now - Date.parse(value.verifiedAt) > 15 * 60000) fail('A fresh verified legacy-retirement artifact for this sandbox is required.');
  if (!Array.isArray(value.retiredFunctions) || !REQUIRED_LEGACY_FUNCTIONS.every(name => value.retiredFunctions.includes(name)) || value.retiredFunctions.some(name => typeof name !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,100}$/.test(name) || name.startsWith('rl')) || value.legacyRequiredFunctions !== undefined && (!Array.isArray(value.legacyRequiredFunctions) || value.legacyRequiredFunctions.some(name => !value.retiredFunctions.includes(name)))) fail('The retired function list must include all 16 known legacy import, trigger, OAuth and scheduler dependencies and must exclude Route Logistics functions.');
  const prefix = `projects/${PROJECT}/locations/us-central1/jobs/`;
  if (!Array.isArray(value.pausedSchedules) || !REQUIRED_LEGACY_SCHEDULES.every(name => value.pausedSchedules.includes(name)) || value.pausedSchedules.some(name => typeof name !== 'string' || !name.startsWith(prefix) || !/^[a-zA-Z0-9_-]+$/.test(name.slice(prefix.length)) || name.includes('rlQuickBooks'))) fail('The retired legacy schedule list must include all four known legacy schedules.');
  return value;
}

function parseArguments(values) {
  const args = { mode: 'plan', runId: randomBytes(4).toString('hex'), retirement: path.join(ROOT, '.migration/legacy-retirement-verification.json') };
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (value === '--run' || value === '--plan') args.mode = value.slice(2);
    else if (['--run-id', '--retirement', '--tax-fixture'].includes(value)) {
      if (!values[index + 1] || values[index + 1].startsWith('--')) fail('A CLI option is missing its value.');
      args[value === '--run-id' ? 'runId' : value === '--retirement' ? 'retirement' : 'taxFixture'] = values[++index];
    } else fail('Unsupported certification option. Use --plan or --run with --run-id and --retirement.');
  }
  if (!/^[a-f0-9]{6,8}$/.test(args.runId)) fail('The run ID must contain 6 to 8 lowercase hexadecimal characters.');
  return args;
}

async function runCertification(args) {
  if (!['plan', 'run'].includes(args?.mode) || !/^[a-f0-9]{6,8}$/.test(args?.runId || '')) fail('Use a validated plan/run mode and a bounded hexadecimal run ID.');
  delete process.env.DEBUG;
  delete process.env.GRPC_TRACE;
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROJECT) fail('The operator runner requires the exact existing Firebase production project, without emulator overrides.');
  const retirement = validateRetirementArtifact(JSON.parse(fs.readFileSync(path.resolve(args.retirement), 'utf8')));
  const auth = require('../node_modules/firebase-tools/lib/auth');
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) fail('An authenticated Firebase CLI operator is required.');
  const token = (await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])).access_token;
  const googleRequest = async (url, { allow404 = false } = {}) => {
    const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(30000), redirect: 'error' });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) fail('Google metadata access failed with HTTP ' + response.status + '. No response payload was logged.');
    return response.json();
  };
  for (const name of retirement.retiredFunctions) if (await googleRequest(`https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/us-central1/functions/${name}`, { allow404: true })) fail('A legacy function listed as retired still exists: ' + name + '.');
  for (const name of retirement.pausedSchedules) {
    const schedule = await googleRequest(`https://cloudscheduler.googleapis.com/v1/${name}?fields=name,state`);
    if (!['PAUSED', 'DISABLED'].includes(schedule.state)) fail('A legacy schedule remains active.');
  }
  for (const name of ['rlQuickBooksSync', 'rlQuickBooksWebhook', 'rlQuickBooksProcessEvents']) {
    const data = await googleRequest(`https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/us-central1/functions/${name}?fields=state,serviceConfig(environmentVariables)`);
    const env = data.serviceConfig?.environmentVariables || {};
    if (data.state !== 'ACTIVE' || env.RL_QB_ENABLED !== 'true' || env.RL_QB_ENV !== 'sandbox' || env.RL_QB_CREDENTIAL_ENV !== 'sandbox' || env.RL_QB_WRITES_ENABLED !== 'false' || env.RL_QB_PRODUCTION_APPROVED !== 'false') fail('Deployed Route Logistics QuickBooks safety configuration does not match the approved sandbox configuration.');
  }
  const rlSchedule = await googleRequest(`https://cloudscheduler.googleapis.com/v1/projects/${PROJECT}/locations/us-central1/jobs/firebase-schedule-rlQuickBooksProcessEvents-us-central1?fields=name,state`);
  if (rlSchedule.state !== 'PAUSED') fail('Pause the Route Logistics accounting event scheduler before this controlled run.');
  const { Firestore } = functionRequire('@google-cloud/firestore');
  // Match google-gax's authentication dependency. google-auth-library 10 uses
  // Headers objects; this installed gax version expects v9 plain header maps.
  const gaxRequire = createRequire(functionRequire.resolve('google-gax'));
  const { OAuth2Client, GoogleAuth } = gaxRequire('google-auth-library');
  const authClient = new OAuth2Client();
  authClient.setCredentials({ access_token: token, expiry_date: Date.now() + 45 * 60000 });
  const db = new Firestore({ projectId: PROJECT, auth: new GoogleAuth({ projectId: PROJECT, authClient }), preferRest: true });
  const reportPath = path.join(ROOT, `.migration/qb-live-${args.runId}${args.mode === 'plan' ? '-plan' : ''}.json`);
  if (args.mode === 'run' && fs.existsSync(reportPath)) fail('This run ID already has an audit report. Review it before using a new run ID; existing fixtures will not be overwritten.');
  const report = { runId: args.runId, project: PROJECT, companyId: COMPANY_ID, realmId: REALM_ID, mode: args.mode, startedAt: new Date().toISOString(), stage: 'preflight', accountingWritesEnabledGlobally: false, productionApproved: false, genuineProviderWebhookCertified: false, providerCalls: [], fixtures: {}, results: {} };
  const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const gate = createQuickBooksSandboxTransport({ companyId: COMPANY_ID, realmId: REALM_ID, runId: args.runId, expiresAt: Date.now() + 15 * 60000, maxWrites: 12, audit: async entry => { report.providerCalls.push({ ...entry, at: new Date().toISOString() }); save(); } });
  let handlers, initialConnection, ownerId;
  try {
    const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, '.migration/qb-certification-preflight.json'), 'utf8'));
    if (baseline.project !== PROJECT || baseline.companyId !== COMPANY_ID || baseline.originalCustomers?.length !== 507) fail('The original 507-customer version snapshot is required.');
    const customerSnapshot = async () => {
      const rows = await db.collection('customers').where('companyId', '==', COMPANY_ID).select().get();
      return new Map(rows.docs.map(doc => [doc.ref.path, `${doc.updateTime.seconds}.${String(doc.updateTime.nanoseconds).padStart(9, '0')}`]));
    };
    const originalVersions = baseline.originalCustomers.map(row => ({ path: row.name.split('/documents/')[1], updateTime: timestampVersion(row.updateTime) }));
    const originalsIntact = rows => originalVersions.every(row => rows.get(row.path) === row.updateTime);
    if (!originalsIntact(await customerSnapshot())) fail('An original customer version differs from the approved baseline. Review before creating fixtures.');
    const company = await db.doc(`companies/${COMPANY_ID}`).get();
    ownerId = company.get('ownerId');
    if (!company.exists || typeof ownerId !== 'string' || !ownerId) fail('The Acme company owner could not be verified.');
    const connectionRef = db.doc(`rlQuickBooksConnections/${mappingId(COMPANY_ID, 'sandbox', 'connection', 'current')}`);
    initialConnection = (await connectionRef.get()).data();
    if (!initialConnection?.connected || initialConnection.companyId !== COMPANY_ID || initialConnection.environment !== 'sandbox' || initialConnection.credentialEnvironment !== 'sandbox' || initialConnection.realmId !== REALM_ID) fail('The existing Acme sandbox OAuth connection does not match this certification scope.');
    report.connectionId = initialConnection.connectionId;
    report.operatorIdentity = 'Current company owner evaluated through the existing handler; this is not a browser sign-in test.';
    report.results.originalCustomersBefore = 507;
    const pending = await db.collection('rlQbWebhookEvents').where('status', '==', 'pending').where('environment', '==', 'sandbox').get();
    if (!pending.empty) fail('Existing pending sandbox webhook events require review before a controlled event-drain run.');
    const secret = async name => {
      const data = await googleRequest(`https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/${name}/versions/latest:access`);
      if (!data.payload?.data) fail('A required QuickBooks platform secret is unavailable.');
      return Buffer.from(data.payload.data, 'base64').toString('utf8');
    };
    const clientId = await secret('RL_QB_CLIENT_ID'), clientSecret = await secret('RL_QB_CLIENT_SECRET');
    let loseFirstCustomerResponse = args.mode === 'run';
    const transport = async (url, options) => {
      const response = await gate.transport(url, options);
      if (loseFirstCustomerResponse && options.method === 'POST' && new URL(url).pathname.endsWith('/customer') && response.ok) {
        loseFirstCustomerResponse = false;
        report.results.customerAcceptedResponseDeliberatelyLost = true;
        save();
        throw Object.assign(new Error('Controlled accepted-response loss.'), { code: 'certification-response-loss' });
      }
      return response;
    };
    const config = { enabled: () => true, environment: () => 'sandbox', credentialEnvironment: () => 'sandbox', productionApproved: () => false, writesEnabled: gate.writesEnabled, clientId: () => clientId, clientSecret: () => clientSecret };
    handlers = quickBooksHandlers(db, config, transport);
    const request = data => ({ auth: { uid: ownerId, token: { companyId: COMPANY_ID, role: 'owner', email_verified: true } }, data });
    // Normal token refresh, if necessary, happens before arming the capability.
    const current = await handlers.connection(COMPANY_ID);
    if (current.accessExpiresAt < Date.now() + 10 * 60000) fail('The sandbox token needs a normal refresh before a 10-minute controlled run.');
    const info = (await handlers.api(COMPANY_ID, 'companyinfo/' + REALM_ID)).CompanyInfo;
    const preferences = (await handlers.api(COMPANY_ID, 'preferences')).Preferences;
    if (info?.CompanyName?.trim() !== COMPANY_NAME || info.Country !== 'US' || preferences?.CurrencyPrefs?.HomeCurrency?.value !== 'USD') fail('Intuit company identity, country or currency does not match the approved sandbox.');
    const selectedItemId = current.defaultItemId, selectedAccountId = current.incomeAccountId;
    const item = (await handlers.api(COMPANY_ID, 'item/' + selectedItemId)).Item;
    const account = (await handlers.api(COMPANY_ID, 'account/' + item?.IncomeAccountRef?.value)).Account;
    if (!/^\d+$/.test(selectedItemId || '') || item?.Id !== selectedItemId || item.Active !== true || item.Type !== 'Service' || account?.Active !== true || !['Income', 'Other Income'].includes(account.AccountType)) fail('The saved service default or its income account is no longer valid.');
    report.identity = { name: info.CompanyName, country: info.Country, currency: 'USD', developmentCredentialsAccepted: true };
    report.accountingDefaults = { itemId: selectedItemId, accountId: selectedAccountId, itemIncomeAccountId: item.IncomeAccountRef.value, activeService: true, activeIncomeAccount: true };
    report.results.readOnlyPreflight = 'PASS';
    if (args.mode === 'plan') { report.stage = 'planned-no-fixtures'; return report; }
    gate.arm({ companyId: COMPANY_ID, realmId: REALM_ID, companyName: info.CompanyName, environment: 'sandbox', credentialEnvironment: 'sandbox', legacyConsumersAbsent: true });
    const fixtureBase = `rl-cert-${args.runId}`;
    const customerId = `${fixtureBase}-customer`, serviceId = `${fixtureBase}-service`, invoiceId = `${fixtureBase}-invoice`, taxableInvoiceId = `${fixtureBase}-tax-invoice`;
    const marker = { companyId: COMPANY_ID, source: 'routelogistics-certification', certificationRunId: args.runId, createdAt: new Date() };
    const today = new Date().toISOString().slice(0, 10), due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    report.stage = 'fixture-creation';
    report.fixtures = { customerId, serviceId, invoiceId, ...(args.taxFixture ? { taxableInvoiceId } : {}) };
    save();
    const batch = db.batch();
    batch.create(db.doc(`customers/${customerId}`), { ...marker, name: gate.labelPrefix + ' synthetic customer', email: `rl-cert-${args.runId}@example.invalid`, phone: '+15555550100' });
    batch.create(db.doc(`estimateTemplates/${serviceId}`), { ...marker, name: gate.labelPrefix + ' existing service mapping' });
    const invoiceFixture = { ...marker, customerId, status: 'sent', total: 20, tax: 0, taxRate: 0, taxTreatment: 'non-taxable', currency: 'USD', issueDate: today, dueDate: due, notes: gate.labelPrefix + ' synthetic non-taxable invoice; no email or payment processing.', lineItems: [{ description: gate.labelPrefix + ' synthetic service', templateId: serviceId, quantity: 2, unitPrice: 10, amount: 20 }] };
    batch.create(db.doc(`invoices/${invoiceId}`), invoiceFixture);
    if (args.taxFixture) {
      const metadata = JSON.parse(fs.readFileSync(path.resolve(args.taxFixture), 'utf8'));
      const code = metadata.taxCodes?.find(value => value.Id === '2'), rate = metadata.taxRates?.find(value => value.Id === '3');
      if (metadata.companyId !== COMPANY_ID || metadata.realmId !== REALM_ID || metadata.country !== 'US' || metadata.taxPrefs?.UsingSalesTax !== true || metadata.taxPrefs?.PartnerTaxEnabled === true || !code?.Active || code.SalesTaxRateList?.TaxRateDetail?.length !== 1 || code.SalesTaxRateList.TaxRateDetail[0].TaxRateRef?.value !== '3' || rate?.Active !== true || rate.RateValue !== 8) fail('The reviewed 8% sandbox tax fixture metadata does not match this tenant and realm.');
      // The default-item fallback is exercised independently of the service map.
      batch.create(db.doc(`invoices/${taxableInvoiceId}`), { ...invoiceFixture, total: 21.6, tax: 1.6, taxRate: 8, taxTreatment: 'taxable', qbTaxMapping: { companyId: COMPANY_ID, environment: 'sandbox', realmId: REALM_ID, taxCodeId: '2' }, notes: gate.labelPrefix + ' synthetic taxable invoice; no email or payment processing.', lineItems: [{ description: gate.labelPrefix + ' synthetic taxable service', quantity: 2, unitPrice: 10, amount: 20 }] });
    }
    await batch.commit();
    report.results.syntheticFixturesCreated = true;
    report.stage = 'customer-export-and-retry';
    const customerPreview = await handlers.preview(request({ type: 'Customer', localId: customerId }));
    let firstFailed = false;
    try { await handlers.sync(request({ type: 'Customer', localId: customerId, fingerprint: customerPreview.fingerprint })); }
    catch (error) { if (error.code !== 'unavailable' || !report.results.customerAcceptedResponseDeliberatelyLost) throw error; firstFailed = true; }
    if (!firstFailed) fail('The controlled lost-response retry did not exercise its intended failure.');
    const exportedCustomer = await handlers.sync(request({ type: 'Customer', localId: customerId, fingerprint: customerPreview.fingerprint }));
    const repeatedCustomer = await handlers.sync(request({ type: 'Customer', localId: customerId, fingerprint: customerPreview.fingerprint }));
    if (exportedCustomer.remoteId !== repeatedCustomer.remoteId) fail('Customer idempotency returned inconsistent mappings.');
    const remoteCustomer = (await handlers.api(COMPANY_ID, 'customer/' + exportedCustomer.remoteId)).Customer;
    if (remoteCustomer.DisplayName !== gate.labelPrefix + ' synthetic customer' || remoteCustomer.PrimaryEmailAddr?.Address !== `rl-cert-${args.runId}@example.invalid`) fail('The exported synthetic customer contact data does not match.');
    report.fixtures.remoteCustomerId = exportedCustomer.remoteId;
    report.results.customerExport = 'PASS';
    report.results.acceptedResponseRetry = 'PASS';
    report.results.customerDuplicatePrevention = 'PASS';
    const matchingCustomers = (await handlers.api(COMPANY_ID, `query?query=${encodeURIComponent("SELECT * FROM Customer WHERE DisplayName = '" + remoteCustomer.DisplayName + "'")}`)).QueryResponse?.Customer || [];
    if (matchingCustomers.length !== 1 || matchingCustomers[0].Id !== exportedCustomer.remoteId) fail('The synthetic customer query did not confirm exactly one matching provider record.');
    report.results.providerCustomerCount = 1;
    save();
    report.stage = 'service-adoption';
    await handlers.adopt(request({ type: 'Item', localId: serviceId, remoteId: selectedItemId }));
    const serviceMap = await db.doc(`rlQbMappings/${mappingId(COMPANY_ID, 'sandbox', 'Item', serviceId)}`).get();
    if (serviceMap.get('remoteId') !== selectedItemId || serviceMap.get('realmId') !== REALM_ID) fail('The synthetic service mapping was not stored for this tenant and realm.');
    report.results.existingServiceMapping = 'PASS';
    report.stage = 'invoice-export';
    const invoicePreview = await handlers.preview(request({ type: 'Invoice', localId: invoiceId }));
    const exportedInvoice = await handlers.sync(request({ type: 'Invoice', localId: invoiceId, fingerprint: invoicePreview.fingerprint }));
    const repeatedInvoice = await handlers.sync(request({ type: 'Invoice', localId: invoiceId, fingerprint: invoicePreview.fingerprint }));
    const remoteInvoice = (await handlers.api(COMPANY_ID, 'invoice/' + exportedInvoice.remoteId)).Invoice;
    if (exportedInvoice.remoteId !== repeatedInvoice.remoteId || Number(remoteInvoice.TotalAmt) !== 20 || Number(remoteInvoice.Balance) !== 20 || remoteInvoice.CustomerRef?.value !== exportedCustomer.remoteId || remoteInvoice.TxnDate !== today || remoteInvoice.DueDate !== due || remoteInvoice.Line?.filter(line => line.DetailType === 'SalesItemLineDetail').some(line => line.SalesItemLineDetail?.ItemRef?.value !== selectedItemId)) fail('The sandbox invoice total, dates, customer or item does not match.');
    report.fixtures.remoteInvoiceId = exportedInvoice.remoteId;
    report.results.invoiceExport = 'PASS';
    report.results.invoiceDuplicatePrevention = 'PASS';
    report.results.nonTaxableInvoice = { status: 'PASS', subtotal: 20, total: Number(remoteInvoice.TotalAmt), tax: Number(remoteInvoice.TxnTaxDetail?.TotalTax || 0), currency: remoteInvoice.CurrencyRef?.value || 'USD' };
    if (args.taxFixture) {
      report.stage = 'taxable-invoice-export';
      const taxPreview = await handlers.preview(request({ type: 'Invoice', localId: taxableInvoiceId }));
      const exportedTaxInvoice = await handlers.sync(request({ type: 'Invoice', localId: taxableInvoiceId, fingerprint: taxPreview.fingerprint }));
      report.fixtures.remoteTaxableInvoiceId = exportedTaxInvoice.remoteId;
      save();
      const taxInvoice = (await handlers.api(COMPANY_ID, 'invoice/' + exportedTaxInvoice.remoteId)).Invoice;
      if (Math.abs(Number(taxInvoice.TotalAmt) - 21.6) > 0.001 || Math.abs(Number(taxInvoice.TxnTaxDetail?.TotalTax) - 1.6) > 0.001 || taxInvoice.TxnTaxDetail?.TxnTaxCodeRef?.value !== '2' || taxInvoice.CustomerRef?.value !== exportedCustomer.remoteId || taxInvoice.Line?.filter(line => line.DetailType === 'SalesItemLineDetail').some(line => line.SalesItemLineDetail?.ItemRef?.value !== selectedItemId || line.SalesItemLineDetail?.TaxCodeRef?.value !== 'TAX')) fail('The actual sandbox taxable invoice does not match the reviewed tax code, tax amount, total, customer or default service.');
      await handlers.reconcile(request({ localId: taxableInvoiceId }));
      const localTaxInvoice = await db.doc(`invoices/${taxableInvoiceId}`).get();
      if (localTaxInvoice.get('status') !== 'sent' || localTaxInvoice.get('qbTestPaymentStatus') !== 'open' || Math.abs(localTaxInvoice.get('qbTestBalance') - 21.6) > 0.001) fail('The taxable invoice did not reconcile to a test-only open balance.');
      report.results.taxableInvoice = { status: 'PASS', subtotal: 20, tax: Number(taxInvoice.TxnTaxDetail.TotalTax), total: Number(taxInvoice.TotalAmt), taxCodeId: '2', taxRateId: '3', taxRate: 8, defaultServiceFallback: 'PASS' };
    }
    save();
    const allowedRemoteIds = new Set([exportedCustomer.remoteId, selectedItemId, exportedInvoice.remoteId, ...(report.fixtures.remoteTaxableInvoiceId ? [report.fixtures.remoteTaxableInvoiceId] : [])]);
    const assertNoUnrelatedEvents = async () => {
      const rows = await db.collection('rlQbWebhookEvents').where('status', '==', 'pending').where('environment', '==', 'sandbox').get();
      if (rows.docs.some(row => row.get('companyId') !== COMPANY_ID || row.get('realmId') !== REALM_ID || !allowedRemoteIds.has(row.get('remoteId')))) fail('An unrelated pending webhook event appeared. No global drain was run.');
    };
    const paymentResults = [];
    for (const [index, amount] of [5, 15].entries()) {
      report.stage = index ? 'full-payment-reconciliation' : 'partial-payment-reconciliation';
      const paymentBody = { CustomerRef: { value: exportedCustomer.remoteId }, CurrencyRef: { value: 'USD' }, TotalAmt: amount, TxnDate: today, PaymentRefNum: gate.labelPrefix + '-P' + (index + 1), ProcessPayment: false, Line: [{ Amount: amount, LinkedTxn: [{ TxnId: exportedInvoice.remoteId, TxnType: 'Invoice' }] }] };
      const requestId = hash(`${args.runId}:payment:${index}`).slice(0, 48);
      const payment = (await handlers.api(COMPANY_ID, 'payment', paymentBody, requestId)).Payment;
      if (!payment || !/^\d+$/.test(String(payment.Id)) || Number(payment.TotalAmt) !== amount || payment.CustomerRef?.value !== exportedCustomer.remoteId || payment.TxnDate !== today) fail('The sandbox payment receipt does not match the controlled request.');
      allowedRemoteIds.add(String(payment.Id));
      report.fixtures[index ? 'remoteFullPaymentId' : 'remotePartialPaymentId'] = String(payment.Id);
      save();
      const repeatedPayment = (await handlers.api(COMPANY_ID, 'payment', paymentBody, requestId)).Payment;
      if (String(repeatedPayment?.Id) !== String(payment.Id)) fail('Replaying the same sandbox payment request created a different payment.');
      // This marked operator event exercises real provider Payment reconciliation.
      // It is not represented as a genuine signed Intuit notification.
      const eventRef = db.doc(`rlQbWebhookEvents/${hash(`operator-certification:${args.runId}:${payment.Id}`)}`);
      await eventRef.create({ companyId: COMPANY_ID, environment: 'sandbox', realmId: REALM_ID, connectionId: current.connectionId, type: 'Payment', remoteId: String(payment.Id), operation: 'Create', status: 'pending', attempts: 0, nextAttempt: 0, createdAt: new Date(), origin: 'operator-sandbox-certification', certificationRunId: args.runId });
      await assertNoUnrelatedEvents();
      await handlers.drain();
      const event = await eventRef.get(), invoice = await db.doc(`invoices/${invoiceId}`).get();
      const expectedBalance = index ? 0 : 15, expectedPaid = index ? 20 : 5, expectedStatus = index ? 'paid' : 'partial';
      if (event.get('status') !== 'reconciled' || invoice.get('status') !== 'sent' || invoice.get('qbTestPaymentStatus') !== expectedStatus || invoice.get('qbTestBalance') !== expectedBalance || invoice.get('qbTestAmountPaid') !== expectedPaid) fail('The synthetic invoice did not reconcile to the expected test-only payment status.');
      const map = await db.doc(`rlQbPaymentMappings/${hash(`${COMPANY_ID}:sandbox:${REALM_ID}:${payment.Id}`)}`).get();
      if (map.get('amount') !== amount || map.get('txnDate') !== today || map.get('currency') !== 'USD' || map.get('remoteCustomerId') !== exportedCustomer.remoteId || !map.get('invoiceIds')?.includes(invoiceId)) fail('The payment mapping amount, date, customer or local invoice was not preserved.');
      const beforeDuplicate = invoice.updateTime;
      await handlers.drain();
      await handlers.reconcile(request({ localId: invoiceId }));
      const afterDuplicate = await db.doc(`invoices/${invoiceId}`).get();
      if (!beforeDuplicate.isEqual(afterDuplicate.updateTime)) fail('Repeated reconciliation unexpectedly changed the synthetic invoice.');
      paymentResults.push({ id: String(payment.Id), amount, date: today, testPaymentStatus: expectedStatus, balance: expectedBalance, actualInvoiceStatus: afterDuplicate.get('status'), duplicateProviderRequest: 'PASS', duplicateReconciliation: 'PASS' });
      save();
    }
    report.results.payments = paymentResults;
    if (!args.taxFixture) report.results.taxableInvoice = 'NOT_RUN: explicit tax configuration is required.';
    const finalConnection = (await connectionRef.get()).data();
    report.results.originalCustomersUnchanged = originalsIntact(await customerSnapshot());
    report.results.connectionPreserved = finalConnection.connected === true && finalConnection.connectionId === initialConnection.connectionId && finalConnection.realmId === initialConnection.realmId && finalConnection.incomeAccountId === initialConnection.incomeAccountId && finalConnection.defaultItemId === initialConnection.defaultItemId;
    if (!report.results.originalCustomersUnchanged || !report.results.connectionPreserved) fail('Final customer or OAuth connection preservation verification failed.');
    report.stage = 'completed-base-certification';
    return report;
  } catch (error) {
    report.failedStage = report.stage;
    report.stage = 'failed';
    report.error = { code: typeof error.code === 'string' && /^[a-zA-Z0-9_.-]{1,80}$/.test(error.code) ? error.code : 'operator-certification-failed', message: error.safeMessage || 'The controlled certification stopped. Review the sanitized stage, provider HTTP statuses and retained fixture IDs before retrying.', ...(Number.isInteger(error.providerStatus) ? { providerStatus: error.providerStatus } : {}) };
    throw Object.assign(new Error(report.error.message), { safeMessage: report.error.message, certificationReport: report });
  } finally {
    await gate.disarm();
    report.gate = gate.getSummary();
    report.finishedAt = new Date().toISOString();
    save();
    await db.terminate();
  }
}

if (require.main === module) {
  Promise.resolve().then(() => runCertification(parseArguments(process.argv.slice(2)))).then(report => console.log(JSON.stringify({ runId: report.runId, stage: report.stage, results: report.results, fixtures: report.fixtures, gate: report.gate }, null, 2))).catch(error => {
    const report = error.certificationReport;
    console.error(JSON.stringify({ status: 'STOPPED', stage: report?.failedStage || 'preflight', error: error.safeMessage || 'Certification preflight failed; no raw credential or provider payload was logged.', ...(report ? { runId: report.runId, fixtures: report.fixtures, gate: report.gate } : {}) }, null, 2));
    process.exitCode = 1;
  });
}
module.exports = { validateRetirementArtifact, parseArguments, timestampVersion, runCertification, PROJECT, REQUIRED_LEGACY_FUNCTIONS, REQUIRED_LEGACY_SCHEDULES };
