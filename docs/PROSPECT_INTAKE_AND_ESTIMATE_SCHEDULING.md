# Route Logistics — Prospect Intake and Estimate Scheduling

November 16, 2026. Batch A, G01–G04. Existing `main`, Firebase project `mi-factotum-field-service`, existing Netlify site and Expo applications. This release extends customer acquisition through an assigned estimate visit; preparation/delivery of a technician quote remains Batch B.

## Operational workflow

Customers → **New Inquiry** searches the company directory by name, email, phone and service address. Staff explicitly reuses a matching customer or creates a prospect, chooses/adds a service property, records the requested service/source/notes/follow-up, and saves. **Schedule Estimate** hands that saved inquiry/customer/property to the existing checked job form. The same form also supports an explicit **Service job / Estimate visit** choice, separate from one-time/recurring scheduling.

The normal scheduler validates current staff membership, field eligibility, temporary unavailability, appointment overlap, schedule locks and geographic eligibility. Existing quarter-hour alternatives remain available on conflict. Estimate visits appear alongside service jobs in Jobs, Dispatch, Calendar and assigned mobile schedules, distinguished by type/outcome. Reassignment, date/time changes and cancellation use the same scheduler.

## Customer lifecycle and archive state

`customers.lifecycle` supports `prospect`, `active` and `inactive`. Missing historical lifecycle means **active** without writing or reclassifying the record. Archive/deactivation (`isActive`, deletion/archive markers) remains separate. New work requires a usable customer; archived/inactive contacts must be explicitly restored/reactivated before booking new appointments.

New-inquiry contacts begin as prospects. Reusing a customer retains its ID and history. An explicit accepted service booking or approved-estimate conversion can activate the same prospect with a lifecycle audit record. Completing a free estimate does **not** activate the customer or imply approval of paid work. Management can also explicitly change lifecycle with a captured customer version.

Existing customer archive counts describe archive state, not prospect conversion. The web label distinguishes this from lifecycle.

## Inquiry model and follow-up

Private `rlInquiries` records retain company/customer/property identity, contact snapshot, requested service/category, controlled source plus explanation, notes, follow-up date/staff, revision, timestamps and creating UID/member. One customer can have multiple independent inquiries; a new request does not overwrite an old inquiry.

Sources: `phone`, `website`, `referral`, `existing_customer`, `walk_in`, `other`.

Statuses: `new`, `contacted`, `estimate_scheduled`, `estimate_completed`, `converted`, `closed`. These are distinct from customer lifecycle and appointment status. The compact Customers inquiry queue offers new, due/overdue follow-up, scheduled and closed views. Due dates use the company time zone. Staff edits require expected revision and a stable operation ID; a closed/converted request cannot be reopened to overwrite its history.

Scheduling stores `appointmentId` and advances the inquiry atomically. Completion advances it to estimate completed and retains the visit outcome. Cancellation retains the appointment and returns a nonterminal inquiry to contacted for follow-up. A different request cannot silently create another live appointment for the same inquiry.

## API and replay protection

`rlManageInquiry` uses existing `customers.manage` authorization:

| Action | Purpose |
| --- | --- |
| `matches` | Tenant-scoped name/email/phone/address search; explicit candidate reasons. |
| `list` | Current tenant inquiry/follow-up queue. |
| `create` | Atomically reuse/create customer, select/add property and create one new inquiry. |
| `update` | Expected-revision inquiry/follow-up update. |
| `properties` | Customer-associated property directory and captured customer version. |
| `saveProperty` | Explicit versioned add/edit of one property, preserving historical job/quote snapshots. |
| `lifecycle` | Explicit expected-version lifecycle transition. |

`rlManageCustomer` creation also uses duplicate-aware server creation. Stable `rlIntakeOperations` receipts replay the original accepted operation; a changed payload cannot reuse its identity. Tenant identity locks serialize independent concurrent submissions matching normalized contact identity. A possible match requires explicit reuse or **separate contact plus reason**. Shared family email/phone and commercial contacts remain possible; nothing is automatically merged.

