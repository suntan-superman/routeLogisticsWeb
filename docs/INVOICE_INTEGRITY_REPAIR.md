# Route Logistics — Invoice Integrity Repair

November 16, 2026. Existing `main`, Firebase project `mi-factotum-field-service` and existing Netlify site. Scope: G12/G13/G14 from [the workflow audit](CUSTOMER_TO_PAYMENT_WORKFLOW_AUDIT.md). No mobile changes, live billing, provider exports, automatic invoice creation or historical financial migration.

## Original defects and reproduction

Before changing runtime code, three new local Firestore-emulator regressions exercised the original invoice service, including actual approved-estimate conversion:

- Approved subtotal100/tax8.25/total108.25 became invoice subtotal0 instead of100; approved quote pricing was lost.
- Two concurrent requests created two invoices rather than one.
- Forged client pricing1 replaced canonical job price100.

All three failed against the original source. Red evidence and original test harness are retained privately under ignored `.migration/invoice-integrity-red*`. No production invoice or provider transaction was created by those tests.

Root causes: conversion stored `total`/`estimatedCost` while the browser read only `totalCost`; browser query-then-add was non-atomic and limited to five matches; financial arithmetic/writes/status changes were client-controlled instead of an authoritative revisioned transaction.

## Authoritative contract

New callable: **`rlManageInvoice`**, backed by `functions/invoices.js` and `functions/shared/invoiceMath.js`.

| Action | Input | Result / behavior |
| --- | --- | --- |
| `preview` | `jobId`; optional `replacementOf`, `expectedRevision` | Authorized source lines/cents/dollar projections + `sourceFingerprint`, or the preserved existing invoice/review result. Does not create an invoice, claim, billing operation, notification or mail. Existing read rate limiting remains. |
| `create` | `jobId`, stable `operationId`, reviewed `sourceFingerprint`; optional `notes`, `dueInDays` | Atomically create one draft or return canonical existing identity. Caller totals/customer/prices are not accepted. |
| `replace` | Create fields + current voided `replacementOf`, `expectedRevision` | Explicitly create one next generation after void; repeat/concurrent requests return the same replacement. Ordinary create/retry never replaces a void invoice. |
| `update` | `invoiceId`, stable `operationId`, `expectedRevision`, `changes` | Draft metadata only: notes, issue date, due date. No invoice line/price/tax edits; financial terms come from authoritative source. |
| `status` | `invoiceId`, stable `operationId`, `expectedRevision`, `status`; optional manual payment method where permitted | Only draft→sent/void and sent→paid/void. Paid/void immutable; payment-locked changes rejected. |

Operation IDs use the existing bounded stable identifier convention. Reusing an ID for a different payload fails. Preview pins the canonical job/source fingerprint; changes require refresh and renewed review. Client submission success appears only after server acknowledgement.

`emailInvoice` now requires `expectedRevision` (legacy revision0). Its explicit draft→sent transition is revisioned/audited in the same transaction as deduplicated mail enqueue. Internal reminders remain consent/gate-controlled; this release does not invoke them or send mail during verification.

## Approved-estimate billing snapshot

Conversion minimally adds a validated `billingSnapshot`, retaining:

- Estimate ID/approved version and resolved customer ID.
- Approved property/category and scope/reference.
- Original descriptions/kinds, quantities and unit-price cents.
- Line cents, subtotal cents, flat supported tax rate/treatment, tax cents, total cents and USD currency.

The helper uses decimal parsing and BigInt scaled arithmetic, then emits integer-cent values. Dollar fields remain compatible projections for existing Stripe, QuickBooks, portal and print/mail consumers. No current service price silently replaces approved terms.

New converted jobs also expose `totalCost` for existing job display compatibility, derived from the validated approved total. **Invoice authority never depends on that display alias.** It resolves the immutable version plus private approved state and conversion/customer/job relationship transactionally. Corrupt/incomplete versions fail review. The original approved estimate/version is not modified.

Existing converted jobs are not migrated: the server resolves their immutable approved version when a future authorized user asks to create an invoice. An incomplete or ambiguous reference fails safely instead of producing zero. Ordinary jobs require explicit finite nonnegative cent-precise canonical `totalCost`; missing is not zero. An explicit authorized0 source is permitted, but Stripe's existing minimum payment amount still applies.

