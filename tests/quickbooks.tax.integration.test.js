const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const req = require('node:module').createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { quickBooksHandlers, mappingId } = require('../functions/quickbooks');
const { hash } = require('../functions/security');
let app, db, sequence = 0;
before(() => {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local Firestore emulator required; production access prohibited.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'qb-tax-tests'); db = getFirestore(app);
});
after(async () => { if (app) await deleteApp(app); });

async function fixture() {
  const companyId = `qb-tax-${++sequence}`, uid = `${companyId}-owner`, realmId = '991001', invoiceId = `${companyId}-invoice`, customerId = `${companyId}-customer`, calls = [];
  const state = { preferences: { TaxPrefs: { UsingSalesTax: true } }, country: 'US', code: { Id: '2', Active: true, Taxable: true, SalesTaxRateList: { TaxRateDetail: [{ TaxRateRef: { value: '3' }, TaxTypeApplicable: 'TaxOnAmount', TaxOrder: 0 }] } }, rate: { Id: '3', Active: true, RateValue: 8, SpecialTaxType: 'NONE' }, response: {} };
  const config = { enabled: () => true, environment: () => 'sandbox', credentialEnvironment: () => 'sandbox', productionApproved: () => false, writesEnabled: () => true, clientId: () => 'tax-fixture-client', clientSecret: () => 'tax-fixture-secret' };
  await db.doc(`companies/${companyId}`).set({ ownerId: uid });
  await db.doc(`rlQuickBooksConnections/${mappingId(companyId, 'sandbox', 'connection', 'current')}`).set({ companyId, environment: 'sandbox', realmId, credentialHash: hash('sandbox:tax-fixture-client'), connected: true, connectionId: `${companyId}-connection`, accessToken: 'tax-fixture-access', refreshToken: 'tax-fixture-refresh', accessExpiresAt: Date.now()+3600000, refreshExpiresAt: Date.now()+86400000, defaultItemId: '10' });
  await db.doc(`rlQbMappings/${mappingId(companyId, 'sandbox', 'Customer', customerId)}`).set({ companyId, environment: 'sandbox', realmId, type: 'Customer', localId: customerId, remoteId: '77', syncToken: '0' });
  const invoice = db.doc(`invoices/${invoiceId}`);
  await invoice.set({ companyId, customerId, status: 'sent', total: 21.6, tax: 1.6, taxRate: 8, taxTreatment: 'taxable', currency: 'USD', qbTaxMapping: { companyId, environment: 'sandbox', realmId, taxCodeId: '2' }, notes: ' RL-CERT-tax-test ', issueDate: '2026-11-14', dueDate: '2026-11-21', lineItems: [{ quantity: 2, unitPrice: 10, amount: 20, description: 'Synthetic taxable service' }] });
  const transport = async (url, options) => {
    const parsed = new URL(url); assert.equal(parsed.hostname, 'sandbox-quickbooks.api.intuit.com');
    assert.ok(parsed.pathname.startsWith(`/v3/company/${realmId}/`)); calls.push({ url, method: options.method, body: options.body });
    const suffix = parsed.pathname.split(`/v3/company/${realmId}/`)[1];
    let body;
    if (options.method === 'POST') {
      assert.equal(suffix, 'invoice'); const sent = JSON.parse(options.body);
      body = { Invoice: { ...sent, Id: '88', SyncToken: '0', TotalAmt: 21.6, Balance: 21.6, ...state.response } };
    } else if (suffix === `companyinfo/${realmId}`) body = { CompanyInfo: { Id: '1', CompanyName: 'Synthetic sandbox', Country: state.country } };
    else if (suffix === 'preferences') body = { Preferences: state.preferences };
    else if (suffix === 'taxcode/2') body = { TaxCode: state.code };
    else if (suffix === 'taxrate/3') body = { TaxRate: state.rate };
    else if (suffix === 'item/10') body = { Item: { Id: '10', Active: true, Type: 'Service', IncomeAccountRef: { value: '45' } } };
    else if (suffix === 'account/45') body = { Account: { Id: '45', Active: true, AccountType: 'Income' } };
    else throw Error('Unexpected tax fixture request');
    return { ok: true, json: async () => structuredClone(body) };
  };
  const handlers = quickBooksHandlers(db, config, transport), request = data => ({ auth: { uid, token: { companyId, role: 'owner', email_verified: true } }, data: { type: 'Invoice', localId: invoiceId, ...data } });
  return { companyId, realmId, invoice, state, calls, handlers, request };
}