`rlManageJob` accepts stable booking operation IDs for new one-time appointments as well as recurring services. An estimate visit requires one. A repeated/lost-acknowledgement submission returns the same appointment, with no second booking/audit. The inquiry link prevents an additional active appointment under a new operation ID.

## Property directory and snapshots

The smallest directory is embedded in `customers.serviceProperties`, with a maximum of 50 properties and optional `primaryPropertyId`. Each property has a stable ID, revision, label (`home`, `rental`, `office`, `other`), address, unit, access instructions, validation result and edit timestamp. An old saved address appears virtually as `legacy-primary`; reading it does not migrate the customer. Setting another primary property does not silently rewrite the customer's historical address.

Staff explicitly enables editing, reviews Google corrections/warnings and saves a property with its captured customer version. Existing Google validation, service-area/category rules and owner-approved exceptions remain authoritative. Authorized internal address-verification continuation retains a warning and unverified geometry; it does not bypass a configured out-of-area restriction.

An optional collapsed coverage check reuses the existing owner-exception UI. Only the actual owner can approve a configured out-of-area exception; a manager may subsequently use that recorded reference. Property/inquiry handoff retains the reference, while booking rechecks its expiry, category, settings revision and current owner. It is not a trusted client eligibility flag or a permanent territory expansion.

When selecting a property for a new appointment, the server resolves that property from the canonical customer, validates coverage, and rechecks its version inside the booking transaction. Browser-supplied billing addresses, coordinates or eligibility flags cannot replace it. The appointment retains its own property/address/unit/access snapshot. Editing a directory entry later does not rewrite earlier appointments or estimates. Existing appointment type and inquiry/customer/property relationships cannot silently be relabeled; cancel and create the intended appointment when that relationship is wrong.

## Estimate visits and mobile work

`jobs.appointmentKind` is `service` or `estimate_visit`. Missing historical kind behaves as service without a bulk update. Estimate visits remain one-time appointments, `billable:false`, with zero service charge. A separate priced service is required for an assessment fee.

`estimateOutcome` values are:

- `estimate_pending` — Estimate pending.
- `quote_needed` — Visit completed, quote needed.
- `quote_prepared` — Quote prepared.
- `customer_declined` — Customer declined.
- `cancelled_no_access` — Canceled / no access.

Completing a pending estimate defaults to quote needed; it does not create a quote, invoice, payment or customer approval. Cancellation records the corresponding outcome. A completed visit can retain later authorized outcome observations without reopening the job.

Mobile Field Mode shows an **Estimate Visit** badge, selected property/unit/access details and separate dispatcher instructions/work notes. Existing navigation, arrival/departure, photo, note and checklist controls remain in use. Outcome changes and completion use the existing scoped, durable job-operation queue, revision chain and replay protection. Management Mode uses the same company schedule and distinguishes estimate visits. No native quote editor or second offline/photo/visit system is introduced.

Existing assignment notifications handle new estimate assignments with the current preferences, device registrations, event deduplication and job deep links. Automated acceptance tests inspect only the local synthetic outbox; they do not deliver an email, SMS or push notification.

## Financial and authorization protection

`rlManageInvoice` rejects estimate visit classification independently of an inconsistent billable flag. G12–G14 approved-term calculation, canonical billing identity, expected revisions, immutable history and financial capability checks remain enforced. Estimate completion cannot enter ordinary invoicing.

Owner/admin/manager capabilities permit customer/inquiry management and scheduling. Technicians see only assigned estimate work and permitted operational fields; they cannot manage the inquiry queue, create unrelated customers, approve pricing or invoice. Customer portal roles gain no staff privileges. Current membership/company/customer/property relationships are rechecked inside mutations. Revocation, stale versions and cross-company targets fail rather than overwrite another record.