## Canonical identity and historical compatibility

`rlInvoiceClaims` is keyed by a hash of workspace/company and source job. Invoice IDs include that full claim and generation. A transaction loads the job/current actor, reads **all** historical invoices for that job, checks any existing claim, then creates claim/invoice/operation/audit atomically. Sequential retries, concurrent tabs and different financial actors converge on one active invoice.

Historical random-ID invoices are returned with their original document identity and values; a stored legacy `id` alias cannot replace the canonical document ID in the client or API. Multiple active rows, inconsistent claims or ambiguous void histories require review; nothing is merged, voided, deleted, renumbered or repriced automatically. A void remains immutable history. Explicit replacement links back using `replacementOf`; a stale void/retry cannot advance another generation.

New invoice timestamps retain the existing Firestore Timestamp storage contract, so server-side chronological ordering does not group new ISO-string records behind old timestamps. API projections and replay receipts use canonical ISO strings. Existing records are not migrated.

Displayed invoice numbers are deterministic, generation-specific and bounded for the existing QuickBooks21-character projection. Collision checks occur before creation. Historical numbers remain unchanged.

Private server-only collections are `rlInvoiceClaims`, `rlInvoiceOperations` and `rlInvoiceAudit`. Operation receipts preserve replay results; audit records include actor, action, revision/status transition, source/amount evidence and changed metadata. No invoice-ready notification, mail or charge is generated by creation.

## Revisions, statuses and authorization

New invoices start revision1; missing historical revision is0 until an explicit permitted action. Update/status/explicit issuance compare expected revision, increment on success and record audit evidence; creation instead uses its reviewed source fingerprint and transactional identity. Trusted Stripe/QB worker paths retain their separate existing contracts. Stale clients receive a conflict and refresh/review guidance. Issued financial terms do not silently change; correction requires reviewed source/revised quote and explicit void/replacement where allowed.

Malformed historical per-line/aggregate/currency/tax terms block sent/paid transitions and email issuance. Historical reads, explicit Void and draft metadata remain compatible; valid legacy dollar-only terms are accepted without requiring a bulk cent-field migration. Existing malformed amounts are never silently normalized or corrected.

Financial authorization remains owner/active admin or a valid independent solo owner. Managers/technicians/customer portal sessions receive no new privileges. Current ownership/membership/account/customer/source scope is checked, including inside the financial transaction so revocation cannot race the commit.

Firestore preserves financial read access but denies **all direct client invoice create/update/delete**, including owner/admin/solo clients. New private billing records and descendants remain denied by the existing default-deny rule. Firebase Admin workers retain their existing trusted paths. Draft deletion is replaced with explicit audited Void; it does not destroy a financial record.

## Other mutation paths inspected

- Web `invoiceService.js`: all financial writes now call the server; list reads remain scoped server reads.
- Jobs and Invoices screens: explicit preview/confirm, stable retries, expected revisions, duplicate-action locks, actionable errors and targeted query invalidation.
- `invoiceEmail.js`: draft issuance now revisioned/audited; existing worker recipient/consent/deduplication controls retained.
- `payments.js`/`paymentLifecycle.js`: trusted payment locks, signed provider reconciliation and history remain separate; no payment architecture rewrite.
- `quickbooks.js`: existing optional sandbox reconciliation/mapping writes retained; event processor not resumed and exports not invoked.
- Existing tenancy/backfill/stamp code and guarded migration/certification operator scripts are administrative paths, not browser invoice entry points. They were inspected and not invoked or expanded in this release.
- No native invoice writer or financial screen was found; Android/iOS code and identities are unchanged.

## Web experience

Create Invoice opens a server-generated review dialog with source label, approved version where applicable, original lines, subtotal/tax/total and an explicit **Create draft invoice** confirmation. Simply opening a completed job/preview creates no invoice. Existing invoices open preserved details instead of creating another. A void requires **Review replacement** and explicit confirmation.

