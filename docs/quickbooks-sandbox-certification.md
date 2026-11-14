# QuickBooks sandbox synchronization certification — blocked

Date: November 14, 2026. Starting release: `ac1174c` on the existing `main` branch, retaining the later web UX fixes after `0770810`.

**End-to-end accounting synchronization is not certified. No live sandbox accounting writes or synthetic production-tenant records were created.** A material isolation blocker was found before the temporary write capability was armed.

## Isolation blocker

Route Logistics tenant `z7DJMjeigjG64YfN4H5h` (Acme Pest Control) is connected to `Sandbox Company_US_1`, realm `9341455727000797`. A token-free production query also found an existing mi Factotum `quickbooksConnections` record for that same realm, with `syncStatus: active`.

The deployed mi Factotum webhook source looks up connections by realm and can import QuickBooks customer changes. Its lookup does not establish the environment or active status before importing. This proves a shared-consumer risk; it does not prove that Intuit is presently delivering to that endpoint or that the legacy token remains valid. Those external conditions could not be ruled out without changing or inspecting the legacy application's configuration. No such change was made.

Creating an RL synthetic customer in this sandbox could therefore cause legacy imports and MF data writes. The directive requires preserving MF integrations and records, so writes stopped before any test customer, invoice or payment was created. Merely pausing the MF customer scheduler would not isolate its webhook.

Two additional deployed-source safeguards were inspected read-only for future fixture design: the legacy invoice portal trigger returns before writes if `customerEmail` is absent, and the legacy customer scheduler selects `quickbooks_sync_status == pending`. Neither removes the shared provider-webhook risk.

To continue safely, a separate, verified Intuit sandbox realm and dedicated RL test tenant are needed while retaining the current Acme connection. No suitable alternate provider connection was available for this run. Phase 8 permits a second test tenant when a sandbox is available; operator action is needed to supply that provider connection. Altering or disconnecting the legacy integration would require an explicit change to the current constraints. No additional per-customer developer credentials or Firebase project are needed.

## Actual Intuit operations

Only read-only requests were made against `sandbox-quickbooks.api.intuit.com` and the exact recorded realm. Intuit accepted the existing sandbox token. CompanyInfo identified `Sandbox Company_US_1` in the US, and Preferences confirmed:

- Home currency: USD; multicurrency disabled.
- Sales tax enabled; partner-tax/AST mode not independently established.
- Custom transaction numbering disabled.
- 22 active income accounts and 31 active service items were returned; both saved default selections were present.

The four accounting API GETs checked accounts, items, company identity and preferences. They did not refresh, revoke or replace the OAuth connection. Its document version was unchanged during the read-only checks. No Secret Manager payloads were read by the operator; version/access metadata and runtime bindings were sufficient for the blocked preflight.

## Automated verification and corrections

| Capability | Automated result | Actual Intuit sandbox result |
| --- | --- | --- |
| Owner authorization and tenant isolation | Passed: owner checks, foreign records/claims denied, independent synthetic tenant fixtures | Existing Acme connection verified read-only; no second provider tenant connected |
| Customer export and contact mapping | Passed: contacts, mapping reuse, duplicate prevention and lost-response replay | Not attempted because the realm is shared with MF |
| Service-item mapping | Passed: existing active Service item and active income-account validation; mapped/default fallback | Existing lists/defaults verified read-only; no mapping or item/account mutation |
| Invoice export | Passed: USD, quantities/prices/totals/dates, mapping and retry controls | No invoice exported; provider totals/numbering behavior remain unverified |
| Tax | Passed: nonzero tax, unmapped positive rates and malformed values fail closed | Sales tax is enabled; taxable export remains unsupported and uncertified |
| Discounts and other currencies | Explicitly rejected until supported mappings exist | Not attempted |
| Partial/full payments | Passed: balances, amount/date/currency/allocations and customer association | No payment created; no Stripe calls or financial processing |
| Out-of-order and concurrent reconciliation | Passed: invoice lease, independent provider-version/time fences and payment-version checks | Not exercised through real provider events |
| Webhooks | Passed: raw-body signatures, legacy and modern Intuit CloudEvents, deduplication, malformed/disconnected/tenant handling and retries | Genuine provider delivery not attempted or certified; invalid-signature endpoint probe remains safe |
| Source changes after provider acceptance | Passed: retained review receipts and remote IDs; no duplicate create after source/ownership changes | Not attempted |

