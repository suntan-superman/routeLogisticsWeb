const COMPANY_ID = 'z7DJMjeigjG64YfN4H5h';
const REALM_ID = '9341455727000797';
const COMPANY_NAME = 'Sandbox Company_US_1';
const HOST = 'sandbox-quickbooks.api.intuit.com';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const ID = /^\d{1,30}$/;
const MONEY_LIMIT = 100;

// This capability exists only in the operator process. It never changes the
// deployed write/production flags and cannot reach a production QBO API host.
function createQuickBooksSandboxTransport({ companyId, realmId, runId, expiresAt = Date.now() + 600000, maxWrites = 8, fetchImpl = fetch, audit = async () => {} }) {
  if (companyId !== COMPANY_ID || realmId !== REALM_ID || !/^[a-zA-Z0-9-]{1,8}$/.test(runId || '') || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 900000 || !Number.isInteger(maxWrites) || maxWrites < 1 || maxWrites > 12) throw new Error('Invalid sandbox certification scope or lifetime.');
  const labelPrefix = `RL-CERT-${runId}`, customers = new Set(), invoices = new Set();
  const counts = { reads: 0, refreshes: 0, writeAttempts: 0, denied: 0 };
  let armed = false, stopped = false, verifiedBearer = null;
  const stop = () => { armed = false; stopped = true; };
  const guardError = message => Object.assign(new Error(message), { code: 'sandbox-gate' });
  const record = async (method, resource, outcome, httpStatus = null) => {
    try { await audit({ runId, method, resource, outcome, httpStatus }); }
    catch { stop(); throw guardError('Sandbox audit logging failed; write capability disabled.'); }
  };
  const deny = async (method, resource) => { stop(); counts.denied++; await record(method, resource, 'denied'); throw guardError('Sandbox certification request denied; write capability disabled.'); };
  const writesEnabled = () => {
    if (Date.now() >= expiresAt) stop();
    return armed && !stopped && counts.writeAttempts < maxWrites;
  };
  const numericId = value => typeof value === 'string' && ID.test(value);
  const syntheticEmail = value => typeof value === 'string' && /^[^\s@]+@example\.invalid$/i.test(value);
  const tagged = value => typeof value === 'string' && (value === labelPrefix || value.startsWith(labelPrefix + '-') || value.startsWith(labelPrefix + ' '));
  const customerMatches = value => value && numericId(String(value.Id || '')) && tagged(value.DisplayName) && syntheticEmail(value.PrimaryEmailAddr?.Address);
  const invoiceMatches = value => value && numericId(String(value.Id || '')) && tagged(value.DocNumber) && customers.has(String(value.CustomerRef?.value));
  const observe = async (response, resource, authorization) => {
    if (!response.ok) return;
    let data;
    try { data = await response.clone().json(); } catch { return; }
    if (resource === 'companyinfo' && typeof data?.CompanyInfo?.CompanyName === 'string' && data.CompanyInfo.CompanyName.trim() === COMPANY_NAME && numericId(String(data.CompanyInfo.Id || ''))) verifiedBearer = authorization;
    for (const customer of [data?.Customer, ...(Array.isArray(data?.QueryResponse?.Customer) ? data.QueryResponse.Customer : [])]) if (customerMatches(customer)) customers.add(String(customer.Id));
    for (const invoice of [data?.Invoice, ...(Array.isArray(data?.QueryResponse?.Invoice) ? data.QueryResponse.Invoice : [])]) if (invoiceMatches(invoice)) invoices.add(String(invoice.Id));
  };
  const validMoney = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MONEY_LIMIT;
  const currencyIsUsd = body => !body.CurrencyRef || body.CurrencyRef.value === 'USD';
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
  const forbiddenMoneyProcessing = body => ['CreditCardPayment', 'CreditCardPaymentInfo', 'CheckPayment', 'BankAccountRef', 'ACHInfo', 'PaymentMethodRef', 'CreditCard', 'BankAccount', 'CCPaymentTxn', 'Token'].some(key => key in body);
  const validBody = (resource, body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body) || forbiddenMoneyProcessing(body) || !currencyIsUsd(body)) return false;
    if (resource === 'customer') return (!body.Id || customers.has(String(body.Id))) && tagged(body.DisplayName) && syntheticEmail(body.PrimaryEmailAddr?.Address);
    if (resource === 'invoice') {
      if (body.Id && !invoices.has(String(body.Id)) || !customers.has(String(body.CustomerRef?.value)) || !tagged(body.DocNumber) || body.DocNumber.length > 21 || !validDate(body.TxnDate) || !validDate(body.DueDate) || !Array.isArray(body.Line) || !body.Line.length || body.Line.length > 10 || body.EmailStatus === 'NeedToSend' || body.AllowOnlineCreditCardPayment === true || body.AllowOnlineACHPayment === true) return false;
      let sum = 0;
      for (const line of body.Line) {
        const detail = line.SalesItemLineDetail;
        if (line.DetailType !== 'SalesItemLineDetail' || !validMoney(line.Amount) || !detail || !ID.test(String(detail.ItemRef?.value || '')) || typeof detail.Qty !== 'number' || !Number.isFinite(detail.Qty) || detail.Qty <= 0 || typeof detail.UnitPrice !== 'number' || !Number.isFinite(detail.UnitPrice) || detail.UnitPrice < 0 || Math.abs(detail.Qty * detail.UnitPrice - line.Amount) > 0.011) return false;
        sum += line.Amount;
      }
      return validMoney(sum) && (!body.TotalAmt || Math.abs(body.TotalAmt - sum) < 0.011);
    }
    if (resource === 'payment') {
      if (body.Id || body.ProcessPayment !== false || !customers.has(String(body.CustomerRef?.value)) || !tagged(body.PaymentRefNum) || !validMoney(body.TotalAmt) || !validDate(body.TxnDate) || !Array.isArray(body.Line) || !body.Line.length || body.Line.length > 10) return false;
      let applied = 0;
      for (const line of body.Line) {
        if (!validMoney(line.Amount) || !Array.isArray(line.LinkedTxn) || line.LinkedTxn.length !== 1 || line.LinkedTxn[0].TxnType !== 'Invoice' || !invoices.has(String(line.LinkedTxn[0].TxnId))) return false;
        applied += line.Amount;
      }
      return Math.abs(applied - body.TotalAmt) < 0.011;
    }
    return false;
  };
  async function transport(input, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    let url, authorization;
    try { url = new URL(input); authorization = new Headers(options.headers || {}).get('authorization'); }
    catch { return deny(method, 'invalid-request'); }
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) return deny(method, 'invalid-origin');
    if (url.href === TOKEN_URL) {
      let fields; try { fields = new URLSearchParams(options.body); } catch { return deny(method, 'oauth-refresh'); }
      if (method !== 'POST' || fields.get('grant_type') !== 'refresh_token' || !fields.get('refresh_token') || [...fields.keys()].some(key => !['grant_type', 'refresh_token'].includes(key)) || !authorization?.startsWith('Basic ')) return deny(method, 'oauth-refresh');
      verifiedBearer = null; if (armed) stop();
      await record(method, 'oauth-refresh', 'attempted'); counts.refreshes++;
      let response;
      try { response = await fetchImpl(url.href, { ...options, redirect: 'error' }); }
      catch { await record(method, 'oauth-refresh', 'transport-failure'); throw guardError('Sandbox provider request failed; credentials omitted.'); }
      await record(method, 'oauth-refresh', response.ok ? 'succeeded' : 'http-error', response.status);
      return response;
    }
    const match = url.pathname.match(/^\/v3\/company\/(\d{1,30})\/(query|companyinfo|preferences|account|item|customer|invoice|payment)(?:\/(\d{1,30}))?$/);
    const resource = match?.[2] || 'invalid-resource';
    if (url.hostname !== HOST || !match || match[1] !== REALM_ID || !authorization?.startsWith('Bearer ')) return deny(method, resource);
    if (method === 'GET') {
      const allowedKeys = resource === 'query' ? ['query','minorversion'] : ['minorversion'];
      if (options.body || [...url.searchParams.keys()].some(key => !allowedKeys.includes(key)) || resource === 'companyinfo' && match[3] !== REALM_ID) return deny(method, resource);
      if (resource === 'query' && (!/^SELECT\s+(?:\*|COUNT\(\*\))\s+FROM\s+(Account|Item|Customer|Invoice|Payment|CompanyInfo|Preferences|TaxCode|TaxRate)\b/i.test(url.searchParams.get('query') || '') || (url.searchParams.get('query') || '').includes(';'))) return deny(method, resource);
      counts.reads++;
    } else {
      let body; try { body = JSON.parse(options.body); } catch { return deny(method, resource); }
      if (method !== 'POST' || match[3] || !['customer','invoice','payment'].includes(resource) || [...url.searchParams.keys()].some(key => key !== 'requestid') || !/^[a-f0-9]{16,50}$/i.test(url.searchParams.get('requestid') || '') || !writesEnabled() || authorization !== verifiedBearer || !validBody(resource, body)) return deny(method, resource);
      counts.writeAttempts++;
    }
    await record(method, resource, 'attempted');
    let response;
    try { response = await fetchImpl(url.href, { ...options, redirect: 'error' }); }
    catch { await record(method, resource, 'transport-failure'); throw guardError('Sandbox provider request failed; credentials omitted.'); }
    await observe(response, resource, authorization);
    await record(method, resource, response.ok ? 'succeeded' : 'http-error', response.status);
    if (method !== 'GET' && !response.ok) stop();
    return response;
  }
  return {
    transport, labelPrefix,
    arm(verification) {
      if (verification?.legacyConsumersAbsent !== true) { stop(); throw guardError('An active or unverified legacy consumer of this realm blocks sandbox certification; write capability disabled.'); }
      if (armed || stopped || Date.now() >= expiresAt || verification?.companyId !== COMPANY_ID || verification?.realmId !== REALM_ID || typeof verification?.companyName !== 'string' || verification.companyName.trim() !== COMPANY_NAME || verification?.environment !== 'sandbox' || verification?.credentialEnvironment !== 'sandbox' || !verifiedBearer) { stop(); throw guardError('Sandbox verification is incomplete; write capability disabled.'); }
      armed = true;
    },
    async disarm() { stop(); await record('CONTROL', 'capability', 'disabled'); },
    writesEnabled,
    allowCustomer(id) { if (!numericId(id) || !customers.has(id)) { stop(); throw guardError('Customer was not verified as a synthetic record for this run.'); } return id; },
    allowInvoice(id) { if (!numericId(id) || !invoices.has(id)) { stop(); throw guardError('Invoice was not verified as a synthetic record for this run.'); } return id; },
    getSummary: () => ({ companyId: COMPANY_ID, realmId: REALM_ID, runId, labelPrefix, armed: writesEnabled(), expiresAt, maxWrites, ...counts, verifiedCustomers: customers.size, verifiedInvoices: invoices.size }),
  };
}
module.exports = { createQuickBooksSandboxTransport, COMPANY_ID, REALM_ID, COMPANY_NAME };