Create/status actions show pending state, block duplicate taps and retain the same operation ID on uncertain retries. Email uses its existing deterministic daily/weekly mail identity for deduplication. Changed source/revision, missing pricing, incomplete/nonbillable work, invalid estimate/customer, permission and backend failures remain visible and retryable after review; submission failures also use the standard visible toast. Queries invalidate the affected invoice/job/payment/report controls; no page reload.

Historical rows display their original values with source-review guidance where provenance/financial details are incomplete. This is not an automatic finding of an invalid charge, nor an automatic repair/resend.

## Stripe and QuickBooks compatibility

The authoritative schema retains `total`, `subtotal`, `tax`, `taxRate`, `lineItems[].quantity/unitPrice/amount`, customer/job/tenant IDs, currency and existing statuses. New cent/source/revision fields add authority without replacing these projections.

Local tests derive a corrected108.25 invoice, verify Stripe amount10825 and a signed mocked test reconciliation, preserve actual invoice unpaid status, and verify portal/history/mail behavior. These are automated contract tests, **not a new real Stripe payment or provider acceptance**.

QuickBooks read-only mocked preview/source-fingerprint tests use corrected invoice projections; unsupported/missing tax mappings continue to fail safely. Existing mappings/operations/reconciliation history are not changed. Native payment export, tax mapping UI, partial/deposit ledger and multi-provider merchant settlement remain separate audited gaps.

Required unchanged deployed gates: Stripe mode=test/liveApproved=false; QuickBooks env=sandbox/writes=false/productionApproved=false; QB processor PAUSED. No new products, SDKs, secrets or paid services.

## Test and release evidence

Implementation commit: **`4821a11b682e79c1c0586ba89257dde0c7ea06d0`**. It was pushed with Netlify publication withheld until the dependent backend/rules were active. The production web uses the same existing site and branch.

Suite counts below are separate and overlap; real-provider and physical acceptance are never implied by emulators.

| Suite | Executed result |
| --- | --- |
| Original defect regressions against old source | 0/3 passed, all three expected failures reproduced before runtime edits |
| First focused invoice emulator run | 23/23 passed, including real conversion and mocked signed payment/accounting contracts |
| Full Firestore/Storage workflow and rules run | 528/528 passed, zero skipped/failures |
| Final invoice-specific emulator run | 29/29 passed on final code, including canonical legacy IDs and Timestamp ordering |
| Functions/operator guard unit command | 28/28 passed |
| Full Functions unit invocation | 181 passed, one emulator-only skip, zero failures |
| Full web service/UI suite | 437/437 passed |
| Chromium/Firefox/WebKit smoke matrix | 36/36 passed (12 scenarios per engine), including invoice preview/create/existing/void/replacement in all three |
| Web lint and production build | Passed |

Deployed identifiers are recorded below. Test logs are ignored under `.migration/invoice-integrity-*`; provider transports and credentials in automated runs are inert/mocked. The full, focused and browser runs are separate overlapping executions, not one added total. PW-INVOICE-01 passed in each engine; its mutations were solely synthetic local-emulator records, not production acceptance invoices.

## Production preservation and historical review

### Backend release — 12:07 PM Pacific, November 16

Only these Route Logistics Functions were deployed and confirmed ACTIVE:

| Function | Deployed revision |
| --- | --- |
| `rlManageInvoice` | `rlmanageinvoice-00001-zoj` |
| `rlEstimate` | `rlestimate-00012-reh` |
| `emailInvoice` | `emailinvoice-00014-nin` |
| `rlQueueInvoiceReminders` | `rlqueueinvoicereminders-00014-kaj` |

Firestore ruleset `23e00a1f-3c35-42b1-b8f3-7760bb38ef3e` exactly matches the tested source (normalized SHA-256 `825c78241bbd5ec6410181d282d3c100c38e8ca1558b3b07aa8bc11b6168fc93`). The new callable returned HTTP401/UNAUTHENTICATED for the non-mutating unauthenticated smoke request; it was not exercised against a production customer/job/invoice.

All baseline record metadata hashes/counts matched after deployment. No unrelated function revision changed. All financial integration flags matched the baseline, including the new function's environment. QB processing remains PAUSED; the invoice reminder schedule retains its previous enabled state and schedule, without being invoked by this release.

### Web release — verified 12:10 PM Pacific, November 16