The export operation now persists exact serialized request bytes, not only a Firestore map whose field order may change. Uncertain retries reuse the original body and request ID. Accepted exports whose source or ownership changes are retained for explicit accounting review rather than silently finalized or recreated. Older uncertain operations lacking the required retry receipt need review.

Invoice/payment reconciliation verifies customer associations, serializes invoice checks and rejects older provider versions/timestamps when present. Genuine provider ordering remains untested. Sandbox reconciliation updates `qbTestPaymentStatus`, `qbTestBalance` and `qbTestAmountPaid`; it does not mark the actual invoice paid. Payment mappings retain validated amount, date, currency and invoice allocations.

The temporary operator transport is process-local and denies writes by default. It restricts tenant, exact sandbox realm/host, observed CompanyInfo/bearer, synthetic record identity, amounts, write budget and lifetime. It blocks account/item mutation and payment processing. Arming additionally requires an affirmative legacy-consumer isolation preflight, which this realm fails. It was never armed, and no public test endpoint was introduced.

## Tax mapping requirements before production

The US realm needs verified tenant/realm tax preferences and tax-code/rate or AST configuration, explicit taxable/exempt line classifications (`TAX`/`NON`), correct sale/service and ship-from/customer jurisdiction data, and tested tax detail, rounding and total reconciliation. US and non-US tax models differ; `GlobalTaxCalculation` must not be blindly added for this US realm. See the [Intuit Invoice reference](https://developer.intuit.com/docs/api/accounting/invoice) and [Intuit tax validation errors](https://static.developer.intuit.com/output_html/qbo/docs/develop/troubleshooting/error-codes.html).

An explicit non-taxable synthetic fixture can set `taxTreatment: non-taxable`; it must not stand in for taxable-invoice certification. No tax engine, tax accounts or rates were created automatically.

## Validation and deployment

- 71 targeted Firestore emulator/integration/authorization tests passed.
- 13 sandbox transport safety tests passed.
- 65 Functions unit tests passed, including 10 webhook-normalization tests; one unrelated native-push emulator test was skipped without its emulator.
- 144 web tests passed. The web production build and focused Integrations ESLint check passed.
- The accounting-review lookup was verified against existing production Firestore indexes using a read-only query.
- Six affected RL functions deployed successfully: `rlQuickBooksAdopt`, `rlQuickBooksPreview`, `rlQuickBooksSync`, `rlQuickBooksReconcile`, `rlQuickBooksWebhook` and `rlQuickBooksProcessEvents`. No web component or MF function was deployed.

Final production metadata checks confirmed all 12 QuickBooks endpoints active with the expected sandbox configuration and secret bindings. All 83 RL functions are active. Unauthenticated connect/status/sync requests returned 401, an incomplete OAuth callback returned 400, and an unsigned webhook returned 401.

All original 507 customer document versions are unchanged. All 29 MF function deployment revisions match the existing canonical snapshot; a noncanonical JSON-order fingerprint mismatch was resolved using the canonical comparison. The Acme OAuth connection document, accounting defaults and legacy connection metadata are unchanged from this run's preflight. No synthetic records need cleanup because none were created.

The safe configuration remains `RL_QB_ENV=sandbox`, `RL_QB_CREDENTIAL_ENV=sandbox`, `RL_QB_WRITES_ENABLED=false`, and `RL_QB_PRODUCTION_APPROVED=false`. The RL scheduled event processor is paused after the hardening deployment, leaving no scheduled RL QuickBooks processing enabled for this blocked attempt. MF schedules and integrations remain untouched.

Production approval must remain disabled until isolated provider writes, genuine webhook delivery, taxable invoice behavior, and a real second-tenant connection have been exercised successfully. Automated provider fixtures do not substitute for these acceptance steps.