test('mapped US manual sales tax validates realm, active code and rates and exports exact total', async () => {
  const f = await fixture(), preview = await f.handlers.preview(f.request());
  assert.deepEqual(preview.payload.TxnTaxDetail, { TxnTaxCodeRef: { value: '2' }, TotalTax: 1.6 });
  assert.equal(preview.payload.Line[0].SalesItemLineDetail.TaxCodeRef.value, 'TAX');
  assert.equal(preview.payload.PrivateNote, 'RL-CERT-tax-test'); assert.equal(preview.payload.DocNumber, undefined); assert.equal(preview.payload.GlobalTaxCalculation, undefined);
  assert.equal((await f.handlers.sync(f.request({ fingerprint: preview.fingerprint }))).remoteId, '88');
  assert.equal(f.calls.filter(row => row.method === 'POST').length, 1);
});

test('explicit non-taxable invoice exports NON and rejects contradictory tax', async () => {
  const f = await fixture(); await f.invoice.update({ tax: 0, taxRate: 0, total: 20, taxTreatment: 'non-taxable', qbTaxMapping: null });
  const preview = await f.handlers.preview(f.request()); assert.equal(preview.payload.Line[0].SalesItemLineDetail.TaxCodeRef.value, 'NON'); assert.equal(preview.payload.TxnTaxDetail, undefined);
  await f.invoice.update({ tax: 1.6, taxRate: 8, total: 21.6 }); await assert.rejects(f.handlers.preview(f.request()), /tax mapping/i);
});

test('foreign company, environment or realm tax mappings are rejected before tax API reads', async () => {
  for (const patch of [{ companyId: 'other-company' }, { environment: 'production' }, { realmId: '999999' }]) {
    const f = await fixture(); await f.invoice.update({ qbTaxMapping: { companyId: f.companyId, environment: 'sandbox', realmId: f.realmId, taxCodeId: '2', ...patch } });
    await assert.rejects(f.handlers.preview(f.request()), /tax mapping/i); assert.ok(f.calls.every(row => !row.url.includes('/taxcode/') && !row.url.includes('/taxrate/')));
  }
});

test('inactive and mismatched tax codes and rates fail closed without a provider write', async () => {
  for (const patch of [{ code: { Active: false } }, { code: { Taxable: false } }, { code: { Id: '9' } }, { rate: { Active: false } }, { rate: { RateValue: 9 } }, { rate: { EffectiveTaxRate: [{ RateValue: 8 }] } }]) {
    const f = await fixture(); if (patch.code) Object.assign(f.state.code, patch.code); if (patch.rate) Object.assign(f.state.rate, patch.rate);
    await assert.rejects(f.handlers.preview(f.request()), /tax/i); assert.equal(f.calls.filter(row => row.method === 'POST').length, 0);
  }
});

test('AST, non-US, disabled tax, compound tax and unsupported tax rates require review', async () => {
  for (const configure of [f => { f.state.preferences.TaxPrefs.PartnerTaxEnabled = true; }, f => { f.state.country = 'CA'; }, f => { f.state.preferences.TaxPrefs.UsingSalesTax = false; }, f => { f.state.code.SalesTaxRateList.TaxRateDetail[0].TaxTypeApplicable = 'TaxOnTax'; }, f => { f.state.rate.SpecialTaxType = 'ZERO_RATE'; }]) {
    const f = await fixture(); configure(f); await assert.rejects(f.handlers.preview(f.request()), /tax|US|location/i); assert.equal(f.calls.filter(row => row.method === 'POST').length, 0);
  }
});

test('tax rounding and invoice gross totals must agree before export', async () => {
  for (const patch of [{ tax: 1.61, total: 21.61 }, { total: 20 }, { taxRate: 7.5 }, { tax: '1.6' }]) {
    const f = await fixture(); await f.invoice.update(patch); await assert.rejects(f.handlers.preview(f.request()), /tax|totals/i); assert.equal(f.calls.filter(row => row.method === 'POST').length, 0);
  }
});

test('provider tax or total changes preserve an accepted invoice receipt for review', async () => {
  for (const response of [{ TotalAmt: 22 }, { TxnTaxDetail: { TotalTax: 1.7 } }, { CustomerRef: { value: '99' } }]) {
    const f = await fixture(); f.state.response = response; const preview = await f.handlers.preview(f.request());
    await assert.rejects(f.handlers.sync(f.request({ fingerprint: preview.fingerprint })), /accepted.*review/i);
    const operations = await db.collection('rlQbOperations').where('companyId', '==', f.companyId).get(); assert.equal(operations.size, 1); assert.equal(operations.docs[0].get('status'), 'review'); assert.equal(operations.docs[0].get('remoteId'), '88');
    await assert.rejects(f.handlers.sync(f.request({ fingerprint: preview.fingerprint })), /review/i); assert.equal(f.calls.filter(row => row.method === 'POST').length, 1);
  }
});
