# QuickBooks sandbox synchronization results

November 14, 2026. Actual customer, service mapping, invoice, manual tax, payment and retry tests passed. Genuine Intuit webhook delivery remains unverified; this is not a claim of full provider-webhook or production certification.

## Environment and retirement

- Firebase project: `mi-factotum-field-service`; existing `main` branch.
- RL tenant: Acme Pest Control, `z7DJMjeigjG64YfN4H5h`.
- QuickBooks: `Sandbox Company_US_1`, realm `9341455727000797`, US, USD.
- Accounting host: `sandbox-quickbooks.api.intuit.com`; existing development credentials accepted.
- Run: `1411ac01`, 17:09:56–17:10:57 UTC. Synthetic prefix: `RL-CERT-1411ac01`.

All 29 independent legacy mi Factotum functions are retired, their backing services removed, all four legacy event triggers removed, and all four legacy schedules paused. Route Logistics has no code dependency on these endpoints. Shared Firebase infrastructure, Auth, data, secrets and runtime IAM remain intact. See [legacy retirement](legacy-retirement.md).

The previous blocked attempt is preserved in Git commit `54875b9`. Its requirement to protect active legacy processing was superseded by the explicit retirement decision. No separate sandbox, Firebase project or staging environment was needed.

## Actual Intuit sandbox operations

| Capability | Actual result |
| --- | --- |
| Customer | PASS. Customer `59` has the synthetic name, contact details and tenant/realm mapping. Query confirmed exactly one matching customer. |
| Accepted-response failure and retry | PASS. The first accepted customer response was deliberately discarded. Retrying identical request bytes and request ID returned the same customer; a further cached synchronization created nothing. |
| Service mapping | PASS. A new labeled RL service maps to existing active QuickBooks Service item `10`; no account or item was created or modified. |
| Non-taxable invoice | PASS. Invoice `145`: two units at $10, subtotal/total $20, explicit `NON`, correct customer, service, dates and USD. Repeated export reused its mapping. |
| Taxable invoice | PASS. Invoice `146`: $20 subtotal, California code `2`, rate `3` at 8%, tax $1.60, total $21.60. Provider values matched RL. The configured default service fallback worked. |
| Partial payment | PASS. Payment `147`: $5 on invoice `145`; RL test status `partial`, balance $15, amount paid $5. |
| Full payment | PASS. Payment `148`: remaining $15; RL test status `paid`, balance $0, amount paid $20. Actual RL invoice status remained `sent`. |
| Payment duplicates and reconciliation | PASS. Repeating each identical provider request returned its original payment ID. Repeating reconciliation left the invoice document version unchanged. Payment mappings preserve amount, date, currency, customer and invoice allocation. |
| Existing data and connection | PASS. Every original customer version remains unchanged, as do the OAuth connection identity/realm and saved accounting defaults. Normal token rotation occurred during preflight without disconnecting or reauthorizing. |

The existing service item `10` uses its own active income account `54`. The saved default income account `45` remains unchanged; selecting that default does not override the account already configured on a QuickBooks service item.

The controlled run made 33 accounting GETs and eight accounting POST attempts, creating exactly five distinct provider records: one customer, two invoices and two payments. Three POSTs were deliberate idempotency replays. No existing QuickBooks accounting record was edited. Both payments used `ProcessPayment=false`; no card, bank, Stripe, charge or refund request was made.

Four new RL fixture documents are retained for audit: customer `rl-cert-1411ac01-customer`, service `rl-cert-1411ac01-service`, and invoices `rl-cert-1411ac01-invoice` / `rl-cert-1411ac01-tax-invoice`. The original 507 customers are preserved; total Acme customer count is now 508 including the labeled fixture. Synthetic contact email uses `example.invalid`; no invitation, invoice or reminder was sent. No cleanup deleted records.

Private sanitized execution evidence is in ignored `.migration/qb-live-1411ac01.json`. Credentials and raw OAuth responses are not stored there. The runner uses existing server handlers in a privileged operator process with the verified company owner context; this is not a browser sign-in or callable authentication end-to-end test.

## Tax validation and limits

Taxed invoices require explicit `taxTreatment: taxable` and `qbTaxMapping` containing matching `companyId`, accounting `environment`, `realmId` and active `taxCodeId`. The handler checks the current US company preferences, linked active tax rates, local percentage, per-rate rounding and gross total. Returned invoice tax, total, currency and customer must match; a provider-accepted mismatch retains the remote receipt for accounting review instead of retrying a new invoice.

This run certified the existing simple US manual 8% mapping only. Automated sales tax, jurisdiction/address calculations, compound rates, effective-dated rates, discounts and non-USD exports are outside that scope and remain blocked where unsupported. No tax agency, account, rate or item was created. Custom transaction numbering is disabled in this sandbox, so fixtures omit `DocNumber` and identify themselves through `PrivateNote` and their synthetic customer.

## Webhook verification

The deployed endpoint is:

`https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlQuickBooksWebhook`

A real-secret, empty operator probe passed: valid HMAC returned 200; changing the raw body without changing its signature returned 401; unsigned input returned 401. The empty probe created no events or accounting records. Automated tests cover signatures, legacy/CloudEvents parsing, tenant routing, duplicates, retries, disconnected tenants and older/concurrent provider snapshots.

The actual payment reconciliation above used clearly marked operator queue events (`origin: operator-sandbox-certification`) and actual Intuit payment/invoice GETs. Those rows are not genuine provider notifications. No provider-origin events for customer `59`, invoices `145`/`146`, or payments `147`/`148` were observed during the run. The operator's empty signed probe must not be counted as provider delivery.

Remaining external action: confirm the dedicated Intuit app's **Webhooks → Development** endpoint and Customer, Item, Invoice and Payment subscriptions, then inspect its delivery status. Registration is managed in the [Intuit developer dashboard](https://static.developer.intuit.com/output_html/qbo/docs/develop/webhooks/configure-webhooks.html); it is not independently visible through the available OAuth accounting API. Keep the verifier value out of chat. Genuine delivery and subsequent processing remain uncertified until an actual provider event is observed.

## Validation, deployment and safe final state

- 78 QuickBooks emulator/integration/authorization tests passed.
- 21 operator-runner and sandbox-transport safety tests passed.
- 65 Functions unit tests passed; one unrelated native-push emulator test skipped.
- JavaScript syntax and Git whitespace checks passed. No web application source changed.
- Only `rlQuickBooksPreview` and `rlQuickBooksSync` were deployed for the tax, invoice-note and accepted-receipt checks. Deployment succeeded; revisions are `rlquickbookspreview-00013-sin` and `rlquickbookssync-00013-cow`.
- Final production verification at 17:16:28 UTC passed: all 83 RL functions active, zero legacy functions or backing services remaining, all 12 QB endpoints using expected sandbox flags and secret bindings, four legacy schedules and the RL QB scheduler paused, original 507 customers unchanged, exactly one expected new customer, OAuth association/defaults preserved, and the existing web site responding HTTP 200.

The temporary operator capability was disarmed in `finally` and cannot be reused. No public test endpoint or permanent write exception was introduced. Deployed settings remain:

```ini
RL_QB_ENABLED=true
RL_QB_ENV=sandbox
RL_QB_CREDENTIAL_ENV=sandbox
RL_QB_WRITES_ENABLED=false
RL_QB_PRODUCTION_APPROVED=false
```

The RL QuickBooks processor schedule remains paused. The four legacy schedules remain paused with their target functions absent. Ordinary Route Logistics schedules and functions remain operational. Production accounting exports remain disabled. No real financial transaction occurred.