Firestore denies direct client customer creation and protects lifecycle/property directory fields. New inquiry/operation/identity-lock records are private. Estimate classification, billable flag, linkage and outcome cannot be forged with a raw job write; estimate appointment deletion is blocked in favor of cancellation/history. Existing authorized non-geographic service/contact/archive edits retain their bounded compatibility. No Storage permission is broadened.

## Validation and release evidence

All automated mutations use the existing local Firebase emulators and synthetic identities. Google/provider transports are injected or inert. No real customer communication, production invoice, Stripe charge or QuickBooks export is used for acceptance. Executed suites overlap and must not be added together:

| Verification | Executed result |
| --- | --- |
| Full existing Firestore/Storage/workflow/rules suite | 564/564 passed, no failures/skips; before final owner-exception handoff and legacy-archive guard refinements |
| Final focused intake/appointment/rules/address/invoice suite | 129/129 passed on final backend, including 20 intake, 14 estimate-appointment and 29 invoice-integrity cases |
| Functions/operator guards | 28/28 passed |
| Full Functions unit invocation | 184 passed, one emulator-only skip, zero failures |
| Web services/UI | 452/452 passed |
| Mobile | 417/417 passed |
| Chromium / Firefox / WebKit browser smoke matrix | 42/42 passed, 14 scenarios per engine, including both new intake flows in each engine |
| Web ESLint / production build | Passed; lint has no warnings/errors; existing chunk-size advisory remains |
| Expo Doctor | 18/18 passed |
| iOS / Android production JS exports | Both passed |

The final focused suite verifies retained exception references through actual manager scheduling, rejects forged/mismatched approvals and respects legacy archived/inactive status markers before provider work. It also verifies assigned offline estimate completion/outcome replay, source-property binding, snapshot retention, inquiry follow-up preservation and nonbillable invoice rejection. The browser client remained unchanged after its matrix; the final backend archive guard was subsequently verified by the focused suite and Functions tests. Existing arrival/photo/note/checklist/completion and payment/accounting suites remain separate from physical/provider acceptance. Browser configuration was restored, provider transports remained inert, and temporary emulator credentials were removed. Ignored `.migration/batch-a-*` files retain sanitized logs and private preservation evidence.

### Production baseline and backend release

Implementation commit: **`cd6dcabec37075de63c225a6860e439498db6eec`**, pushed on existing `main`. Netlify publication was withheld until backend/index readiness.

Read-only metadata was captured at **12:41 PM Pacific** and refreshed at **1:06 PM Pacific** before deployment: **518 customers, 17 jobs, one estimate, six invoices**, one Stripe payment mapping, one payment event, four QB mappings, three QB operations, three QB reconciliation records and two QB payment mappings. New private intake collections contain zero records. Private document-ID/create/update-time hashes support post-release comparison; customer details, amounts and secret values are not printed.

At **1:12 PM Pacific**, all seven targeted Functions were confirmed ACTIVE:

| Function | Deployed revision |
| --- | --- |
| `rlManageInquiry` | `rlmanageinquiry-00001-heg` |
| `rlManageCustomer` | `rlmanagecustomer-00003-niv` |
| `rlManageJob` | `rlmanagejob-00016-huc` |
| `rlReadWorkspace` | `rlreadworkspace-00012-yil` |
| `rlApplyJobOperation` | `rlapplyjoboperation-00013-vec` |
| `rlEstimate` | `rlestimate-00013-loc` |
| `rlManageInvoice` | `rlmanageinvoice-00002-gev` |

Deployed Firestore ruleset **`e2a2b313-dad9-4cd3-ad00-6faafe352ec4`** matches tested source exactly (normalized SHA-256 `da66c7bcf286d513039b7e99e4f57c30a278344bfa00f9d8c7c559837038fd44`). The two additive `rlInquiries` indexes are **READY**: company/updatedAt `CICAgPi9-ZgK` and user/updatedAt `CICAgPjfkocK`. No unrelated index was removed or changed. At **1:17 PM Pacific**, both deployed query shapes returned HTTP200 and zero records using an operator-authorized read-only query for a nonexistent synthetic tenant, selecting document identity only. No customer values were read. Web publication follows this verified backend/index activation.