Publication commit **`47cf3c2701c6d3cd9e64cf8db9f65ad505de79d9`** released the already-tested implementation after backend activation. Netlify deployment **`6afb6298f174af9dbe74c0cb`** is **ready** on the existing [production site](https://route-logistics.com/).

Read-only checks fetched the served entry `index-C5tvQ5mY.js` and its Jobs, Invoices and InvoiceCreationDialog assets. Those assets contain the authoritative `rlManageInvoice` client, source preview, explicit draft creation, explicit replacement and historical-review behavior. Public deployment metadata identifies the exact publication commit. Private sanitized evidence is `.migration/invoice-integrity-web-published.json`.

G12, G13 and G14 are resolved for this bounded implementation and automated validation. This does not close the other workflow audit gaps or certify a real provider transaction, production invoice creation or unperformed operator acceptance.

Read-only pre-deployment baseline at **11:30 AM Pacific on November 16**: 518 customers, 17 jobs, one estimate, six invoices, one Stripe payment mapping, one Stripe reconciliation event, four QB mappings, three QB operations, three QB reconciliation receipts and two QB payment mappings. Document IDs/create/update timestamps were hashed privately for before/after comparison; no customer names, contact details, payment secrets or financial values were printed.

The six legacy invoices have no source-job link and require financial-source review; some fields do not follow the current native invoice schema. A private identifier/category-only report is retained in ignored `.migration/invoice-integrity-historical-review.json`. No totals/records were corrected, linked, deleted or resent. Missing provenance does not itself prove a wrong charge.

The baseline was refreshed immediately before deployment at **12:05 PM Pacific**, with the same record counts. The original metadata snapshot is also retained privately.

A final read-only comparison at **12:12 PM Pacific**, after web publication, again matched every baseline record metadata hash/count, financial gate and schedule state. All four affected Functions remained ACTIVE; unrelated function revisions were unchanged.

The deployed Firestore rules were privately backed up and matched the pre-repair source before applying the narrow invoice-write restriction. Production verification is non-mutating: function state/config/rules/assets and unauthenticated denial, not an actual invoice/payment/export/email operation.

## Remaining acceptance

- [ ] Operator browser review of correct approved-estimate lines/tax/total, explicit Create, existing invoice and void/replacement flow using separately authorized synthetic records.
- [ ] Review legacy financial-source discrepancies privately; any future corrections require explicit financial review, not this release's deployment.
- [ ] Real Stripe/Intuit/provider delivery acceptance remains separate and was not exercised. Live Stripe and QB exports remain disabled.
- [ ] Physical mobile field/offline acceptance from the earlier work-note repair remains separate; this web/backend repair requires no native rebuild.

No live billing, automatic invoicing, historical migration, partial-payment redesign, prospect intake or estimate-visit feature was introduced.

## Changed files

- Backend runtime: `functions/invoices.js`, `functions/shared/invoiceMath.js`, `functions/estimates.js`, `functions/invoiceEmail.js`, `functions/index.js`.
- Web runtime: `routeLogisticsWeb/src/services/invoiceService.js`, `routeLogisticsWeb/src/services/workspaceQueryPolicy.js`, `routeLogisticsWeb/src/components/InvoiceCreationDialog.jsx`, `routeLogisticsWeb/src/pages/JobManagementPage.jsx`, `routeLogisticsWeb/src/pages/InvoicesPage.jsx`.
- Authorization: `firestore.rules` (invoice write restriction only).
- New regressions: `functions/invoices.test.js`, `tests/invoiceIntegrity.integration.test.js`, `tests/invoice-integrity.ui.test.js`, `tests/browser/invoice-integrity.spec.js`.
- Existing test/runner updates: `package.json`, `tests/firestore.rules.test.js`, `tests/workflows.integration.test.js`, `tests/invoices-query.ui.test.js`, `tests/jobs-details.ui.test.js`, `tests/job-save-navigation.ui.test.js`, `routeLogisticsWeb/src/services/workspaceQueryPolicy.test.js`. Fixture/importer changes preserve existing assertions and provide valid terms/revisions to the stronger contract.
- Documentation: this report, the workflow audit, master acceptance plan and documentation index. No dependency, mobile, Stripe or QuickBooks runtime files changed.