Read-only post-deployment checks matched **every baseline record metadata hash/count**, including zero new production inquiry/operation/identity-lock records. No unrelated function revision changed. Deployed financial flags match baseline: Stripe enabled/test/liveApproved=false; QB enabled/sandbox/credentialEnvironment=sandbox/writes=false/productionApproved=false. The QB event processor remains **PAUSED**, and other captured schedule states are unchanged. The new callable returned **HTTP401 / UNAUTHENTICATED** before any customer/inquiry data operation. No authenticated production mutation or provider transaction was used for smoke verification.

Executed mobile checks: **417/417 tests passed**, **Expo Doctor 18/18 passed**, and both iOS and Android production JavaScript exports succeeded. Native configuration, dependencies, identifiers and signing were not changed.

The existing local Android release build passed in **2 minutes 49 seconds**. APK: `routeLogisticsMobile/android/app/build/outputs/apk/release/app-release.apk`, SHA-256 **`E58AF05C49A42EEB5F10DBE9D5B8D525B059E63E2A2592A7D7BCB91191D2601B`**. Its embedded bundle contains the estimate-kind/outcome/property-instruction changes. APK metadata retains Android package `com.workside.routelogistics`, version1.0.1 and versionCode1. It was **not installed** over the operator's running device during this release; app data and pending work were not cleared or flushed. Local build success is not physical acceptance.

## Operator acceptance — not yet performed

- [ ] **A — New prospect:** New caller → New Inquiry → create prospect → select property → schedule estimate → assigned device receives appointment.
- [ ] **B — Existing customer:** Reuse existing customer → choose another property → schedule estimate; verify no duplicate customer and no billing-address fallback.
- [ ] **C — Unavailable estimator:** Select unavailable/conflicting staff → review server rejection and quarter-hour alternatives → save eligible staff/time.
- [ ] **D — Mobile visit:** Confirm Estimate Visit badge/instructions/unit/access, record arrival/photo/notes, restart offline, complete and reconnect; verify one saved visit with quote needed in management.
- [ ] **E — Financial isolation:** Complete dedicated free estimate; ordinary invoice preview/create must reject it. No actual financial transaction.
- [ ] **F — Historical preservation:** Existing services, addresses, quote versions, invoices and mappings retain original values and behavior.
- [ ] Verify one separately authorized assignment push and tap on each target handset if fresh physical acceptance is requested. Provider transport is not certified by local outbox assertions.

Physical scenarios stay unchecked until performed. Native source changes require updated Android/iOS binaries; source push alone does not update an installed app. No paid EAS build is started by this release.

## Build instructions and scope limits

Use the existing local Android release workflow from `routeLogisticsMobile/android`:

```powershell
$env:NODE_ENV = 'production'
.\gradlew.bat :app:assembleRelease --no-daemon --max-workers=2 --console=plain '-PreactNativeArchitectures=arm64-v8a'
```

On the Mac, pull `main`, enter `routeLogisticsMobile`, run `npm ci` and `npm run ios:prepare`, then rebuild the existing Xcode workspace. Preserve corporate team `AXCZ2G99P6`, bundle `com.worksidesoftware.routelogisticsapp`, Expo owner `sjroy5` and existing EAS project. Android package/signing remains unchanged.

The matching directory is bounded at 5,000 company customers; above that it fails with review guidance rather than claiming an exhaustive match. Search results are limited to 30 candidates and the inquiry queue to 500 recent records with a visible limit indication. A larger indexed/paginated CRM is outside this bounded release. There is no automatic merge, public booking marketplace, native technician quote editor, jurisdiction tax engine, live payment activation or accounting synchronization activation.

Current intake links are canonical customer/property/inquiry/assignment IDs. Existing immutable quote versions and converted service-job IDs remain authoritative. Batch B can add the resulting quote/approved-version/service-job relationship to an estimate visit; this release does not invent those future records or claim a technician quote has already been prepared.

## Changed files

**Backend:**

- `functions/appointmentLinks.js`
- `functions/customerAddresses.js`
- `functions/customerIntake.js`
- `functions/estimates.js`
- `functions/index.js`
- `functions/invoices.js`
- `functions/offline.js`
- `functions/shared/appointments.js`
- `functions/shared/appointments.test.js`
- `functions/shared/customerLifecycle.js`
- `functions/workData.js`

**Web:**

- `routeLogisticsWeb/src/components/AppointmentKindBadge.jsx`
- `routeLogisticsWeb/src/components/CustomerLifecycleControl.jsx`
- `routeLogisticsWeb/src/components/InquiryWorkspace.jsx`
- `routeLogisticsWeb/src/components/JobFormModal.jsx`
- `routeLogisticsWeb/src/components/JobWorkDetails.jsx`
- `routeLogisticsWeb/src/components/ServicePropertyDirectory.jsx`
- `routeLogisticsWeb/src/pages/CalendarPage.jsx`
- `routeLogisticsWeb/src/pages/CustomerManagementPage.jsx`
- `routeLogisticsWeb/src/pages/DispatchPage.jsx`
- `routeLogisticsWeb/src/pages/JobManagementPage.jsx`
- `routeLogisticsWeb/src/services/customerService.js`
- `routeLogisticsWeb/src/services/inquiryService.js`
- `routeLogisticsWeb/src/services/jobChanges.js`
- `routeLogisticsWeb/src/services/jobManagementService.js`
- `routeLogisticsWeb/src/services/workspaceQueryPolicy.js`
- `routeLogisticsWeb/src/utils/appointmentKind.js`

**Mobile:**

- `routeLogisticsMobile/components/EstimateVisitOutcome.js`
- `routeLogisticsMobile/components/JobWorkflow.js`
- `routeLogisticsMobile/components/MobileUI.js`
- `routeLogisticsMobile/screens/ManagementScreen.js`
- `routeLogisticsMobile/scripts/estimateVisitOutcome.test.js`
- `routeLogisticsMobile/scripts/jobCompletion.test.js`
- `routeLogisticsMobile/scripts/jobWorkflow.test.js`
- `routeLogisticsMobile/scripts/managementScreens.test.js`
- `routeLogisticsMobile/scripts/mobileUI.test.js`
- `routeLogisticsMobile/scripts/workPresentation.test.js`
- `routeLogisticsMobile/scripts/workspaceNavigation.test.js`
- `routeLogisticsMobile/services/estimateVisitOperations.js`
- `routeLogisticsMobile/services/estimateVisitPolicy.js`
- `routeLogisticsMobile/services/jobCompletion.js`
- `routeLogisticsMobile/services/offline.js`
- `routeLogisticsMobile/services/workPresentation.js`

**Shared authorization, runners and regression tests:**

- `firestore.indexes.json`
- `firestore.rules`
- `package.json`
- `tests/browser/operations.spec.js`
- `tests/browser/prospect-intake.spec.js`
- `tests/customer-intake.ui.test.js`
- `tests/customerIntake.integration.test.js`
- `tests/dispatch-exceptions.ui.test.js`
- `tests/estimateAppointments.integration.test.js`
- `tests/firestore.rules.test.js`
- `tests/job-save-navigation.ui.test.js`
- `tests/job-scheduling.ui.test.js`
- `tests/serviceAreas.forms.ui.test.js`
- `tests/serviceAreas.rules.test.js`
- `tests/web-customer-access.ui.test.js`
- `tests/workspace-query.ui.test.js`

**Documentation:** this report, `docs/README.md`, the customer-to-payment workflow audit and master acceptance plan. No dependency lockfile or native identifier/signing configuration changed.
