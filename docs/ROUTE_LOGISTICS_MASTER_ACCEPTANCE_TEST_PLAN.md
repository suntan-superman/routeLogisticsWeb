# Route Logistics — Master Acceptance Test Plan

Acceptance baseline: **November 14, 2026 (America/Los_Angeles)**. Inspected application source: **332aa77** on existing **main**. This is the single operator acceptance procedure; it records current automated/read-only results separately from historical provider evidence and unperformed device/manual tests.

Use the existing production site, Firebase project and corporate TestFlight app for operator acceptance. Acceptance fixture writes occur **only in local emulators**, with no real customer email/SMS/push or financial/accounting transactions. Later implementation deployments and native configuration are recorded in dated addenda; customer records are preserved. Follow the case-specific permission and fixture prerequisites before later operator execution.

## A. Executive summary

Route Logistics has a tested field-work foundation suitable for a **controlled pilot after the short physical core workflow passes**. It is not yet certified across every browser, device, optional commercial feature or integration delivery path. Current automated results are recorded below; the original source/function inventory remains a dated acceptance baseline. Physical-device and genuine provider delivery acceptance remain separate.

Current browser coverage is **33 scenarios** (99 configured executions across Chromium, Firefox and WebKit). See the November 15 addenda below for execution evidence. Earlier evidence for the original 25 scenarios is retained, including the later clean 75/75 Jobs-date run. Physical iPhone/Android and genuine provider acceptance remain separate.

### November 15 — visible visit recording and completion feedback

Manual arrival/departure controls are amber before recording and green with a
checkmark and saved timestamp after a canonical manual record is acknowledged
or loaded from authorized history. GPS-only inferred events remain separate.
Explicit repeat recording preserves history; a new arrival returns the prior
departure control to pending. Failed/unconfirmed attempts retain their original
operation ID, remain retryable and cannot be discarded as if never sent.

Completion now opens a viewport-fixed JS dialog outside the work-order scroll
view. It names actual unsaved entries and offers keep editing, save drafts and
continue, or explicit discard of unsaved local drafts and continue. An untouched
blank product form no longer counts as a draft. Product applications, visit
records, photos and checklists are not mandatory completion prerequisites.
Required work description, optional-hours validation, authorization, assignment,
version and durable-queue conflict checks remain enforced. Validation errors,
save failures, saved-offline outcomes and synchronized success are visible in
the dialog. No native Modal or arbitrary presentation delay was added.

Final combined mobile validation passed **315/315**, Expo Doctor **18/18**, and
iOS bundle export. Tests cover saved/manual/cached visit state, repeat cycles,
failed and duplicate actions, no discarded uncertain visit, child save/discard,
partial checklist draft saves, visible feedback, keyboard/back/focus behavior,
stale-job callbacks and existing photo/completion guards. This mobile follow-up
does not claim a rerun of the web/provider suites below. Physical rebuilt
iPhone/Android acceptance remains Not Run.

### November 15 — assigned-job access instructions

The web JobForm Notes field is explicitly for shared gate codes and service
instructions. Authorized job reads now expose those saved notes as a distinct
read-only `dispatchNotes` value. Mobile Job Details shows **Job instructions**
below Service location, and web My Work shows the same instructions. Technician
work observations, customer service instructions and completion notes stay
separate. Private billing/customer notes, pricing and history remain restricted;
unassigned, foreign, revoked and unverified reads still fail closed.

PW-OPS-04 now verifies multiline instructions, an independent work-note editor,
private-note exclusion, close/reopen behavior and unchanged synthetic job data.
Mobile regressions cover selectable text, same-job instruction refresh without
discarding photo/work/completion drafts, another job's isolation, and offline
work-note overlays retaining dispatcher instructions. No production job or
customer record is rewritten. A native rebuild and physical-device check of the
new card remain required; no physical acceptance case is marked Pass here.

Results: **294/294 mobile**, **342/342 web**, **181 Functions passes/one existing
emulator-only skip**, **27/27 focused notes/access/field-parity/workflow emulator
cases**, and **3/3 updated PW-OPS-04 executions** (WebKit, Chromium, Firefox).
Both production web build and iOS bundle export passed. Lint retains the same
two existing hook warnings. The other 96 configured browser executions and
physical mobile acceptance were not rerun for this change.

### November 15 — office-only and field-enabled staff

Owners/managers can explicitly save **Can be assigned field work** from Team
Locations/Dispatch staff settings and mobile Management staff details. This
company/UID flag defaults to enabled for existing staff and is separate from
role, temporary leave, duty status and GPS consent. Office-only staff remain
visible with their existing assignments and permissions. New scheduling,
rescheduling, preferred plans, recurring fallbacks and nearest-staff assignment
recommendations exclude them. Current assigned work can still be completed.

PW-OPS-20 checks dirty-only save, the office-only badge, picker exclusion, a
forged assignment rejected by the real emulator callable, unchanged membership,
profile and existing job records, and explicit re-enabling followed by a valid
assignment. No production staff settings or customer records are changed by
automated acceptance. New mobile controls require a rebuild and physical
owner/manager acceptance; physical verification has not been marked Pass.

Results: **342/342 web**, **289/289 mobile**, **177 Functions passes/one existing
emulator-only skip**, **61/61 focused scheduling, availability, membership,
recurring-calendar and mobile-parity emulator cases**, and **3/3 PW-OPS-20 browser
executions** (WebKit, Chromium, Firefox). Expo Doctor passed **18/18** and iOS
bundle export passed. Production web build passed; lint retains only the two
existing hook warnings. The full 99 browser executions were not rerun.

### November 15 — distinguishable scheduling staff

The scheduling roster resolves missing membership names from the validated
member's same-company user profile and returns a normalized email. Assignment
options show `Name · email` and can be searched by either value. Missing names
fall back to email; existing membership IDs and assignment authorization are
preserved. No production membership or historical appointment is rewritten.

PW-OPS-19 covers otherwise identical profile names, memberships without names,
unique email search, selection of the correct membership, persisted assignment,
and reopening the saved job. Its fixtures run only in local emulators and do
not send messages or invoke external providers. This is browser verification,
not new physical mobile-device or provider acceptance.

Results: **337/337 web**, **176 Functions passes/one existing emulator-only
skip**, **44/44 focused scheduling/availability/membership emulator cases**, and
**3/3 PW-OPS-19 browser executions** (WebKit, Chromium, Firefox). Web build passed;
lint has zero errors and the two existing Calendar/Reports hook warnings. The
96 configured browser executions were not all rerun for this identity change.

### November 15 — Home duty button and shift dialog

The current duty status is now fixed at the right of the Home header: green
On Duty/red Off Duty after verification. A neutral Checking/Check Status handles
unknown reads. The explanation, permission choices, GPS freshness, and Start/End
controls are in an in-app dialog. No native modal is introduced; navigation,
camera/work-order drafts and permission operations retain their guards. Late
shift responses are fenced by account/company/role/request sequence.

Mobile **284/284**, iOS export and Android ARM64 release build passed. This is a
mobile-only follow-up; backend/web/provider suites below are earlier unchanged
coverage, not rerun claims. Operator-reported Android launch and cross-device
duty reporting preceded this UI revision. Its physical dialog/header acceptance
remains Not Run; no broader manual case has been marked Pass.

### November 15 — dual-mode mobile operations and temporary availability

Owners/managers now use one account for personal Field Mode and company
Management Mode. Admin operations follow their unchanged capability policy;
technicians have Field Mode only. Personal jobs/routes, the existing work-order
and offline workflow, per-user/company mode preference, shift consent and safe
draft navigation are retained. Management adds team overview/detail, selected-day
agenda, authorized native locations, routes and confirmed reassignment.

Owner/manager temporary availability supports sick/vacation/off-duty periods and
bounded emergency call-outs. Scheduling and alternatives enforce these periods
server-side; emergency availability never restores revoked company access or
starts GPS. Existing appointments remain for dispatcher review. See
[mobile operations](mobile-dual-mode-operations.md) for architecture, endpoint,
build and physical acceptance details. Native creation/full editing continue on
the geographically validated web workflow.

PW-OPS-17/18 add synthetic browser coverage for unavailable-period assignment
rejection and a bounded emergency override. These are emulator/browser checks,
not physical-device acceptance. New MOB-DM-01 through MOB-DM-06 remain Not Run
until executed on actual rebuilt iOS/Android devices. Results: **174 Functions passes/one existing skip; 335 web; 267 mobile**.
The broad Firestore/Storage run passed **440/440** and final targeted run
**38/38**, covering **447 distinct cases** including field parity and the last
three regressions. Chromium smoke passed **9/9**. The full three-engine browser
run passed **92/93**; Firefox PW-OPS-18 exposed a save/refresh reopening race.
The editor now remains disabled until its roster revision is current.
Corrected three-engine availability result: **6/6 passed after the fix (Chromium, Firefox, WebKit)**.
The initial failure is retained; this is not described as a clean 93/93 run.
Expo Doctor **18/18**, iOS export, local Android ARM64 release/signature check,
web lint/build passed (two existing lint warnings). No physical case is passed.

### November 15 — unified scheduling and typed-email deletion

Jobs/Calendar scheduling now includes technician selection, server-checked
conflicts and explicit quarter-hour alternatives. New recurring appointments
support weekly/monthly/quarterly calendar and weekday rules. The first visit and
plan are saved atomically with retry protection. Future reservations participate
in availability checks; generated visits recheck active staff and use the chosen
replacement/review policy. Offboarding reviews upcoming scheduled visits with
idempotent audits and resumable checkpoints. Existing history and legacy fixed-day
plans are preserved. Details: `docs/SCHEDULING_AND_RECURRENCE.md`.

PW-OPS-15 covers assignment during creation and a conflicting second visit with
an explicitly selected alternative. PW-OPS-16 covers weekly Thursday first-visit
creation, preferred technician/fallback and a future reservation before a job is
materialized. These extend the web portions of DSP-002/003/004/005; they do not
certify physical mobile delivery. The full Chromium run passed **29/29**; the two
new journeys also passed **6/6 across Chromium, Firefox and WebKit**. DSP-009 is
now an executed automated Pass instead of a source-gap Blocked case. No physical
or unexecuted operator case was marked Pass.

Mobile deletion now requires the full, initially empty signed-in email plus the
existing DELETE confirmation. Client and server check the current identity;
incorrect/partial/missing values have no deletion side effects. Accepted cleanup
receipts can still resume after sign-out. The full mobile suite passed **229/229**;
physical confirmation/cancellation requires a rebuilt native app. No real account
was deleted. Current evidence: **167 Functions passes/one existing skip**, **326
web**, **427 rules/integration** and **one real Auth-emulator deletion/retry**.
Web lint/build, Expo Doctor **18/18** and iOS export pass. Details are recorded in
`docs/SCHEDULING_AND_RECURRENCE.md`.

### November 15 — address validation and scheduling controls

Customer scheduling selection uses the green app theme. Web job, estimate-conversion,
service-plan and route-departure controls, plus native scheduling/edit/conversion
controls, offer quarter-hour choices. Existing odd-minute records are preserved.

New or changed customer/service addresses require server Google validation,
including unconfigured service territories and independent workspaces. Confirmed
postal-format and ZIP enrichment is accepted automatically without blocking Save.
Physical street/unit corrections require explicit review. Invalid/unavailable
results retain drafts; unchanged historical appointments are preserved. Direct
Firestore writes cannot forge physical addresses, coordinates or Google proof.
Atomic permanent updates replace old validation metadata and retain audit history.

Current automated evidence: **287/287 web**, **224/224 mobile**, **144 Functions
passes/one existing skip**, and **125/125 focused emulator cases**. The broader
rules/integration run passed **374/375**; its sole failure was an expired frozen
login timestamp in a deletion/ownership test fixture. The fixture now mocks its
clock without changing authorization. The final affected-file rerun passed
**28/28**, including that test and the new permanent-validation-metadata regression.
Web lint/build, Expo Doctor **18/18**, dependency compatibility and iOS export pass.
All 27 distinct Chromium scenarios passed across the full and focused runs.
PW-OPS-10 through PW-OPS-14 passed **15/15 across Chromium, Firefox and WebKit**,
including green selection, quarter-hour choices and one-off/permanent addresses.
The original full run had one label assertion include a decorative checkmark;
the corrected label assertion passed in all three engines. Other Firefox/WebKit
cases were not rerun. Details are in `docs/JOB_ADDRESS_EDITING.md`.

One read-only Google Address Validation request for Google's public campus address
returned **HTTP 200**, complete **PREMISE** validation/geocoding and no unconfirmed
components. This provider check did not read or modify customer data. Emulator
tests use synthetic, tenant-private verified fixtures and make no provider calls.

Physical acceptance remains required after rebuilding: select quarter-hour times,
cancel/reopen the picker, review invalid/corrected addresses, and verify one-visit
versus explicitly permanent changes. No physical/manual case is newly marked Pass.

| Cases | Pass | Fail | Blocked | Not Run | Dated historical live/provider Pass |
| --- | --- | --- | --- | --- | --- |
| 161 | 45 | 0 | 7 | 109 | 9 |

The 45 Pass results include current automated/read-only checks (including newly automated DSP-009) and **nine dated historical provider/live checks**. A historical Pass proves only the named prior scenario. The 109 Not Run cases still require manual/operator execution; seven Blocked entries are scoped feature/prerequisite gaps, including overlapping Android readiness entries. Case counts are acceptance scenarios, not individual automated test counts.

| Classification | Current evidence | Acceptance limit |
| --- | --- | --- |
| Deployment evidence | Original function inventory and dated provider/deployment receipts below; current release checks in the scheduling note | Active metadata/HTTP 200 does not prove every business action |
| Current automated regression | Functions174 pass/1 existing skip; web335; rules/integration440 broad +38 focused (447 distinct); earlier typed-email Auth-emulator1 | Emulators/test transports are not provider or physical-device delivery |
| Mobile regression | 284/284 pass including duty header/dialog, dual-mode and existing deletion/workflow guards; Android ARM64 build and iOS export pass | Physical camera/deletion acceptance remains separate and requires a rebuilt app |
| Browser regression | Smoke9/9; full matrix92/93; corrected availability 6/6 passed after the fix (Chromium, Firefox, WebKit) | Initial Firefox save/refresh race retained in evidence; physical/manual cases unchanged |
| Historically provider-verified | Stripe test settlement; QuickBooks sandbox writes/tax/payments; Twilio delivered/STOP/START; iOS push/tap; portal OTP and review email/submission | Dates and exact scenarios in Section G; no new provider transaction/message in this run |
| Physical acceptance outstanding | Current installed build, camera/gallery/reopen, assigned-job completion, offline restart/sync, background GPS, push app states | Execute Section F with synthetic work before using real pilot visits |
| Source gaps / intentionally off | Native manager geography forms, industry selector, discounts, full native CRM; live Stripe/QB production/broad SMS/review automation off | Use supported web workflows and scoped pilot limits; do not weaken backend authorization |
| External accounting acceptance outstanding | Genuine Intuit-origin sandbox-change webhook has not been correlated at RL | Blocks genuine webhook acceptance only; does not block unrelated pest/pool field operations |

Highest practical risks are losing confidence in untested native camera/offline behavior, accepting an unknown installed TestFlight build, and expecting native manager scheduling/estimate forms to work under configured service territories. Use web scheduling/estimates for the pilot. There is no confirmed current S1 data-loss or cross-tenant defect in this run; unperformed physical tests remain acceptance gates rather than invented defects.

**DEF-JOBS-DATE is resolved in production web release `176bb244b33c394601fd176dfa46c05fa4df0ad5`, verified November 14, 2026 at 6:57 PM Pacific.** Strict ISO date-only values now retain their calendar day in the Jobs table and details. Actual timestamps retain their previous local-time conversion. Stored scheduling values were not changed. The original reproduction remains in `.migration/job-date-display-audit.json`; the corrected regression and deployment evidence are below. No invoice-date defect is inferred.

Run the core pest workflow first: confirm identities/build, schedule one synthetic assigned job on web, observe it on iPhone, start a shift, capture/select a photo, complete/reopen it, exercise a small offline/restart/sync sequence, inspect portal/review privacy, and end the shift. Repeat the industry checklist with a separate pool fixture after its authorized identities exist. Review optional accounting/CMS/browser coverage afterward.

## B. Test environment

| Setting | Exact value / current evidence |
| --- | --- |
| Production web | https://route-logistics.com |
| Staff login / dispatch / work | /login; /dispatch; /my-work |
| Customer / review / platform admin | /portal; /review (private fragment link); /platform-admin |
| Firebase project | mi-factotum-field-service (existing project; shared-name resources retained) |
| Function region / codebase | us-central1 / routelogistics; no deploy required for acceptance documentation |
| Existing Acme tenant | Acme Pest Control — z7DJMjeigjG64YfN4H5h |
| Inspected source | main, 332aa77; record later acceptance/Playwright commit separately |
| Native source version | 1.0.0; Expo ~54.0.38; React Native 0.81.5; React 19.1.0 |
| iOS identity | com.worksidesoftware.routelogisticsapp; Apple corporate team AXCZ2G99P6 |
| Expo / EAS | sjroy5; a6b5d885-dd99-4435-bef0-b7ffe09a2890; production store/Release profile with remote auto-increment |
| Android identity | com.workside.routelogistics (preserved) |
| Installed iOS build | Not verified in this run. Historical inspected binary 1.0.0 (2) had no Git commit hash; source buildNumber=1 is not installed-build proof |
| QuickBooks sandbox | Sandbox Company_US_1, realm 9341455727000797; existing Acme connection preserved |
| Metadata snapshot | November 14, 4:31 PM Pacific; .migration/acceptance-production-inventory.json |
| Public read snapshot | November 14, 4:38 PM Pacific; .migration/acceptance-public-read.json |

Use distinct browser profiles for staff and customers. A portal OTP identity is independent of a same-email staff account. Do not paste passwords, one-time codes, invitation fragments, auth headers, private file URLs, provider credentials or device tokens into evidence.

| Runtime flag | Current deployed value |
| --- | --- |
| RL_APP_URL | https://route-logistics.com |
| RL_EMAIL_ENABLED | true |
| RL_EMAIL_FROM | notifications@worksidesoftware.com |
| RL_STRIPE_ENABLED | true |
| RL_STRIPE_MODE | test |
| RL_STRIPE_LIVE_APPROVED | false |
| RL_QB_ENABLED | true |
| RL_QB_ENV | sandbox |
| RL_QB_WRITES_ENABLED | false |
| RL_QB_PRODUCTION_APPROVED | false |
| RL_SMS_ENABLED | false |
| RL_SMS_LIVE_APPROVED | false |
| RL_SMS_PILOT_ENABLED | true |
| RL_REVIEW_INVITATIONS_ENABLED | false |

These flags are a current metadata snapshot, not authority to send another message. A bounded SMS pilot also requires the intended recipient, independent purpose consent, provider suppression check, unexpired duration and remaining budget. Preserve QuickBooks sandbox/write restrictions, Stripe test mode and broad customer messaging off.

### Role and identity matrix

| Identity / role | Existing verified availability | Permitted acceptance scope / limits |
| --- | --- | --- |
| Platform admin — sroy@worksidesoftware.com | Current Auth verified, non-disabled; explicit platform grant | /platform-admin and public content management; not the Acme owner. Owner/customers do not inherit platform access |
| Acme owner — sroy@prologixsa.com | Current Auth verified, non-disabled; actual company owner and matching owner claims | Company/team/integrations/financial settings and approved synthetic fixtures only; do not change legitimate memberships or real coverage |
| Acme manager — acme-manager@route-logistics.com | Current active manager membership and claims; verified/non-disabled | Work/CRM/scheduling/estimates/plans/dispatch/operations/reviews; no ownership/team/integration management or invoice/financial reporting access |
| Acme technician — tech3@route-logistics.com | Current active technician membership and claims; verified/non-disabled | Assigned job/customer context, own route/location and job work; no customer CRUD, company/team create, estimates, finances or integrations |
| Admin role | No additional real acceptance login designated | Use emulator role fixture for exhaustive checks; operational/finance access, no owner/team/ownership management and no reviews.manage |
| Synthetic pest owner / mutable staff | Not created by this plan | Needed for settings/membership/territory mutation cases that must not alter real Acme configuration |
| Synthetic pool owner and technician | Not created; authorized controlled mailboxes must be chosen | Use a genuinely separate synthetic provider and explicitly approved invitation role; do not pretend an existing test fixture owner UID is a sign-in account |
| Customer — one provider | Controlled mailbox/fixture to be chosen before manual run | Normal email OTP and current association; fresh message requires recipient authorization |
| Customer — two providers | Controlled mailbox and two synthetic associations to be chosen | One portal identity; two distinct providers; duplicate customer rows grouped inside provider |
| Customer — revoked association | Dedicated mutable synthetic association | Revoke only this fixture; old reads/files/payment/review access must fail safely |
| Unauthenticated visitor | No account needed | Published public content and public login shells only; bounded secure link required for review/estimate data |
| Reserved dispatcher / solo | Dispatcher profile is reserved/disabled; solo means genuinely unassociated independent workspace | Use approved manager as dispatcher. Losing a company membership must not create a solo owner |

Source policy is `functions/shared/capabilities.json` (staff policy v3), `routeLogisticsMobile/services/workspacePolicy.js` and the web/mobile capability gates. Company Setup can be readable by all staff while owner edits remain restricted; Service Areas is an explicit owner/manager exception. The technician should never gain company creation merely from seeing a route shell.

| Required device / browser | Coverage to record |
| --- | --- |
| Windows desktop Chrome | Actual browser/version; normal keyboard/mouse; 1440×900 desktop |
| Windows Microsoft Edge | Actual Edge installation/version, not a renamed Chromium user agent |
| iPhone Safari | Physical device/iOS version; OTP/files/reviews/estimate link; phone keyboard and orientation |
| Corporate TestFlight iPhone app | Installed version/build/source provenance; iOS permission state; foreground/background/locked/terminated push and location behavior |
| Android Chrome | Physical Android browser/version; customer portal and responsive forms |
| Android native | When a build/handset and FCM v1 configuration are available; browser emulation does not satisfy native acceptance |
| Responsive harness | 390×844 phone, 768×1024 tablet, 1440×900 desktop; record simulated versus real device |

### Implemented web module inventory

| Module | Navigation | Source capability / behavior |
| --- | --- | --- |
| Authentication and workspace | /login; /signup; /accept-invite | Password, staff email code, reset, verification, remember email, invitation acceptance, active workspace gate. |
| Company configuration | /company-setup | Owner wizard: Basic Info, Services/categories, Team, Branding/colors/logo URL; service areas separately owner/manager. |
| Estimate templates | /estimate-templates | Tenant-scoped create/view/edit/duplicate/delete, activation and usage statistics. |
| Customer CRM | /customers | Create/update contacts and notes, local search/filter/sort/pagination, CSV preview/import/export, inactive/restore and SMS consent. |
| Jobs and service evidence | /jobs; /my-work | Create/edit/manage assignment/status; technician assigned-work projection; job photos, service checklists and chemical records. |
| Calendar | /calendar | Day, Week, WorkWeek, Month and Agenda views with form-based scheduling. |
| Dispatch | /dispatch | Date/member/status/area filters, assignment, status markers, details dialog, nearest on-duty staff, duty/freshness separation, 30-second refresh. |
| Routes and team locations | /routes; /team-locations | Daily routes, Google Routes calculation/order save, approximate map address lookup, navigation and shift roster/location policy. |
| Recurring plans | /service-plans | Create/activate/deactivate plans, frequency, first date and deterministic manual/scheduled job generation; service log export. |
| Reports | /reports | Owner/admin financial reports; managers get embedded OperationsReportsPage counts/list without balances/history. |
| Notifications | /notifications | Latest 100 current-user/current-company job notifications, read acknowledgement and job navigation. |
| Estimates and PDFs | /estimates; /estimate-approval | Photo estimates for customers/prospects, labor/material lines, server totals/tax, versioned private PDFs, email approval and idempotent conversion. |
| Invoicing and payments | /invoices; /portal | Invoice creation/status, Stripe test readiness/payment UI/history and protected customer payment access. |
| QuickBooks and SMS configuration | /integrations | Owner QuickBooks OAuth, searchable accounting defaults, mappings and guarded export/reconciliation; SMS settings/consent gates. |
| Customer portal and verified reviews | /portal; /review; /reviews | OTP multi-provider services/files/invoices/history; one verified review per visit, responses/notes/moderation and separate publication permission. |
| Platform CMS and SEO | /platform-admin; /faqs; /faqs/:slug; /testimonials; /testimonials/:slug; /success-stories; /success-stories/:slug; /sitemap.xml; /robots.txt | Explicit platform grant, FAQ/testimonial/story drafts/preview/publish/archive, images, revisions, SEO/canonical/OG and crawler-readable public projection. |

### Complete web route inventory — 32 route entries

The route allow-list describes page access; server actions, current membership and technician assignment checks remain authoritative. A readable Company Setup or integrations summary is not permission to mutate its owner-only fields.

| Route | Gate / staff capability | Staff roles | Access notes |
| --- | --- | --- | --- |
| /login | Public staff password/email-code/reset page; eye control and local remembered-email option. | Separate/public identity as noted | Public staff password/email-code/reset page; eye control and local remembered-email option. |
| / | jobs.read | owner, admin, manager, technician | Anonymous marketing landing; authenticated non-technician dashboard; technician My Work. |
| /my-work | jobs.work | owner, admin, manager, technician | Verified staff + active company/solo workspace + route capability |
| /dispatch | dispatch.manage | owner, admin, manager | Verified staff + active company/solo workspace + route capability |
| /signup | Public account registration; a pending invited member cannot create an independent workspace. | Separate/public identity as noted | Public account registration; a pending invited member cannot create an independent workspace. |
| /accept-invite | Public shell; valid invitation, matching verified account and explicit acceptance required. | Separate/public identity as noted | Public shell; valid invitation, matching verified account and explicit acceptance required. |
| /portal | Independent customer email-OTP identity, not the staff session. Live provider associations required. | Separate/public identity as noted | Independent customer email-OTP identity, not the staff session. Live provider associations required. |
| /review | Public shell; secure expiring fragment token required to load/submit a single completed-visit review. | Separate/public identity as noted | Public shell; secure expiring fragment token required to load/submit a single completed-visit review. |
| /reviews | reviews.manage | owner, manager | Verified staff + active company/solo workspace + route capability |
| /platform-admin | Public shell/login prompt; verified email and explicit active rlPlatformAdmins grant. Company roles do not grant access. | Separate/public identity as noted | Public shell/login prompt; verified email and explicit active rlPlatformAdmins grant. Company roles do not grant access. |
| /faqs | Public published content; unpublished/missing content is unavailable | Separate/public identity as noted | Netlify serves crawler-readable rlPublicContent HTML for public routes; React PublicContentPage is the SPA implementation. |
| /faqs/:slug | Public published content; unpublished/missing content is unavailable | Separate/public identity as noted | Netlify serves crawler-readable rlPublicContent HTML for public routes; React PublicContentPage is the SPA implementation. |
| /testimonials | Public published content; unpublished/missing content is unavailable | Separate/public identity as noted | Netlify serves crawler-readable rlPublicContent HTML for public routes; React PublicContentPage is the SPA implementation. |
| /testimonials/:slug | Public published content; unpublished/missing content is unavailable | Separate/public identity as noted | Netlify serves crawler-readable rlPublicContent HTML for public routes; React PublicContentPage is the SPA implementation. |
| /success-stories | Public published content; unpublished/missing content is unavailable | Separate/public identity as noted | Netlify serves crawler-readable rlPublicContent HTML for public routes; React PublicContentPage is the SPA implementation. |
| /success-stories/:slug | Public published content; unpublished/missing content is unavailable | Separate/public identity as noted | Netlify serves crawler-readable rlPublicContent HTML for public routes; React PublicContentPage is the SPA implementation. |
| /estimate-approval | Public shell; secure expiring version-bound estimate fragment token required. | Separate/public identity as noted | Public shell; secure expiring version-bound estimate fragment token required. |
| /estimates | estimates.manage | owner, admin, manager | Verified staff + active company/solo workspace + route capability |
| /privacy | Public privacy information. | Separate/public identity as noted | Public privacy information. |
| /notifications | company.read | owner, admin, manager, technician | Verified staff + active company/solo workspace + route capability |
| /routes | routes.read | owner, admin, manager, technician | Verified staff + active company/solo workspace + route capability |
| /team-locations | locations.viewTeam | owner, admin, manager | Verified staff + active company/solo workspace + route capability |
| /integrations | integrations.read | owner, admin | Verified staff + active company/solo workspace + route capability |
| /company-setup | company.read | owner, admin, manager, technician | Verified staff + active company/solo workspace + route capability |
| /customers | customers.manage | owner, admin, manager | Verified staff + active company/solo workspace + route capability |
| /estimate-templates | estimates.manage | owner, admin, manager | Verified staff + active company/solo workspace + route capability |
| /jobs | jobs.schedule | owner, admin, manager | Verified staff + active company/solo workspace + route capability |
| /reports | reports.operations | owner, admin, manager | Verified staff + active company/solo workspace + route capability |
| /calendar | jobs.schedule | owner, admin, manager | Verified staff + active company/solo workspace + route capability |
| /invoices | invoices.read | owner, admin | Verified staff + active company/solo workspace + route capability |
| /service-plans | plans.manage | owner, admin, manager | Verified staff + active company/solo workspace + route capability |
| * | Redirect unknown app paths to / | Separate/public identity as noted | Redirect unknown app paths to / |

Additional server public routes outside the 32 React entries: `/sitemap.xml` and `/robots.txt`. Published content is served as crawler-readable HTML through `rlPublicContent`; missing articles return 404. The wildcard SPA redirect is distinct from the published-content 404.

### Mobile screens and panels — 27 inventory entries

This includes native screens/panels, the web-only portal/review entry points, and the explicitly unmounted legacy SplashScreen component. It is not a claim of 27 independent native navigation routes.

| Screen / panel | Exact navigation | Role / gate | What it accesses / limit |
| --- | --- | --- | --- |
| Loading/session retry | App launch | All | Theme/session loader; retry error; no stale unauthorized workspace |
| LoginScreen | App launch → Sign in | Unauthenticated | Password eye, staff email-code OTP, remember email only, forgot password; no automatic invitation acceptance |
| SignUpScreen | Login → Create account | Unauthenticated | Create own Auth identity; invited account joins only through explicit invitation and verification. No role or company escalation |
| EmailVerificationScreen | Authenticated but unverified | Unverified staff | Send/check verification or sign out; protected data gated |
| WorkspaceAccessScreen | Verified account without active workspace | Pending/revoked/unassociated | Invitation link, access refresh and sign out; does not accept automatically or allow technician to create a company |
| WorkspaceScreen | Authenticated active workspace | Owner/admin/manager/technician/solo | Retained Home/Schedule/Route/Settings pages with keyed user/company/role/membership; selected job overlay and unsaved-work guard |
| TechnicianHomeScreen | Home | Technician | Assigned work, status/shift/sync and open work order; no business CRUD or financial cards |
| HomeScreen | Home | Owner/admin/manager/solo | Schedule, customers and estimates management links plus work locations and saved work. Native scheduling has a geography/customer association contract gap; use web scheduling for pilot |
| Customers panel | Manager Home → Customers | jobs.schedule capability | Customer list/Add/Delete; rendered search and edit controls currently have no handlers. Full search/update workflow belongs to web CRM |
| Schedule service panel | Manager Home → Schedule service | jobs.schedule capability | Name/service/date/time/duration/cost/notes form; lacks customerId, validated property and service-category payload; blocked for configured-territory creation |
| ScheduleScreen | Schedule → Day/Week/Month → job | Active staff/solo | Company or assigned-scope chronological work, refresh, completed/cancelled history |
| RouteScreen | Route → stop → Navigate/Open job | Active staff/solo | Own daily route ordered stops and external maps handoff; max100/truncation; no in-app route map |
| JobWorkflow | Home/Schedule/Route → assigned work order | Authorized job viewer; work mutation requires current role/assignment | Single inline details/photos/completion workflow; customer contact, navigation, notes, checklist, photo retries, service applications, arrival/departure/access-blocked events |
| JobPhotos | Work order → Photos → Camera/Gallery | Authorized job worker/viewer | One native picker lifecycle; selected URI retained, durable queued copy before discard, upload/error/retry, authenticated existing-photo bytes |
| Completion review | Work order → Complete → Review → Confirm | Authorized current job worker | Required work performed, optional hours, stable operation ID, duplicate lock, live/current assignment/version checks, visible queued/success/conflict/error |
| FieldWorkTools | Work order → Notes / Chemical application / Visit evidence | Authorized current job worker | Pest chemical fields, job notes, manual or permissioned GPS arrival/departure/access-blocked events. Visits require connectivity; notes/application queue offline |
| ServiceChecklist | Work order → Service checklist | Manager assigns version; authorized worker saves report | Pest and pool required/typed fields, images and equipment/tasks, immutable versioned reports, cached template offline validation |
| WorkLocation | Home → Work shift → Manage → Start/End shift | Active staff with locations.shareOwn | Explicit shift/tracking consent, separate background choice, on-duty availability independent of GPS/job status, current policy display |
| OfflineStatus | Home/work order → Saved work | Current scoped user | Queued/uploading/synced/failed/conflict states, retry/discard, proposed/current values; only current tenant/user/membership queue processes |
| EstimatesScreen | Manager Home → Estimates | estimates.manage capability | Versioned estimate/photo/line item/PDF/sign-off workflows. Native service-property geography inputs not implemented; use web for configured-territory creation |
| SettingsScreen | Settings | Active staff/solo | Own name/formatted phone/language/preferences, locally stored System/Light/Dark, read-only company profile and native notifications. Owner company edit opens web; no tech company mutation |
| NativePushSettings | Settings → Native work notifications | Verified active company account on physical device | Refresh/Enable/Disable native notifications, OS permission and assignment/schedule/status preferences; private scoped token/installation |
| ServiceSelectionScreen | Solo Settings → Manage services | Solo workspace only | Own service categories; not a company technician service editor |
| Customer portal | https://route-logistics.com/portal | Separate customer OTP identity | Provider discovery/switching, grouped duplicate customer associations, tenant service/photo/PDF/invoice/payment history and reviews |
| Customer review invitation | https://route-logistics.com/review#... (private link; do not log token) | Valid completed-visit invitation holder | All honest ratings/on-time/comments, optional public permission, synthetic warning, one-time submit; token removed from visible URL/history |
| Provider reviews | https://route-logistics.com/reviews | Company owner or manager only | Rating/date/service/status filters, response/internal follow-up/moderation audit and invitation settings; source has no native Reviews screen |
| SplashScreen legacy component | Not mounted as a navigable page | None | Do not count as active workflow or infer old stack/modal architecture from stale docs |

### API and SDK access inventory

Appendix 1 below lists every one of the 100 deployed Cloud Function exports, including callable endpoints, HTTP webhooks, Firestore triggers, schedulers and the nine generated stamp triggers. All were ACTIVE at the metadata snapshot. Callable SDK endpoints require the Firebase callable envelope/auth/App Check or endpoint-specific checks; an active URL is not anonymous CRUD permission.

A separate access class is the **browser Firebase SDK → Firestore/Storage**. Some CRM, job, invoice, company and template reads/writes use existing client SDK services and security rules rather than a dedicated function per operation. Inventory/authorization coverage therefore includes `routeLogisticsWeb/src/services`, `firestore.rules`, `storage.rules` and server-owned projections/private collections. No assumption that every app action is a REST endpoint is valid.

## C. Test data

Choose one run label before any later mutation, for example **RL-ACCEPT-20261114-OP01**. Prefix each synthetic customer/provider/job/estimate/invoice/content title with it. Keep a private local fixture ledger containing IDs, tenant, approved roles, before/after snapshots, creation timestamps, message consent/budget and cleanup status. Do not commit controlled recipient details beyond the existing authorized identity list or put private links/codes in screenshots.

| Fixture alias | What to prepare through existing authorized tooling/UI | Use / safety |
| --- | --- | --- |
| PEST-SYNTH | Synthetic customer and zero-value scheduled/completed jobs under approved Acme staff, or a separate synthetic provider when changing settings | Never edit legitimate Acme customers/jobs/memberships/territories; use web manager scheduling |
| PEST-SETTINGS-SYNTH | Separate synthetic pest provider with a genuine approved owner login and mutable staff member | Required for branding/team/role/territory changes; current run creates none |
| POOL-SYNTH | Separate synthetic pool provider, owner/technician, Pool Maintenance category and pinned pool checklist | Current identities do not exist; choose controlled mailboxes and explicitly approve roles before invitations |
| C-SINGLE / C-MULTI / C-REVOKED | Controlled customer mailbox(es); one-provider, two-provider and dedicated revocable associations | Choose mailbox(es) explicitly. Customer OTP access cannot be borrowed from staff claims. Record every fresh authorized email |
| PROP-IN | 1600 Amphitheatre Parkway, Mountain View, CA 94043 | Public reference property and operating location for synthetic provider only; ZIP 94043; radius 1 mile |
| PROP-OUT | 1 Infinite Loop, Cupertino, CA 95014 | Public out-of-area reference for the same 1-mile test policy; not a customer address |
| J-PEST-ONE / J-POOL-ONE | Two assigned synthetic visits with known local date/time/category/template and no real customer recipient | Record job IDs/version/status; reuse for schedule, photo, completion, portal and history checks |
| J-OFFLINE | Separate disposable assigned job with cached checklist and harmless image | Retain pending local files/queue until acknowledgment. Never uninstall/clear storage while pending |
| EST-ONE | Synthetic customer/prospect estimate; labor 1.5×$100, materials 2×$25, tax 7.5% | Expected subtotal $200, tax $15, total $215. No discounts/negative line-price workaround |
| INV-TEST | Dedicated synthetic invoice from a synthetic job, no actual paid status | Any future Stripe action must be test-only, same test account and known amount; no new provider charge needed to reuse prior evidence |
| CONTENT-FAQ / STORY-DRAFT | Factual FAQ draft; clearly synthetic private testimonial/story; harmless owned image | Do not publish fictional testimonial/case study/review. Temporary factual FAQ publication needs its case approval |
| REVIEW-ONE | Eligible synthetic completed visit and normal synthetic customer association | Always synthetic/private; consumed historic invitation cannot be reused; review SMS needs separate purpose consent |
| MSG-PILOT | Only previously authorized recipient ending 1154, if consent/budget/time still valid and a new send is approved | No messages to other customers. Previous four-purpose consent excludes review-invitation |
| QB-HISTORICAL | Preserved sandbox certification records for RL-CERT-1411ac01 | Customer59; item10; invoices145/146; payments147/148. Read prior evidence; do not re-export/create/pay merely for this plan |

Initial migration baseline was 507 legacy Acme customers; later synthetic acceptance fixtures are separate. This run made no customer writes and did not perform a fresh full customer-record checksum. Before later mutations, record an appropriate read-only count/ID or scoped snapshot baseline, and verify legitimate records remain unchanged. Do not claim today’s total must still be exactly 507.

Keep contact/billing addresses distinct from service-property addresses. Eligibility must use the validated service property, never phone GPS or billing fallback. Do not auto-expand a territory from existing records. Use the same synthetic work for multiple cases to avoid unnecessary geocoding, messages, exports and repeated data setup.

Cleanup means archive/deactivate only a case-created fixture through its supported workflow, restore only recorded synthetic settings, end test shifts, stop bounded pilots and retain audit/payment/review history. Do not delete valid active memberships, automatically accept invitations, bypass verification, clear local pending work, or remove shared Firebase resources.

## D. Step-by-step test cases

Status vocabulary: **Pass**, **Fail**, **Blocked**, **Not Run**. Pass applies only to the explicit actual result and evidence class. Automated Pass never substitutes for the separately listed operator steps. Blocked marks an unsupported feature, unavailable prerequisite or unresolved external acceptance; it is not an app-wide failure. After execution, replace Actual result/status with the real observation, timestamp, device/build, sanitized evidence reference and cleanup outcome.

Exact paths below are relative to https://route-logistics.com unless a native or local-shell path is specified. Preconditions are binding: when a synthetic identity, explicit recipient approval, owner setting permission or physical device is missing, leave the relevant case Not Run and record that prerequisite. Do not attempt mutations with a convenient real customer record.

| Phase / case group | Cases | Pass | Fail | Blocked | Not Run |
| --- | --- | --- | --- | --- | --- |
| Environment and identity baseline | 3 | 3 | 0 | 0 | 0 |
| Phase 3 — Platform administration, CMS and public content | 8 | 1 | 0 | 0 | 7 |
| Phase 4 — Onboarding and company settings | 9 | 1 | 0 | 1 | 7 |
| Phase 5 — Geographic service areas | 9 | 3 | 0 | 0 | 6 |
| Phase 6 — Customer CRM | 7 | 1 | 0 | 0 | 6 |
| Phase 7 — Scheduling, dispatch and routes | 11 | 0 | 0 | 1 | 10 |
| Phase 8 — Native iOS work execution | 16 | 1 | 0 | 1 | 14 |
| Phase 9 — Offline durability and recovery | 9 | 1 | 0 | 0 | 8 |
| Phase 10 — Multi-provider customer portal | 10 | 4 | 0 | 0 | 6 |
| Phase 11 — Verified reviews and feedback | 12 | 7 | 0 | 1 | 4 |
| Phase 12 — Estimates, approval and PDFs | 11 | 1 | 0 | 1 | 9 |
| Phase 13 — Invoices and Stripe test payments | 9 | 4 | 0 | 0 | 5 |
| Phase 14 — QuickBooks sandbox | 8 | 4 | 0 | 1 | 3 |
| Phase 15 — SMS and push integrations | 10 | 6 | 0 | 1 | 3 |
| Phase 16 — Security and access control | 10 | 7 | 0 | 0 | 3 |
| Phase 17 — Browser and device coverage | 13 | 0 | 0 | 1 | 12 |

### Environment and identity baseline

#### ENV-001 — Current deployed infrastructure and safety flags

- **Test ID:** ENV-001
- **Feature/module:** Current deployed infrastructure and safety flags
- **Preconditions:** Existing production project metadata access; do not access or display secret payloads.
- **User role:** Codex/operator read-only metadata
- **Exact navigation path:** Firebase project mi-factotum-field-service → Route Logistics Functions metadata
- **Execution / evidence class:** automated; Current production metadata
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Compare every source export in functions/index.js with current deployed function metadata.
2. Read only selected nonsecret runtime flags and Maps API/billing/key-restriction metadata.
3. Record the timestamp and distinguish active deployment from untested behavior.

- **Expected result:** All Route Logistics source functions are active. Stripe stays test-only; QuickBooks stays sandbox with writes and production approval false; broad SMS and review automation stay disabled. Shared Firebase/browser credentials are preserved.
- **Actual result:** November 14, 2026, 4:31 PM Pacific: all 100 source exports were ACTIVE. Stripe enabled=true/mode=test/liveApproved=false; QuickBooks enabled=true/env=sandbox/writes=false/productionApproved=false; broad SMS enabled=false/liveApproved=false/pilot=true; review invitations=false; email=true. Maps JavaScript, Routes, Geocoding and Address Validation APIs and billing were enabled; the dedicated browser key was referrer-restricted to the production domain/www and API-restricted to Maps JavaScript/Routes. No provider requests or secret payload reads were made.
- **Status:** **Pass**
- **Evidence reference:** `.migration/acceptance-production-inventory.json`; `.migration/acceptance-api-inventory.json`
- **Cleanup instructions:** None: read-only metadata inspection.

#### IDN-001 — Existing acceptance identities

- **Test ID:** IDN-001
- **Feature/module:** Existing acceptance identities
- **Preconditions:** Existing Firebase Auth and membership metadata access; no passwords, tokens or account creation.
- **User role:** Codex/operator read-only metadata
- **Exact navigation path:** Firebase Auth + company ownership/teamMembers + explicit rlPlatformAdmins grant
- **Execution / evidence class:** automated; Current production metadata
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Look up the four previously authorized existing staff identities by email.
2. Confirm verified/non-disabled Auth status, company ownership or active role and platform grant separately.
3. Record identity availability without treating it as an interactive login or granting another role.

- **Expected result:** The four existing designated accounts are available with their approved roles. Platform administration is independent of Acme ownership. Pool/customer test identities are not invented.
- **Actual result:** Current metadata confirms verified, non-disabled sroy@worksidesoftware.com with explicit platform-admin access; sroy@prologixsa.com is the Acme owner; acme-manager@route-logistics.com has active manager membership/claims; tech3@route-logistics.com has active technician membership/claims. The platform administrator is not the Acme owner. No new account, membership, invitation or credential was created.
- **Status:** **Pass**
- **Evidence reference:** `.migration/acceptance-production-inventory.json`
- **Cleanup instructions:** None: read-only metadata inspection.

#### ENV-002 — Published public read and crawler rendering

- **Test ID:** ENV-002
- **Feature/module:** Published public read and crawler rendering
- **Preconditions:** Unauthenticated HTTP GETs only; existing published factual content.
- **User role:** Unauthenticated read-only visitor
- **Exact navigation path:** https://route-logistics.com → public content, sitemap and missing FAQ URL
- **Execution / evidence class:** automated; Current production read-only HTTP
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Read production /, /privacy, /faqs, /testimonials, /success-stories, login/portal/review/admin shells, /sitemap.xml and /robots.txt.
2. Inspect one existing published FAQ for server-rendered title, canonical, JSON-LD and sitemap membership.
3. Read a deliberately missing public article and record its response.

- **Expected result:** Public routes and shells respond without authentication; published factual content is crawler-readable and missing articles return 404. A public SPA shell does not reveal protected data or prove authenticated workflows.
- **Actual result:** November 14, 4:38 PM Pacific: all twelve requested public routes/shells returned HTTP 200. /faqs/customer-portal-sign-in had the expected title, canonical and structured data and appeared in /sitemap.xml. The missing public article returned 404. A later read-only production browser check also confirmed correct titles and noindex,nofollow on /portal and /platform-admin. No authentication, content changes or private record reads occurred. Broader private-route/header and interactive accessibility checks remain separate Not Run cases.
- **Status:** **Pass**
- **Evidence reference:** `.migration/acceptance-public-read.json`; `.migration/playwright-production-read.json`
- **Cleanup instructions:** None: read-only public GETs.

### Phase 3 — Platform administration, CMS and public content

#### CMS-001 — Verified platform administrator sign-in

- **Test ID:** CMS-001
- **Feature/module:** Platform administration
- **Preconditions:** Existing explicit platform grant; approved test inbox if an email code/verification is needed.
- **User role:** Platform administrator
- **Exact navigation path:** /login?next=%2Fplatform-admin → /platform-admin
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Sign in with the existing platform-admin account using its normal password or an explicitly authorized fresh staff email code.
2. Confirm the account email is verified; open /platform-admin and refresh access once.
3. Record the dashboard identity and FAQ/testimonial/story counts without capturing credentials.

- **Expected result:** Explicitly granted account opens the platform dashboard; verification alone does not confer the grant.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/PlatformAdminPage.jsx:17`; `tests/platformCms.integration.test.js:19`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### CMS-002 — Ordinary company roles are denied platform access

- **Test ID:** CMS-002
- **Feature/module:** Platform administration
- **Preconditions:** Separate browser profiles or sign out fully between existing role identities.
- **User role:** Company owner; manager; technician
- **Exact navigation path:** /platform-admin
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Open /platform-admin as an ordinary owner with no platform grant.
2. Repeat for manager and technician; use only read/access checks.
3. Return to the permitted role’s normal workspace and confirm no content data appeared.

- **Expected result:** Each ungranted role receives Platform access required; company roles do not inherit platform privileges.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `tests/platformCms.integration.test.js:19`; `tests/platformCms.rules.test.js:38`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### CMS-003 — Factual FAQ draft, edit, preview and dirty-state controls

- **Test ID:** CMS-003
- **Feature/module:** Platform administration
- **Preconditions:** A factual acceptance FAQ approved by the operator; unique acceptance slug; no invented customer story.
- **User role:** Platform administrator
- **Exact navigation path:** /platform-admin → FAQs → New FAQ
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. Create a draft factual FAQ and save once.
2. Change its title/body, preview the draft and confirm public URL is unavailable.
3. Verify unchanged Save is disabled; edit and attempt to change content type, then keep editing.
4. Save the revision and inspect Content audit history.

- **Expected result:** Draft remains private; preview reflects unsaved input; discard guard and save confirmation behave correctly; history retains revisions.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/PlatformAdminPage.jsx:149`; `tests/platformCms.integration.test.js:31`; `tests/platformCms.ui.test.js`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### CMS-004 — Factual FAQ publish, SEO, sitemap and archive

- **Test ID:** CMS-004
- **Feature/module:** Public content and SEO
- **Preconditions:** CMS-003 saved draft; explicit approval to publish this factual FAQ temporarily.
- **User role:** Platform administrator; unauthenticated visitor
- **Exact navigation path:** /platform-admin → FAQs; /faqs/{approved-slug}; /sitemap.xml
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. Set SEO title, description, canonical URL and Open Graph text; save Published.
2. Open its public URL in a signed-out window and inspect View Source for title/meta/canonical/structured data.
3. Confirm the published URL is listed in /sitemap.xml.
4. Archive the same FAQ; refresh its public URL and sitemap.

- **Expected result:** Crawler-readable factual content has correct canonical/metadata; archive removes public access and sitemap inclusion while preserving audit history.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `functions/publicContent.js`; `netlify.toml:10`; `tests/platformCms.integration.test.js:31`
- **Cleanup instructions:** Archive the acceptance FAQ through the CMS; preserve its audit history. Never archive an existing legitimate published FAQ.

#### CMS-005 — Testimonial draft and authenticity publication safeguards

- **Test ID:** CMS-005
- **Feature/module:** Platform administration
- **Preconditions:** Seeded clearly synthetic draft or authentic permission-backed customer content. No fabricated testimonial may be published.
- **User role:** Platform administrator
- **Exact navigation path:** /platform-admin → Testimonials
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Open the synthetic draft; edit permitted private fields and preview it.
2. Confirm its synthetic warning and unavailable Published option.
3. For an authentic record only, inspect the explicit authenticity confirmation/evidence controls without inventing evidence.
4. Exercise invalid publication attempts only in the emulator regression.

- **Expected result:** Synthetic feedback never publishes; real publication requires documented authenticity and permission; private evidence is not exposed publicly.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `tests/platformCms.integration.test.js:54`; `routeLogisticsWeb/src/pages/PlatformAdminPage.jsx:177`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### CMS-006 — Success-story draft, slug and metadata

- **Test ID:** CMS-006
- **Feature/module:** Platform administration
- **Preconditions:** Clearly synthetic unpublished story fixture or an authentic documented story; approved unique slug.
- **User role:** Platform administrator
- **Exact navigation path:** /platform-admin → Success stories
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Open/edit the private fixture, including title, summary, slug, story body and SEO fields.
2. Preview at desktop and phone widths.
3. Save Draft then Archived and inspect revisions.
4. Do not select Published for a synthetic narrative.

- **Expected result:** Private editing, preview and audit work for success stories; no synthetic experience reaches public /success-stories routes.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/PlatformAdminPage.jsx:149`; `tests/platformCms.integration.test.js:54`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### CMS-007 — CMS image upload and alt text

- **Test ID:** CMS-007
- **Feature/module:** Platform administration
- **Preconditions:** Saved synthetic/private content record; a harmless owned JPEG/PNG/WebP under 2 MB with no customer/private information.
- **User role:** Platform administrator
- **Exact navigation path:** /platform-admin → saved FAQ/testimonial/story → Content image
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Enter descriptive alt text and upload the allowed image.
2. Save the content and view its private preview.
3. Remove the image reference, save and inspect history.
4. Run MIME spoof/SVG/oversize/cross-content rejection in the emulator, not against real published content.

- **Expected result:** Allowed private image uploads display with alt text; draft image access remains protected; invalid images are rejected with an actionable error.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `tests/platformCms.integration.test.js:68`; `tests/platformCms.integration.test.js:77`; `tests/platformCms.rules.test.js:53`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### CMS-008 — CMS authorization, revisions and private projections regression

- **Test ID:** CMS-008
- **Feature/module:** Platform administration
- **Preconditions:** Root local demo emulator suite run; no production mutation.
- **User role:** Codex/local emulator
- **Exact navigation path:** Local: npm run test:rules + npm run test:web
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run the platform CMS integration/rules/UI suites.
2. Confirm explicit grant revocation, concurrent version checks, unique slugs, image privacy and authenticity test cases pass.
3. Record current run command/count/log reference.

- **Expected result:** Only verified explicit admins can mutate; stale writes cannot overwrite; browser identities cannot access private documents; drafts and synthetic content do not publish.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. This is automated coverage only; no corresponding physical/manual procedure is claimed complete.
- **Status:** **Pass**
- **Evidence reference:** `tests/platformCms.integration.test.js`; `tests/platformCms.rules.test.js`; `tests/platformCms.ui.test.js`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Stop local emulators; no production cleanup.

### Phase 4 — Onboarding and company settings

#### ONB-001 — Password/email-code login and remembered email

- **Test ID:** ONB-001
- **Feature/module:** Authentication and onboarding
- **Preconditions:** Known existing account; any code/reset email requires an explicitly approved recipient.
- **User role:** Existing owner or manager
- **Exact navigation path:** /login
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Sign out; verify the password eye control and successful first-attempt password sign-in.
2. Select Remember me, sign out, reopen /login and verify only the email is retained.
3. Clear Remember me and repeat.
4. When separately authorized, exercise Email code and use a fresh code once; never share it in evidence.

- **Expected result:** Login succeeds without a second-attempt permission race; password visibility is deliberate; remembered email is local and does not store a password.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/LoginPage.jsx:12`; `tests/staffLogin.integration.test.js`; `routeLogisticsWeb/src/utils/rememberedEmail.test.js`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### ONB-002 — Profile and branding persistence

- **Test ID:** ONB-002
- **Feature/module:** Company onboarding
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage.
- **User role:** Synthetic company owner
- **Exact navigation path:** /company-setup → Basic Info; Branding
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 7 minutes
- **Test steps:**

1. Record the synthetic company’s baseline name/contact/address and branding.
2. Change only the synthetic profile, choose permitted colors and an owned HTTPS logo URL.
3. Save, reload and confirm name/contact/logo/colors are retained.
4. Revert all test settings and confirm unchanged Save state.

- **Expected result:** Owner changes persist with clear confirmation; logo uses a URL input, not an assumed upload feature; original company data is untouched.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/CompanySetupPage.jsx:53`; `routeLogisticsWeb/src/pages/CompanySetupPage.jsx:478`; `tests/sms.ui.test.js:91`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### ONB-003 — Explicit industry selector availability

- **Test ID:** ONB-003
- **Feature/module:** Company onboarding
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage.
- **User role:** Synthetic company owner
- **Exact navigation path:** /company-setup → Basic Info / Services
- **Execution / evidence class:** manual; Source/configuration gap or missing external acceptance
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Look for a company industry selector distinguishing pest-control from pool service.
2. Record available alternatives: service categories and per-job pinned industry service templates.

- **Expected result:** Record the missing selector honestly; do not claim free-form service categories are an implemented industry selection control.
- **Actual result:** Source inspection: no industry field/selector is implemented. Services exposes free-form categories. This is a scope gap, not a newly executed live UI failure.
- **Status:** **Blocked**
- **Evidence reference:** `routeLogisticsWeb/src/pages/CompanySetupPage.jsx:53`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### ONB-004 — Pest and pool service-category configuration

- **Test ID:** ONB-004
- **Feature/module:** Company onboarding
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage.
- **User role:** Synthetic pest owner; synthetic pool owner
- **Exact navigation path:** /company-setup → Services
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. For pest fixture add a category such as General Pest Control; save and reopen.
2. For pool fixture add Pool Maintenance; save and reopen.
3. Confirm categories remain tenant-specific and are available where service-area category choices are shown.
4. Remove only the categories created for this case after dependent synthetic jobs are retired.

- **Expected result:** Categories persist under the correct provider without crossing tenants; they do not automatically change history or attach an industry checklist.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/CompanySetupPage.jsx:344`; `tests/serviceAreas.ui.test.js`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### ONB-005 — Invitation, approved role and explicit acceptance

- **Test ID:** ONB-005
- **Feature/module:** Staff onboarding
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage. Any email/push recipient and message count must be explicitly authorized before this case; otherwise leave the sending step Not Run. No customer SMS campaigns.
- **User role:** Synthetic company owner; invited test technician/manager
- **Exact navigation path:** /company-setup → Team → invitation link → /accept-invite
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 10 minutes
- **Test steps:**

1. Confirm the intended role before sending an invitation to a controlled existing/test account.
2. Open the valid invitation in the matching verified account; accept explicitly.
3. Refresh access on web/mobile and confirm one active membership and correct restricted navigation.
4. Reissue only where necessary; record delivery status separately from receipt.

- **Expected result:** Acceptance binds the invited verified account and approved role; no automatic acceptance or duplicate team row is created.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `tests/workflows.integration.test.js:26`; `tests/workflows.integration.test.js:73`; `routeLogisticsWeb/src/pages/AcceptInvitePage.jsx`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### ONB-006 — Role change and deactivation propagation

- **Test ID:** ONB-006
- **Feature/module:** Staff onboarding
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage. A dedicated mutable membership; do not change Luis or another legitimate active membership.
- **User role:** Synthetic company owner; dedicated synthetic member
- **Exact navigation path:** /company-setup → Team
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. Record the test member’s current role/status.
2. Change technician to the explicitly approved manager role, refresh both sessions and verify only manager permissions.
3. Deactivate that test member and attempt a harmless workspace read.
4. Restore the recorded approved role/status only if the operator wants the test identity retained.

- **Expected result:** Live membership changes govern access; stale tokens do not retain authority; deactivation preserves the member/audit history.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `tests/access.integration.test.js:59`; `tests/firestore.rules.test.js:281`; `functions/security.js:54`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### ONB-007 — Manager and technician settings restrictions

- **Test ID:** ONB-007
- **Feature/module:** Company configuration
- **Preconditions:** Existing active role accounts; no production changes required.
- **User role:** Synthetic manager; technician
- **Exact navigation path:** /company-setup
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Open /company-setup as manager; verify the profile/team owner-managed message and permitted Service Areas section.
2. Repeat as technician and confirm no company/team editing or owner controls.
3. Attempt read-only deep links to /integrations and /reviews using each role and record the expected role matrix.

- **Expected result:** Company profile/team governance stay owner-only; manager service areas/reviews follow explicit permissions; technician has no administrative routes.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/CompanySetupPage.jsx:607`; `functions/shared/capabilities.json`; `routeLogisticsWeb/src/utils/routeAccess.js`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### ONB-008 — Separate estimate-template CRUD and job checklist assignment

- **Test ID:** ONB-008
- **Feature/module:** Service and estimate templates
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage.
- **User role:** Synthetic owner or manager
- **Exact navigation path:** /estimate-templates; /jobs → test job details → Service checklist
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. Create, view, edit and duplicate a clearly named estimate template; verify unchanged Save is disabled.
2. Confirm Company Setup → Templates remains the Coming Soon summary, not an alternate working editor.
3. Open a synthetic pest/pool job and assign the appropriate existing Service checklist template; verify its pinned version.
4. Do not assume the photo-estimate composer automatically applies saved estimate templates.

- **Expected result:** Standalone estimate-template CRUD and per-job checklist assignment work independently; existing versions/history remain preserved.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `tests/editable-modals.ui.test.js:25`; `tests/serviceForms.integration.test.js`; `routeLogisticsWeb/src/pages/CompanySetupPage.jsx:554`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### ONB-009 — Destructive governance adversarial regression

- **Test ID:** ONB-009
- **Feature/module:** Ownership and membership security
- **Preconditions:** Demo emulator only. Never transfer a real company for this acceptance run.
- **User role:** Codex/local emulator
- **Exact navigation path:** Local: tests/workflows.integration.test.js + tests/access.integration.test.js
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run owner transfer/recent-login/admin-target tests, stale role denial and invited-user workspace-gate tests.
2. Verify outgoing access is preserved only as the intended admin and incoming owner is the actual company owner.

- **Expected result:** Ownership cannot be inferred from a team label; invalid invitations/roles fail closed; duplicate or revoked links cannot activate extra memberships.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. This is automated coverage only; no corresponding physical/manual procedure is claimed complete.
- **Status:** **Pass**
- **Evidence reference:** `tests/workflows.integration.test.js:61`; `tests/access.integration.test.js:119`; `tests/firestore.rules.test.js:57`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Stop emulators; retain test logs only.

### Phase 5 — Geographic service areas

#### GEO-01 — Service areas: configuration and operating location

- **Test ID:** GEO-01
- **Feature/module:** Service areas: configuration and operating location
- **Preconditions:** A synthetic provider selected; its current coverage is recorded; no real provider coverage will be changed.
- **User role:** Synthetic provider owner
- **Exact navigation path:** /company-setup → Service Areas
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Record configured/revision state and all toggles before editing. Enter the public operating address 1600 Amphitheatre Parkway, Mountain View, CA 94043.
2. Choose ZIP-code coverage with 94043; leave public sharing, accepting-new-customers and out-of-area approval off. Save once.
3. Confirm success feedback, disabled unchanged Save, server-normalized operating address, and saved coverage preview. Reload and compare.

- **Expected result:** Only the selected provider has a validated saved operating location and territory; typing alone does not issue paid lookups; no historic customer/job record changes.
- **Actual result:** Not executed against the production UI or device in this acceptance run.
- **Status:** **Not Run**
- **Evidence reference:** `functions/serviceAreas.test.js`; `tests/serviceAreas.integration.test.js`; `tests/serviceAreas.workflows.integration.test.js`; `tests/serviceAreas.rules.test.js`; `docs/provider-service-areas.md`
- **Cleanup instructions:** Retain the marked synthetic fixture for audit. Restore only its saved baseline settings when specified. Do not delete or change existing customer, membership, job, or financial records.

#### GEO-02 — Service areas: ZIP inside/outside and explicit service property

- **Test ID:** GEO-02
- **Feature/module:** Service areas: ZIP inside/outside and explicit service property
- **Preconditions:** Synthetic provider configured with ZIP 94043; synthetic customer has a billing address deliberately different from its service property.
- **User role:** Synthetic owner or manager
- **Exact navigation path:** /jobs → Add Job → Service property → Check service property
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 7 minutes
- **Test steps:**

1. Enter 1600 Amphitheatre Parkway, Mountain View, CA 94043 as the explicit service property and check eligibility.
2. Change only the service property to 1 Infinite Loop, Cupertino, CA 95014 and check again.
3. Confirm outside warning, then try saving without an owner exception. Do not change the customer billing address to obtain eligibility.

- **Expected result:** 94043 is covered and 95014 is outside; the outside request is rejected server-side. Eligibility uses the service property, not billing address or device GPS.
- **Actual result:** Not executed against the production UI or device in this acceptance run.
- **Status:** **Not Run**
- **Evidence reference:** `functions/serviceAreas.test.js`; `tests/serviceAreas.integration.test.js`; `tests/serviceAreas.workflows.integration.test.js`; `tests/serviceAreas.rules.test.js`; `docs/provider-service-areas.md`
- **Cleanup instructions:** Retain the marked synthetic fixture for audit. Restore only its saved baseline settings when specified. Do not delete or change existing customer, membership, job, or financial records.

#### GEO-03 — Service areas: radius preview and property checks

- **Test ID:** GEO-03
- **Feature/module:** Service areas: radius preview and property checks
- **Preconditions:** Only the synthetic provider will change; the two public addresses in GEO-02 are available.
- **User role:** Synthetic provider owner
- **Exact navigation path:** /company-setup → Service Areas → Radius from operating location
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Switch saved coverage to radius and set one mile from the validated operating address. Save.
2. Show coverage map; confirm circle is centered at the saved operating location and lists the saved radius.
3. Check the operating property as inside and the Cupertino property as outside. Hide/show preview and reload settings.

- **Expected result:** Saved radius and preview agree; known inside/outside properties receive clear results. Preview changes only after a successful save.
- **Actual result:** Not executed against the production UI or device in this acceptance run.
- **Status:** **Not Run**
- **Evidence reference:** `functions/serviceAreas.test.js`; `tests/serviceAreas.integration.test.js`; `tests/serviceAreas.workflows.integration.test.js`; `tests/serviceAreas.rules.test.js`; `docs/provider-service-areas.md`
- **Cleanup instructions:** Retain the marked synthetic fixture for audit. Restore only its saved baseline settings when specified. Do not delete or change existing customer, membership, job, or financial records.

#### GEO-04 — Service areas: exact boundary and malformed geographic input

- **Test ID:** GEO-04
- **Feature/module:** Service areas: exact boundary and malformed geographic input
- **Preconditions:** Local demo emulators; no production credentials or provider Maps calls.
- **User role:** Codex using local emulator fixtures
- **Exact navigation path:** Repository root → npm run test:rules; npm run test:functions
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run the existing distance/ZIP/radius unit and integration tests.
2. Inspect test cases for the exact radius boundary, invalid/NaN/out-of-range coordinates, missing address, unvalidated provider response and ZIP+4 normalization.
3. Record command, source commit, pass/fail counts and any failure evidence in Section E.

- **Expected result:** Boundary is inclusive, malformed property data fails closed, and forged client coordinates/eligible flags cannot authorize work.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. No new provider write, transaction, message or physical-device action was performed for this case.
- **Status:** **Pass**
- **Evidence reference:** `functions/serviceAreas.test.js`; `tests/serviceAreas.integration.test.js`; `tests/serviceAreas.workflows.integration.test.js`; `tests/serviceAreas.rules.test.js`; `docs/provider-service-areas.md`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Emulator fixtures only; stop emulators after the shared suite. No production cleanup.

#### GEO-05 — Service areas: service-category overrides

- **Test ID:** GEO-05
- **Feature/module:** Service areas: service-category overrides
- **Preconditions:** The synthetic provider offers at least two catalog categories; base ZIP is 94043.
- **User role:** Synthetic provider owner/manager
- **Exact navigation path:** /company-setup → Service Areas → Service-category overrides
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Add an override for one existing offered category using ZIP 95014 and save.
2. Check the Cupertino property for that category, then for another offered category.
3. Check behavior with a missing/unknown category; remove the synthetic override and restore the baseline after recording evidence.

- **Expected result:** The named category uses its override, other offered categories use base coverage, and missing/unknown category cannot silently bypass an override.
- **Actual result:** Not executed against the production UI or device in this acceptance run.
- **Status:** **Not Run**
- **Evidence reference:** `functions/serviceAreas.test.js`; `tests/serviceAreas.integration.test.js`; `tests/serviceAreas.workflows.integration.test.js`; `tests/serviceAreas.rules.test.js`; `docs/provider-service-areas.md`
- **Cleanup instructions:** Retain the marked synthetic fixture for audit. Restore only its saved baseline settings when specified. Do not delete or change existing customer, membership, job, or financial records.

#### GEO-06 — Service areas: explicit owner exception and manager restriction

- **Test ID:** GEO-06
- **Feature/module:** Service areas: explicit owner exception and manager restriction
- **Preconditions:** Outside property from GEO-02; owner is available; the optional out-of-area setting is enabled only for the synthetic company.
- **User role:** Synthetic manager followed by owner
- **Exact navigation path:** /jobs → Add Job → Service property; /company-setup → Service Areas
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. As manager, check the outside property and verify a warning rather than an approval control.
2. As owner, open the same intended synthetic job, check that property, enter an explicit acceptance-test reason and approve it.
3. Save once; record that the owner approval is property/category/workflow/revision bound. Do not change the territory to make the test pass.

- **Expected result:** Managers cannot grant an exception; a current owner can approve a specific validated outside property without widening coverage. Invalid addresses cannot receive exceptions.
- **Actual result:** Not executed against the production UI or device in this acceptance run.
- **Status:** **Not Run**
- **Evidence reference:** `functions/serviceAreas.test.js`; `tests/serviceAreas.integration.test.js`; `tests/serviceAreas.workflows.integration.test.js`; `tests/serviceAreas.rules.test.js`; `docs/provider-service-areas.md`
- **Cleanup instructions:** Retain the marked synthetic fixture for audit. Restore only its saved baseline settings when specified. Do not delete or change existing customer, membership, job, or financial records.

#### GEO-07 — Service areas: boundary changes preserve established work

- **Test ID:** GEO-07
- **Feature/module:** Service areas: boundary changes preserve established work
- **Preconditions:** Emulator synthetic existing job, established recurring plan and configured policy.
- **User role:** Codex using local emulator fixtures
- **Exact navigation path:** Repository root → npm run test:rules
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run existing workflow test cases for a boundary shrink and policy revision change.
2. Verify ordinary notes/date/status edits and established recurring continuations remain valid.
3. Verify newly created jobs/plans, changed properties, estimate conversion and stale unused exceptions are checked against the current policy.

- **Expected result:** Existing appointments/history/plans are preserved while new or geographically changed work cannot use stale eligibility.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. No new provider write, transaction, message or physical-device action was performed for this case.
- **Status:** **Pass**
- **Evidence reference:** `functions/serviceAreas.test.js`; `tests/serviceAreas.integration.test.js`; `tests/serviceAreas.workflows.integration.test.js`; `tests/serviceAreas.rules.test.js`; `docs/provider-service-areas.md`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Emulator only.

#### GEO-08 — Service areas: private coverage and tenant/role enforcement

- **Test ID:** GEO-08
- **Feature/module:** Service areas: private coverage and tenant/role enforcement
- **Preconditions:** Emulator owner, manager, admin, technician, stranger and customer contexts.
- **User role:** Codex using local emulator fixtures
- **Exact navigation path:** Repository root → npm run test:rules
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run private policy/cache/exception/audit read/write denial tests and direct work-write bypass tests.
2. Run manager revocation, company/catalog revision and owner-transfer transaction fences.
3. Confirm technician/cross-company requests fail before a paid geocode.

- **Expected result:** Private coverage stays server mediated; only owner/manager settings updates are allowed; owner-only exceptions and tenant isolation survive races.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. No new provider write, transaction, message or physical-device action was performed for this case.
- **Status:** **Pass**
- **Evidence reference:** `functions/serviceAreas.test.js`; `tests/serviceAreas.integration.test.js`; `tests/serviceAreas.workflows.integration.test.js`; `tests/serviceAreas.rules.test.js`; `docs/provider-service-areas.md`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Emulator only.

#### GEO-09 — Service areas: accepting-new-customers and future public foundation

- **Test ID:** GEO-09
- **Feature/module:** Service areas: accepting-new-customers and future public foundation
- **Preconditions:** The synthetic provider is used; public marketplace is not implemented.
- **User role:** Synthetic provider owner; Codex emulator helper
- **Exact navigation path:** /company-setup → Service Areas; functions/serviceAreas.js checkForWorkflow
- **Execution / evidence class:** mixed; Operator/manual acceptance — not executed
- **Hands-on estimate:** 4 minutes
- **Test steps:**

1. Save accepting-new-customers off, reload, and confirm the setting persists; restore its synthetic baseline.
2. Use existing emulator public-request/booking purpose tests for disabled/unconfigured coverage and service-category checks.
3. Confirm no public discovery/booking or anonymous address-lookup route is claimed as delivered by this release.

- **Expected result:** Future public helper fails closed when provider coverage/acceptance is unavailable; existing internal scheduling is preserved. Publication preference does not publish coverage by itself.
- **Actual result:** Not executed against the production UI or device in this acceptance run.
- **Status:** **Not Run**
- **Evidence reference:** `functions/serviceAreas.test.js`; `tests/serviceAreas.integration.test.js`; `tests/serviceAreas.workflows.integration.test.js`; `tests/serviceAreas.rules.test.js`; `docs/provider-service-areas.md`
- **Cleanup instructions:** Retain the marked synthetic fixture for audit. Restore only its saved baseline settings when specified. Do not delete or change existing customer, membership, job, or financial records.

### Phase 6 — Customer CRM

#### CRM-001 — Create and update a synthetic customer

- **Test ID:** CRM-001
- **Feature/module:** Customer CRM
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage.
- **User role:** Synthetic owner, admin or manager
- **Exact navigation path:** /customers → Add Customer → View/Edit
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Create a clearly prefixed synthetic customer with controlled inbox/no real phone recipient, contact address and private notes.
2. Verify the form confirmation and view the saved contact fields.
3. Edit phone/email/address and save; refresh to confirm persistence.
4. Keep billing/contact address separate from service property in subsequent job/estimate tests.

- **Expected result:** Customer fields normalize and save correctly under the correct tenant; no service territory is inferred from contact address.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/services/customerService.js:33`; `tests/editable-modals.ui.test.js`; `tests/serviceAreas.workflows.integration.test.js`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### CRM-002 — Unsaved edits, duplicate taps and error recovery

- **Test ID:** CRM-002
- **Feature/module:** Customer CRM
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage.
- **User role:** Synthetic owner or manager
- **Exact navigation path:** /customers → synthetic customer → Edit
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Change a harmless synthetic note; confirm Save is enabled only after a change.
2. Cancel/Escape/navigate away, choose Keep editing and verify inputs remain.
3. Save while a controlled local browser offline simulation is active; verify visible error and retained draft.
4. Reconnect and retry once; verify only the intended record changed.

- **Expected result:** No silent save failure or duplicate creation; discard confirmation protects input and successful retry clears dirty state.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `tests/editable-modals.ui.test.js`; `tests/customerPortal.ui.test.js`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### CRM-003 — Search, filters, load-more and role-scoped export

- **Test ID:** CRM-003
- **Feature/module:** Customer CRM
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage.
- **User role:** Synthetic owner/admin; manager
- **Exact navigation path:** /customers
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 7 minutes
- **Test steps:**

1. Load more customers if the synthetic record is outside the initially loaded rows; confirm the loaded-row search warning. Search by synthetic name, email and phone; clear search and test Active/Inactive plus sorting.
2. If enough synthetic rows exist, use Load more customers and verify stable rows/counts; these are loaded-row filters rather than server-wide search.
3. As a permitted export role, export only the controlled data scope; inspect CSV safely.
4. As manager confirm customers.export is not granted; never export private production customer data for evidence.

- **Expected result:** Search/filter/load-more are consistent within loaded rows; export respects the role matrix and current tenant.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/services/customerService.js:106`; `routeLogisticsWeb/src/services/customerService.js:344`; `functions/shared/capabilities.json`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### CRM-004 — CSV preview, repeated import and duplicate identity handling

- **Test ID:** CRM-004
- **Feature/module:** Customer CRM
- **Preconditions:** CSV containing two clearly synthetic customers, a repeated normalized email, one invalid row and no real contact data.
- **User role:** Synthetic owner/admin
- **Exact navigation path:** /customers → CSV import
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 7 minutes
- **Test steps:**

1. Preview without importing; record reported row/validation errors.
2. Correct the invalid row and import once.
3. Repeat the same controlled import once and inspect results/counts.
4. Confirm duplicate customer identities are distinguished from legitimate separate household/service records; do not assume manual create enforces unique email.

- **Expected result:** Import is additive and idempotent by its supported identity rule, validation is visible, and no foreign tenant row is overwritten.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `tests/workflows.integration.test.js:94`; `routeLogisticsWeb/src/components/CustomerImport.jsx`; `routeLogisticsWeb/src/utils/customerCsv.test.js`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### CRM-005 — Soft deactivation and restoration

- **Test ID:** CRM-005
- **Feature/module:** Customer CRM
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage.
- **User role:** Synthetic owner/admin/manager
- **Exact navigation path:** /customers → synthetic row → Delete/deactivate; Inactive filter → Restore
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Record the synthetic customer ID and linked synthetic job IDs.
2. Use the normal delete/deactivate action and inspect the Inactive filter.
3. Verify customer/history rows still exist; access revocation is covered separately in portal tests.
4. Restore through the supported Restore action and verify the original ID remains.

- **Expected result:** Normal customer deletion is soft deactivation; restoration does not duplicate the row or erase service history.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/services/customerService.js:213`; `routeLogisticsWeb/src/pages/CustomerManagementPage.jsx:226`
- **Cleanup instructions:** Leave the synthetic customer inactive unless another acceptance case needs it. Never invoke permanentlyDeleteCustomer.

#### CRM-006 — Customer history and service-specific files

- **Test ID:** CRM-006
- **Feature/module:** Customer CRM
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage. A synthetic completed job with private test photos and a published test PDF/document association.
- **User role:** Synthetic owner/manager; authorized test customer
- **Exact navigation path:** /customers → View; /jobs → search test customer → Details; /portal
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. Inspect Customer Details contact/status/notes and aggregate Total Jobs; do not expect an unimplemented CRM timeline.
2. Open Jobs and search the same synthetic customer to inspect service history and job photos/checklist.
3. In the authorized customer portal, inspect only intentionally shared photos/documents for that provider.

- **Expected result:** The supported service-specific routes show the correct customer/job history; private files remain inaccessible to unauthorized users.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/CustomerManagementPage.jsx:832`; `tests/portal.integration.test.js`; `tests/access.integration.test.js:85`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### CRM-007 — CRM tenant isolation and field projection regression

- **Test ID:** CRM-007
- **Feature/module:** Customer CRM
- **Preconditions:** Root emulator regression; no real record IDs used for adversarial writes.
- **User role:** Codex/local emulator
- **Exact navigation path:** Local: tests/access.integration.test.js + tests/firestore.rules.test.js
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run cross-tenant, technician field projection, manager financial exclusion and customer-write denial test cases.
2. Verify membership/tenant changes cannot be bypassed by forged owner labels or client companyId.

- **Expected result:** Foreign customers cannot be read/changed; technicians get only assigned safe fields, and role limits remain independent from UI navigation.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. This is automated coverage only; no corresponding physical/manual procedure is claimed complete.
- **Status:** **Pass**
- **Evidence reference:** `tests/access.integration.test.js:40`; `tests/access.integration.test.js:51`; `tests/firestore.rules.test.js:151`; `tests/firestore.rules.test.js:181`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Local emulators only.

### Phase 7 — Scheduling, dispatch and routes

#### DSP-001 — Role-specific dashboard and operational reports

- **Test ID:** DSP-001
- **Feature/module:** Dashboard and reports
- **Preconditions:** Existing role identities; synthetic jobs in each status; no mutations needed.
- **User role:** Synthetic owner/admin; manager; technician
- **Exact navigation path:** /; /reports
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Open / as owner/admin and manager, then technician.
2. Compare dashboard counts to known synthetic fixtures; confirm technician lands in My Work.
3. Open /reports as manager to inspect operational status counts/list without financial balances.
4. Confirm owner/admin financial reports remain separate and technician /reports is denied.

- **Expected result:** Each role gets the intended dashboard/report projection; operational counts are not mistaken for financial certification.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/HomePage.jsx`; `routeLogisticsWeb/src/pages/ReportsPage.jsx:505`; `tests/access.integration.test.js:51`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### DSP-002 — One-time job create/edit and service property

- **Test ID:** DSP-002
- **Feature/module:** Scheduling
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage. Any email/push recipient and message count must be explicitly authorized before this case; otherwise leave the sending step Not Run. No customer SMS campaigns. Configured service area or explicitly recorded unconfigured-policy state.
- **User role:** Synthetic owner/admin/manager
- **Exact navigation path:** /jobs → New Job → Schedule Job
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. Select the synthetic customer, service type, date/time, duration and explicit service property/category.
2. Schedule once and confirm its ID/status/tenant/property.
3. Reopen Edit, change a harmless note and date/time, enter a reason if asked, save and refresh.
4. Verify duplicate click/unchanged form behavior without creating extra jobs.

- **Expected result:** Exactly one intended job is saved; current geographic rules are enforced server-side; ordinary historical edits retain valid context.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/components/JobFormModal.jsx:170`; `tests/editable-modals.ui.test.js:39`; `tests/serviceAreas.workflows.integration.test.js`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### DSP-003 — Assign/reassign and observe web-to-mobile delivery

- **Test ID:** DSP-003
- **Feature/module:** Dispatch
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage. Any email/push recipient and message count must be explicitly authorized before this case; otherwise leave the sending step Not Run. No customer SMS campaigns. Current corporate TestFlight app available for the authorized test technician.
- **User role:** Synthetic owner or manager; two authorized test technicians
- **Exact navigation path:** /jobs → New Job → Assigned technician; or /dispatch → service date → Assigned to
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 10 minutes
- **Test steps:**

1. Assign the synthetic job to technician A; observe mobile refresh without restarting.
2. Reassign to technician B and refresh both technicians’ queues.
3. Confirm A loses access and B gains the correct job; record elapsed refresh times.
4. Return assignment to the intended test identity if later cases need it.

- **Expected result:** Current assignment governs list/detail access; web and mobile agree, and any push goes only to an explicitly authorized test device.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `tests/access.integration.test.js:72`; `functions/workData.js:121`; `routeLogisticsWeb/src/pages/DispatchPage.jsx:146`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### DSP-004 — Calendar views and supported form scheduling

- **Test ID:** DSP-004
- **Feature/module:** Calendar
- **Preconditions:** Synthetic one-time and recurring jobs with known local dates and durations.
- **User role:** Synthetic owner/admin/manager
- **Exact navigation path:** /calendar
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 7 minutes
- **Test steps:**

1. Inspect Day, Week, WorkWeek, Month and Agenda around the synthetic service date.
2. Open an event and verify customer, property, status and time.
3. Create/edit through the supported form and refresh Dispatch.
4. Confirm dragging/resizing is intentionally disabled rather than marking the missing drag interaction a defect.

- **Expected result:** Views render correct local service dates/durations; form edits persist; no silent drag/drop rescheduling occurs.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/CalendarPage.jsx:255`; `tests/editable-modals.ui.test.js`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### DSP-005 — Create plan and generate the next visit once

- **Test ID:** DSP-005
- **Feature/module:** Recurring service
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage. Any email/push recipient and message count must be explicitly authorized before this case; otherwise leave the sending step Not Run. No customer SMS campaigns.
- **User role:** Synthetic owner/admin/manager
- **Exact navigation path:** /jobs → New Job → Recurring appointment; or /service-plans → New plan; plan row → Schedule visit
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. Create a clearly synthetic recurring appointment from New Job, or create a plan from Service Plans, with explicit property, repeat pattern, first date and technician policy.
2. For New Job, verify the first visit already exists once. For plan-only creation, choose Schedule visit once.
3. Repeat the same generation action using the same expected date only in the emulator; in live UI confirm the date advances and the original visit exists once.
4. Pause the plan before it could schedule unattended future work.

- **Expected result:** Plan and visit are tenant-scoped; deterministic generation does not duplicate visits; deactivation preserves history.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `tests/workflows.integration.test.js:105`; `tests/service-plans.ui.test.js`; `tests/serviceAreas.workflows.integration.test.js`
- **Cleanup instructions:** Pause the synthetic plan and mark remaining synthetic jobs cancelled through supported management actions; preserve generated IDs and audit.

#### DSP-006 — Filters, job map and job-details dialog

- **Test ID:** DSP-006
- **Feature/module:** Dispatch
- **Preconditions:** Two synthetic geocoded service-property jobs, one assigned and one unassigned; avoid repeated paid address lookups.
- **User role:** Synthetic owner/manager
- **Exact navigation path:** /dispatch
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. Filter by service date, technician, status and area; verify job/unassigned counts align.
2. Show dispatch map once and confirm distinct job status markers; resolve at most one permitted batch only if coordinates are missing.
3. Open a job’s details from its list/marker and inspect photos/checklist.
4. Close with button and Escape, verify focus/scroll restoration, and reopen the same and another job.

- **Expected result:** Map shows service properties, not an empty continent or billing fallback; details appear as a usable dialog without hidden backdrops or excessive scrolling.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/DispatchPage.jsx:127`; `routeLogisticsWeb/src/utils/dispatchMap.test.js`; `tests/save-workflows.ui.test.js`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### DSP-007 — Calculate and save a controlled route

- **Test ID:** DSP-007
- **Feature/module:** Routes and navigation
- **Preconditions:** Two or three authorized synthetic geocoded stops on one technician/date; one Maps calculation approved; no repeated paid calls.
- **User role:** Synthetic owner/manager; technician read check
- **Exact navigation path:** /routes or /dispatch → staff card → Open daily route
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 10 minutes
- **Test steps:**

1. Load jobs and verify service-property addresses, start address, date and technician.
2. Calculate once with Keep appointment order checked; inspect route miles/time and arrival warnings.
3. If needed, explicitly allow intermediate-stop optimization once, review order and save.
4. Open Navigate and confirm the selected service destination; as technician confirm route viewing works but optimization/save is unavailable.

- **Expected result:** Current stops and property coordinates drive the route; warnings are visible; approved order saves once and remains tenant/assignment scoped.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/RoutesPage.jsx:63`; `tests/access.integration.test.js:81`; `tests/save-workflows.ui.test.js:74`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### DSP-008 — On-duty status, freshness and nearest technician

- **Test ID:** DSP-008
- **Feature/module:** Dispatch availability
- **Preconditions:** Paired mobile shift/location cases; technician explicitly allows work tracking; synthetic job has validated coordinates.
- **User role:** Synthetic dispatcher/manager; authorized TestFlight technician
- **Exact navigation path:** /dispatch → Team shifts, locations and routes; job → Find nearby on-duty staff
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 12 minutes
- **Test steps:**

1. Observe the same technician before shift, after Start Shift, while moving and after End Shift.
2. Wait through one configured location interval and the normal 30-second dispatch refresh; record timestamps/accuracy.
3. Use Find nearby on-duty staff for the synthetic job.
4. Confirm overdue/low-accuracy/off-duty locations are excluded and duty is not inferred from merely opening the app.

- **Expected result:** Duty and GPS freshness are distinct; on-duty location can support nearest-staff selection between jobs; off-duty location is not treated as available tracking.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/DispatchPage.jsx:158`; `tests/locations.integration.test.js:43`; `tests/locations.integration.test.js:84`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### DSP-009 — Automatic schedule-conflict protection

- **Test ID:** DSP-009
- **Feature/module:** Scheduling
- **Preconditions:** Disposable local Auth/Firestore/Functions browser fixtures. No production mutations or provider calls.
- **User role:** Synthetic owner/manager
- **Exact navigation path:** /jobs → New Job → Assigned technician
- **Execution / evidence class:** automated browser plus emulator integration/rules
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Save an assigned visit, then attempt an overlapping visit for the same technician.
2. Verify the server rejects the conflict, retains the draft and offers quarter-hour alternatives.
3. Choose an alternative without an automatic save, then explicitly save and verify the assignment.
4. Exercise concurrent saves, future recurring reservations, midnight boundaries and authorization in emulators.

- **Expected result:** Assigned appointments cannot overlap; alternatives require explicit selection and Save. Tenant and role boundaries remain enforced.
- **Actual result:** PW-OPS-15/16 passed across Chromium, Firefox and WebKit; the full427-case rules/integration run passed. No production conflicting jobs were created. This does not certify travel time, PTO or physical mobile delivery.
- **Status:** **Pass**
- **Evidence reference:** `tests/browser/operations.spec.js`; `tests/scheduling.integration.test.js`; `tests/booking.integration.test.js`; `tests/scheduling.rules.test.js`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### DSP-010 — Status transitions, completion and preserved history

- **Test ID:** DSP-010
- **Feature/module:** Job history
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage. Any email/push recipient and message count must be explicitly authorized before this case; otherwise leave the sending step Not Run. No customer SMS campaigns.
- **User role:** Synthetic manager; assigned technician
- **Exact navigation path:** /jobs; /my-work or TestFlight assigned job; /dispatch
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. Move only the assigned synthetic visit through supported en-route/in-progress/completed actions.
2. Confirm dispatch/list/detail status updates and recorded completion notes/time.
3. As a manager, reopen the synthetic job once and confirm the technician cannot independently reopen it.
4. Verify completed history/photos/checklist remain accessible to authorized staff.

- **Expected result:** Supported transitions are visible and auditable; completion is not silently lost; reopening requires management authority.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `tests/access.integration.test.js`; `tests/fieldwork.integration.test.js`; `tests/serviceForms.integration.test.js`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### DSP-011 — Existing in-app notification history and acknowledgement

- **Test ID:** DSP-011
- **Feature/module:** Notifications
- **Preconditions:** An existing authorized test notification or a server-seeded synthetic notification; do not send a new push merely to populate this page.
- **User role:** Authorized synthetic staff member
- **Exact navigation path:** /notifications
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Open Notifications; inspect the latest scoped work update or correct empty state.
2. Choose View jobs and confirm the appropriate Jobs/My Work destination.
3. Mark the test notification read and reload.
4. Switch staff/tenant and confirm the previous user’s notification is not shown.

- **Expected result:** Current-user/current-company notifications show without cross-tenant data; read acknowledgement persists and navigation respects role.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/NotificationsPage.jsx:1`; `functions/nativePush.emulator.test.js`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

### Phase 8 — Native iOS work execution

#### MOB-001 — Mobile regression baseline

- **Test ID:** MOB-001
- **Feature/module:** Mobile regression baseline
- **Preconditions:** Local installed dependencies; no production writes or messages.
- **User role:** Codex/operator
- **Exact navigation path:** Repository → npm --prefix routeLogisticsMobile test
- **Execution / evidence class:** automated; Current automated regression after test-only harness repair
- **Hands-on estimate:** 2 minutes
- **Test steps:**

1. Run the mobile test command once and retain its complete summary.
2. Locate the estimate-photo regression failure and distinguish the harness error from device behavior.

- **Expected result:** All mobile tests pass, or the specific test failure is recorded without declaring the app failed physically.
- **Actual result:** Initial current-run mobile command reproduced a stale web-estimate test-loader failure (167/168 passed): firebase/functions was not mocked, followed by the classic JSX harness React binding. Test-only workspaceApi boundary mocking and React injection repaired the harness without changing application behavior. The full corrected rerun passed 168/168. No camera hardware/device acceptance is claimed.
- **Status:** **Pass**
- **Evidence reference:** `routeLogisticsMobile/scripts/estimateScreens.test.js:116`; `.migration/acceptance-mobile.log`; `.migration/acceptance-mobile-fixed.log`
- **Cleanup instructions:** No production or fixture cleanup; do not change tests under this documentation-only task.

#### MOB-002 — Installed corporate binary and Firebase identity

- **Test ID:** MOB-002
- **Feature/module:** Installed corporate binary and Firebase identity
- **Preconditions:** Corporate TestFlight installation available; preserve any queues in old and current bundle identities.
- **User role:** Technician
- **Exact navigation path:** TestFlight → Route Logistics → app details; iPhone Settings → General → iPhone Storage → Route Logistics
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 4 minutes
- **Test steps:**

1. Record iPhone model/iOS, TestFlight version/build, installation date, and visible app name.
2. Confirm corporate app identity matches com.worksidesoftware.routelogisticsapp and existing EAS project; compare installed build to current source evidence.
3. Open app online; confirm intended company and role. Do not infer binary provenance from app.config.js buildNumber.

- **Expected result:** Corporate installation targets the existing Firebase project; operator records actual binary/build. An unknown build/source match remains an explicit acceptance limitation.
- **Actual result:** Source version 1.0.0; EAS uses remote auto-increment. Historical audited store binary was 1.0.0 (2); that audit had no Git commit hash. Current installed build is not verified.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/app.config.js`; `routeLogisticsMobile/eas.json`; `.migration/native-push-build-audit.json`; `.migration/native-push-ipa-audit.json`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### MOB-003 — Password, email code, verification and re-entry

- **Test ID:** MOB-003
- **Feature/module:** Password, email code, verification and re-entry
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used. Use approved test-account inbox/password; No fresh email, SMS, or push is authorized by this document alone. Obtain explicit recipient approval before any delivery step; keep broad review/SMS gates disabled.
- **User role:** Pest or pool technician
- **Exact navigation path:** Corporate TestFlight app → Login → Password / Email code / Forgot password
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 7 minutes
- **Test steps:**

1. Sign in once using the existing password; toggle password visibility without storing it in evidence.
2. Sign out, choose Email code, explicitly request one approved OTP, enter it, and confirm the same company role.
3. Check Remember my email, close/reopen app, and confirm email retention; uncheck and confirm removal.
4. Use the approved account’s reset/verification flow only if necessary; a pending invitation must still require acceptance.

- **Expected result:** First-attempt sign-in has actionable success/errors, role is not elevated, verified active membership is required, and saved email is device-local. OTP does not accept an invitation automatically.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/screens/LoginScreen.js`; `routeLogisticsMobile/screens/EmailVerificationScreen.js`; `routeLogisticsMobile/screens/WorkspaceAccessScreen.js`; `routeLogisticsMobile/services/staffLogin.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### MOB-004 — Technician role and assigned-work navigation

- **Test ID:** MOB-004
- **Feature/module:** Technician role and assigned-work navigation
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used.
- **User role:** Pest technician, pool technician
- **Exact navigation path:** Corporate TestFlight app → Home / Schedule / Route / Settings
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Inspect each bottom tab and open an assigned work order.
2. Verify technician cannot create customers, jobs, company/team accounts, estimates, invoices, integrations, or owner settings.
3. Verify the other company’s fixture does not appear. Use the emulator case for forged requests rather than a real cross-tenant mutation.

- **Expected result:** Technicians receive assigned-work navigation only. Owner/admin/manager management controls do not appear; server checks remain independent of UI hiding.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/App.js`; `routeLogisticsMobile/screens/WorkspaceScreen.js`; `routeLogisticsMobile/services/workspacePolicy.js`; `tests/access.integration.test.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### MOB-005 — Company profile, services, local appearance and phone format

- **Test ID:** MOB-005
- **Feature/module:** Company profile, services, local appearance and phone format
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used.
- **User role:** Technician
- **Exact navigation path:** Corporate TestFlight app → Settings
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Confirm company name, business phone/address and service catalog come from the selected provider, not a personal workspace.
2. Edit only the test user’s own phone/name/preferences; verify phone formatting and save confirmation.
3. Set Dark, Light, and System; restart once to confirm persistence.
4. Confirm company-edit link is owner-only and technician cannot change shared service definitions.

- **Expected result:** Correct provider data is displayed, phone is formatted, device appearance persists, and personnel preferences cannot overwrite company configuration.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/screens/SettingsScreen.js`; `routeLogisticsMobile/services/workspacePolicy.js`; `routeLogisticsMobile/services/phoneFormat.js`; `routeLogisticsMobile/theme/ThemeProvider.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### MOB-006 — Web-to-mobile assignment and schedule freshness

- **Test ID:** MOB-006
- **Feature/module:** Web-to-mobile assignment and schedule freshness
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used. Disable or explicitly authorize notifications for this fixture before assignment; never edit a real job.
- **User role:** Manager plus technician
- **Exact navigation path:** Web /dispatch → fixture assignment; Corporate TestFlight app → Home / Schedule
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Assign one new synthetic job to the technician from the web.
2. Leave the app online/visible and wait one polling interval (30 seconds); use pull-to-refresh if needed.
3. Change only its synthetic date/time, then check Day/Week/Month and current detail.
4. Return from a picker or another app and check freshness without losing an open draft.

- **Expected result:** Web changes appear in the correct tenant’s mobile views; only visible screens poll. A missing date-filtered list entry does not falsely revoke membership or close an unrelated draft.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/services/workQueryPolicy.js`; `routeLogisticsMobile/services/useWorkQueries.js`; `routeLogisticsMobile/screens/WorkspaceScreen.js`; `routeLogisticsMobile/scripts/workQueries.test.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### MOB-007 — Details, customer contact, route and navigation handoff

- **Test ID:** MOB-007
- **Feature/module:** Details, customer contact, route and navigation handoff
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used.
- **User role:** Technician
- **Exact navigation path:** Corporate TestFlight app → Schedule → synthetic job → Work order; Route tab
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Open the assigned job repeatedly from Home and Schedule, then open a different fixture job.
2. Compare service property, customer name/phone/instructions, date and status with the web fixture.
3. Choose Navigate to job and Navigate to stop; inspect the destination, then cancel navigation.
4. Choose Call customer only to inspect the dialer; do not place a call without explicit authorization.

- **Expected result:** Correct job context survives repeated navigation, and the service property is used for directions. Route shows assigned stops/external navigation; it explicitly has no native in-app map.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/components/JobWorkflow.js`; `routeLogisticsMobile/screens/RouteScreen.js`; `routeLogisticsMobile/services/workPresentation.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### MOB-008 — Pest checklist and required fields

- **Test ID:** MOB-008
- **Feature/module:** Pest checklist and required fields
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used. Service forms enabled; assign only a starter or synthetic custom template to the test job.
- **User role:** Manager then pest technician
- **Exact navigation path:** Web job details → Service checklist → assign Pest control inspection; Corporate TestFlight app → work order → Service checklist
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 7 minutes
- **Test steps:**

1. Assign the pest-control starter/template version on the web.
2. Open online on the phone and enter target pest, findings, inspection checklist and optional photos/notes.
3. Attempt completion with one required answer missing; then complete valid answers and save.
4. Refresh on web/phone and inspect the immutable service-report version.

- **Expected result:** Required pest fields validate; saved answers and template/version persist and belong only to the assigned job. Chemical applications remain separate.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `functions/shared/serviceTemplates.json`; `functions/serviceForms.js`; `routeLogisticsMobile/components/ServiceChecklist.js`; `tests/serviceForms.integration.test.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### MOB-009 — Pool checklist and equipment/water readings

- **Test ID:** MOB-009
- **Feature/module:** Pool checklist and equipment/water readings
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used. Use the distinct synthetic pool tenant, not Acme; pool checklist assigned.
- **User role:** Pool owner/manager then pool technician
- **Exact navigation path:** Web job details → Service checklist → assign Pool maintenance; Corporate TestFlight app → pool work order → Service checklist
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 7 minutes
- **Test steps:**

1. Enter pH, free chlorine, optional alkalinity/temperature, equipment choice and maintenance checklist.
2. Attempt out-of-range pH/chlorine and confirm visible validation; then use synthetic valid readings.
3. Save, reopen, and compare the report/units on web and phone.

- **Expected result:** Pool-specific data and units persist within the pool tenant. Readings are observations, not automatic chemical dosing instructions; pest data must not leak across tenants.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `functions/shared/serviceTemplates.json`; `functions/shared/serviceFormSchema.js`; `routeLogisticsMobile/components/ServiceChecklist.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### MOB-010 — Pest chemical application record

- **Test ID:** MOB-010
- **Feature/module:** Pest chemical application record
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used.
- **User role:** Pest technician
- **Exact navigation path:** Corporate TestFlight app → work order → Field work → product application
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Enter synthetic product, target pest, positive quantity/unit, EPA reference, area, method, license and note as appropriate.
2. Try a missing target pest or invalid quantity and confirm it cannot save.
3. Save once, refresh/reopen, and compare the application record on web and phone.

- **Expected result:** A durable job-scoped application record is saved once with attributable service address. It is not a dosing recommendation; technicians cannot alter another provider’s regulatory records.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/components/FieldWorkTools.js`; `routeLogisticsMobile/services/offline.js`; `functions/workData.js`; `tests/fieldwork.integration.test.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### MOB-011 — Physical camera, gallery, photo retrieval and reopening

- **Test ID:** MOB-011
- **Feature/module:** Physical camera, gallery, photo retrieval and reopening
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used. Use a non-personal test image and approved camera/photo-library permissions.
- **User role:** Technician
- **Exact navigation path:** Corporate TestFlight app → assigned work order → Photos
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 9 minutes
- **Test steps:**

1. Choose camera; capture/cancel separately and confirm the camera stays open until dismissed.
2. Select a gallery photo, inspect retained preview, then Save photo.
3. Observe queued/uploaded status, view the saved image, close details, reopen the same job and another job.
4. Repeat after opening completion and returning; do not dismiss an unsaved image without an explicit discard.

- **Expected result:** Camera/gallery return to the same work order, photos are not silently discarded, errors remain retryable, no invisible overlay blocks reopening, and only authorized job photos can be retrieved.
- **Actual result:** Native picker/modal lifecycle has automated coverage. Physical iPhone camera/gallery acceptance remains unperformed in this program; historical native error logs alone do not establish the cause or resolution.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/components/JobPhotos.js`; `routeLogisticsMobile/components/JobWorkflow.js`; `routeLogisticsMobile/scripts/jobPhotos.test.js`; `docs/mobile-job-workflow-repair.md`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### MOB-012 — Reviewed job completion and duplicate taps

- **Test ID:** MOB-012
- **Feature/module:** Reviewed job completion and duplicate taps
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used.
- **User role:** Technician
- **Exact navigation path:** Corporate TestFlight app → work order → Complete → Review → confirm
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Attempt completion with empty work description and verify validation.
2. Enter synthetic work done, optional hours and notes; review before confirming.
3. Tap confirmation twice rapidly and observe loading/one operation.
4. Return to Schedule/Home, verify completed status, reopen details and compare completion summary.

- **Expected result:** Completion either synchronizes, visibly queues offline, or reports the actual assignment/status error. One operation/reviewed completion is recorded; completed/cancelled work is not silently reopened.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/components/JobWorkflow.js`; `routeLogisticsMobile/services/jobCompletion.js`; `routeLogisticsMobile/scripts/jobCompletion.test.js`; `tests/access.integration.test.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### MOB-013 — Start/End Shift and dispatch availability

- **Test ID:** MOB-013
- **Feature/module:** Start/End Shift and dispatch availability
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used. Test technician voluntarily approves work-location sharing; manager watches correct tenant.
- **User role:** Technician plus manager
- **Exact navigation path:** Corporate TestFlight app → Home → Work shift → Manage; web /dispatch
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. With no active job, choose Start shift, inspect consent and confirm.
2. Check on-duty status and the distinction between sharing off, stale GPS and fresh GPS on Dispatch.
3. End shift and confirm; inspect phone and web status.
4. Deny location permission in a separate attempt and verify honest error/state without covert collection.

- **Expected result:** Availability is based on the explicit shift, not merely app-open or on-job status. End Shift stops collection and clears unsent GPS only; job/photo queues stay intact.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/components/WorkLocation.js`; `routeLogisticsMobile/services/workTracking.js`; `functions/workTracking.js`; `routeLogisticsWeb/src/pages/DispatchPage.jsx`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### MOB-014 — Background and locked-screen work locations

- **Test ID:** MOB-014
- **Feature/module:** Background and locked-screen work locations
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used. Owner authorizes policy changes for the synthetic tenant only; approved Always/background permission and mobile data; record prior 1/3/5-minute setting.
- **User role:** Technician plus manager
- **Exact navigation path:** Owner web /team-locations → On-duty GPS update interval; Corporate TestFlight app → Work shift → background consent
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes (plus 12 minutes passive wait)
- **Test steps:**

1. Set a short supported target interval and start the shift with explicit background consent.
2. Observe fresh position/time/accuracy with app open, then put app in background and lock the screen for at least three target intervals.
3. Check server/Dispatch timestamps while doing other acceptance cases; record actual cadence and OS state.
4. End Shift; verify collection stops, then restore original synthetic policy.

- **Expected result:** Fresh tenant-scoped samples continue during permitted background/locked use and cease after End Shift. Targets are not guaranteed exact OS intervals; force-quit is not certified tracking. Never pass this case from JS tests alone.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/services/backgroundTracking.js`; `routeLogisticsMobile/services/workTracking.js`; `functions/workTracking.js`; `routeLogisticsWeb/src/pages/TeamLocationsPage.jsx`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### MOB-015 — Arrival/departure/access-blocked proof

- **Test ID:** MOB-015
- **Feature/module:** Arrival/departure/access-blocked proof
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used. Online connection; use only an approved test property/GPS location, with optional location permission.
- **User role:** Technician
- **Exact navigation path:** Corporate TestFlight app → open work order → Field work → visit record
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Record Arrived manually, then Departed; inspect timestamps/source labels.
2. Record Couldn’t access property with a required explanation.
3. Repeat one event with optional current GPS and compare accuracy/source; cancel if location is not authorized.
4. Confirm visit evidence is visible after refresh and does not by itself change job status or prove property access.

- **Expected result:** Events are job- and tenant-scoped with clear manual/GPS attribution; duplicate retries do not duplicate an event. Visit events currently require connectivity and are not queued offline.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/components/FieldWorkTools.js`; `functions/workTracking.js`; `routeLogisticsMobile/scripts/fieldWorkTools.test.js`; `routeLogisticsMobile/scripts/syncLocation.test.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### MOB-016 — Native manager creation under configured geography

- **Test ID:** MOB-016
- **Feature/module:** Native manager creation under configured geography
- **Preconditions:** Synthetic provider has a configured territory; web equivalents are available.
- **User role:** Owner/manager
- **Exact navigation path:** Corporate TestFlight app → management Home → Schedule Service / Photo estimates
- **Execution / evidence class:** mixed; Source/configuration gap or missing external acceptance
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Inspect the native new-job and new-estimate forms for explicit service property/category inputs.
2. For a disposable fixture, attempt a new native creation and retain the returned server reason.
3. Use the web job/estimate form with explicit property as the controlled-pilot workaround; never weaken server checks.

- **Expected result:** Management creation supplies an explicit service property and valid customer association; otherwise it is excluded from native pilot scope with a documented workaround.
- **Actual result:** Static contract gap confirmed: native Schedule Service sends customerName without customerId/property/category; shared native estimate input has no service-property payload. Configured-territory creation is therefore not supported by these native forms. No production attempt was made; use web creation.
- **Status:** **Blocked**
- **Evidence reference:** `routeLogisticsMobile/screens/HomeScreen.js:1075`; `routeLogisticsMobile/screens/EstimatesScreen.js`; `functions/shared/estimateClient.js`; `functions/serviceAreaWorkflows.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

### Phase 9 — Offline durability and recovery

#### OFF-001 — Cached work and uncached offline view

- **Test ID:** OFF-001
- **Feature/module:** Cached work and uncached offline view
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used. Queue empty or synthetic-only; open assigned job, checklist and photo list online first.
- **User role:** Technician
- **Exact navigation path:** Corporate TestFlight app → Schedule/work order; airplane mode
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Open one fixture online to cache it; leave another fixture unopened.
2. Enable airplane mode and reopen the cached job.
3. Attempt the uncached job and confirm a clear connect-once/retry message, not someone else’s cache.

- **Expected result:** Only scoped cached data is available offline. Uncached or denied work is not fabricated from another account/role cache.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/services/offline.js`; `routeLogisticsMobile/services/useWorkQueries.js`; `routeLogisticsMobile/scripts/workQueries.test.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### OFF-002 — Offline notes and checklist edits

- **Test ID:** OFF-002
- **Feature/module:** Offline notes and checklist edits
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used. Cached base/template; airplane mode; use synthetic notes and valid required answers.
- **User role:** Technician
- **Exact navigation path:** Corporate TestFlight app → cached work order → Work notes / Service checklist
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Save a work note while offline and inspect queue state.
2. Save a checklist draft/complete response against its cached assigned template version.
3. Close/reopen the view and compare saved local values before reconnecting.

- **Expected result:** Supported changes are durably queued and shown as pending; a checklist never silently applies answers to a changed template version.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/components/FieldWorkTools.js`; `routeLogisticsMobile/components/ServiceChecklist.js`; `routeLogisticsMobile/services/offline.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### OFF-003 — Offline photo capture and durable local file

- **Test ID:** OFF-003
- **Feature/module:** Offline photo capture and durable local file
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used. Airplane mode; test camera/library image; enough device storage.
- **User role:** Technician
- **Exact navigation path:** Corporate TestFlight app → cached work order → Photos
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Capture/select a test image offline and save it to the queue.
2. Verify its local preview and queued state; close/reopen details.
3. Keep it pending for the restart/reconnection cases without deleting local storage.

- **Expected result:** A scoped durable local file and queue row exist before the draft clears. The photo is retained across page changes and reported honestly as not uploaded.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/components/JobPhotos.js`; `routeLogisticsMobile/services/offline.js`; `routeLogisticsMobile/scripts/jobPhotos.test.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### OFF-004 — Offline completion and prerequisite ordering

- **Test ID:** OFF-004
- **Feature/module:** Offline completion and prerequisite ordering
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used. Synthetic cached job; pending checklist/notes/photo fixtures from OFF-002/003.
- **User role:** Technician
- **Exact navigation path:** Corporate TestFlight app → cached work order → Complete; Home → saved work
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Complete the fixture offline with a description and inspect the pending completion.
2. Check that a server-synchronized badge is not shown before synchronization.
3. Reconnect in OFF-005 and inspect report/job ordering and terminal states.

- **Expected result:** Completion preserves one operation ID and waits for required earlier job/service-form work. Every pending/failed/conflict state remains visible; the UI does not claim an unconfirmed server status.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/services/jobCompletion.js`; `routeLogisticsMobile/services/offline.js`; `routeLogisticsMobile/components/JobWorkflow.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### OFF-005 — Reconnect, synchronize and duplicate prevention

- **Test ID:** OFF-005
- **Feature/module:** Reconnect, synchronize and duplicate prevention
- **Preconditions:** OFF-002/003/004 contain only disposable fixture operations; restore network.
- **User role:** Technician plus manager
- **Exact navigation path:** Corporate TestFlight app → Home → saved-work card → synchronize
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 7 minutes
- **Test steps:**

1. Restore data connection and foreground app.
2. Expand saved-work status; synchronize twice and refresh web job/photos/reports.
3. Verify one completion, one application/report version and one image per queued operation; compare private operation audit as needed.

- **Expected result:** Queued operations synchronize to the current assignment once. Repeated taps/reconnects do not duplicate records, and completed uploads release their durable local copies only after acknowledgment.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/services/offline.js`; `routeLogisticsMobile/components/OfflineStatus.js`; `functions/offline.js`; `tests/fieldwork.integration.test.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### OFF-006 — Conflicts, lost assignment and cross-tenant replay

- **Test ID:** OFF-006
- **Feature/module:** Conflicts, lost assignment and cross-tenant replay
- **Preconditions:** Use local demo emulators and test fixtures, never revoke a real account or mutate another company.
- **User role:** Emulator technician/manager
- **Exact navigation path:** Local shell → npm run test:rules; mobile scripts jobCompletion/tenancyRefresh
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 2 minutes
- **Test steps:**

1. Use the current automated run covering stale versions, reassignment, membership revocation and wrong-tenant replay.
2. Confirm failure/conflict records retain the proposed change and actual server reason.
3. Confirm an online permission denial never falls back to cached private data.

- **Expected result:** Unauthorized/reassigned operations cannot synchronize, stale changes become reviewable conflicts, and no prior tenant/role cache leaks.
- **Actual result:** Fresh current mobile authorization/queue subsets passed (168 passed after the test-only harness repair recorded in MOB-001); current Firestore/security regression also passed (330/330). No live adversarial mutation or physical offline test was performed.
- **Status:** **Pass**
- **Evidence reference:** `routeLogisticsMobile/scripts/jobCompletion.test.js`; `routeLogisticsMobile/scripts/tenancyRefresh.test.js`; `tests/access.integration.test.js`; `tests/fieldwork.integration.test.js`; `.migration/acceptance-rules.log`; `.migration/acceptance-functions.log`; `.migration/acceptance-mobile.log`; `.migration/acceptance-mobile-fixed.log`
- **Cleanup instructions:** Emulator-only fixture lifecycle; no production cleanup.

#### OFF-007 — Restart with pending work and failed-upload recovery

- **Test ID:** OFF-007
- **Feature/module:** Restart with pending work and failed-upload recovery
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used. At least one synthetic note/photo pending; do not uninstall or clear storage.
- **User role:** Technician
- **Exact navigation path:** Corporate TestFlight app → Home → saved work; OS close/reopen
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 7 minutes
- **Test steps:**

1. While offline, close and restart the app with a queued photo/note.
2. Verify each pending item remains accessible in the same account/workspace.
3. Reconnect and exercise a retryable upload failure using an approved network interruption; then Retry photo upload/synchronization.

- **Expected result:** Restart and transient failure do not silently lose queued data. Failed items retain actionable errors and retry without another copy.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/services/offlineQueueCore.js`; `routeLogisticsMobile/services/offline.js`; `routeLogisticsMobile/components/OfflineStatus.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### OFF-008 — Sign-out/account switch with pending work

- **Test ID:** OFF-008
- **Feature/module:** Sign-out/account switch with pending work
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used. Synthetic-only pending queue; record same-account login method; no lost credentials.
- **User role:** Technician and separate test account
- **Exact navigation path:** Corporate TestFlight app → Settings → Sign out
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 7 minutes
- **Test steps:**

1. Save one offline synthetic note/photo, then sign out.
2. Sign in as the other authorized test account and verify the prior queue/content is not visible.
3. Return to the original verified company account, reconnect, and inspect/recover the retained work.

- **Expected result:** Sign-out stops GPS/native registration and clears session/read state while work/photo queues remain role- and tenant-scoped. General sign-out confirmation is present; a queue-specific warning is not currently implemented.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/contexts/SessionProvider.js:112`; `routeLogisticsMobile/services/offline.js`; `routeLogisticsMobile/services/nativePush.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### OFF-009 — Explicit retry/discard and unsupported offline visit evidence

- **Test ID:** OFF-009
- **Feature/module:** Explicit retry/discard and unsupported offline visit evidence
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used. One disposable failed/conflicting synthetic queue item.
- **User role:** Technician
- **Exact navigation path:** Corporate TestFlight app → Home → saved work → Retry/Discard; work order → Visit record
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Inspect proposed/current values and choose Keep rather than discard first.
2. Retry once after resolving the test conflict, or explicitly confirm discarding only the disposable item.
3. While offline, attempt a manual arrival/access-blocked event and confirm its draft/error is retained rather than silently queued.

- **Expected result:** The operator chooses how to resolve saved work; unrelated rows/photos survive. Unsupported offline visit evidence clearly requires a connection.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/components/OfflineStatus.js`; `routeLogisticsMobile/components/FieldWorkTools.js`; `routeLogisticsMobile/services/offline.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

### Phase 10 — Multi-provider customer portal

#### POR-001 — Fresh customer OTP delivery and isolated login

- **Test ID:** POR-001
- **Feature/module:** Fresh customer OTP delivery and isolated login
- **Preconditions:** Use an explicitly approved controlled inbox and synthetic customer association. No fresh email, SMS, or push is authorized by this document alone. Obtain explicit recipient approval before any delivery step; keep broad review/SMS gates disabled.
- **User role:** Single-provider customer
- **Exact navigation path:** https://route-logistics.com/portal → request code
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Request one approved fresh customer-portal OTP through the normal page.
2. Record provider acceptance and actual mailbox location separately; never capture the code.
3. Use the newest code once and confirm customer portal identity, not staff/admin access.

- **Expected result:** A code reaches the approved recipient, signs into an isolated customer identity, and reveals only authorized provider associations.
- **Actual result:** Historical Nov 14 live OTP/API evidence exists (completed 12:11 PM Pacific). This program has not requested another OTP or verified current handset/mailbox delivery.
- **Status:** **Not Run**
- **Evidence reference:** `functions/portal.js`; `routeLogisticsWeb/src/services/portal.js`; `.migration/portal-cms-live.json`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### POR-002 — OTP invalid/expired/replayed/rate-limited requests

- **Test ID:** POR-002
- **Feature/module:** OTP invalid/expired/replayed/rate-limited requests
- **Preconditions:** Demo emulators; synthetic email only, mock mail transport.
- **User role:** Emulator customer/anonymous
- **Exact navigation path:** Local shell → npm run test:rules → portal.integration.test.js
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 2 minutes
- **Test steps:**

1. Use recorded current test results for invalid/expired codes and five failed attempts.
2. Check one successful consumption rejects replay and request/verify limits persist.
3. Confirm unknown email responses do not disclose customer existence or return a code.

- **Expected result:** OTP abuse fails closed without account/provider enumeration or code disclosure.
- **Actual result:** Fresh current Functions tests: 138 passed, one emulator-only test skipped in the unit invocation and covered by the current emulator suite; current rules/integration suite: 330/330 passed. The named test cases passed in those suites. No new customer message, live mutation or physical-device action was performed.
- **Status:** **Pass**
- **Evidence reference:** `tests/portal.integration.test.js`; `tests/workflows.integration.test.js`; `functions/portal.js`; `.migration/acceptance-rules.log`; `.migration/acceptance-functions.log`
- **Cleanup instructions:** Emulator-only records; no production cleanup.

#### POR-003 — Customer identity versus matching staff email

- **Test ID:** POR-003
- **Feature/module:** Customer identity versus matching staff email
- **Preconditions:** Local demo fixtures; no real identity or role changes.
- **User role:** Emulator staff/customer
- **Exact navigation path:** Local shell → review/portal authorization tests
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 2 minutes
- **Test steps:**

1. Attempt portal/review APIs using an ordinary staff identity with matching email.
2. Attempt forged portal claim/UID and wrong selected provider IDs.
3. Confirm only OTP-issued customer identity plus live association works.

- **Expected result:** Email matching alone never grants customer-service access; company-owner/platform privileges do not impersonate a customer.
- **Actual result:** Fresh current Functions tests: 138 passed, one emulator-only test skipped in the unit invocation and covered by the current emulator suite; current rules/integration suite: 330/330 passed. The named test cases passed in those suites. No new customer message, live mutation or physical-device action was performed.
- **Status:** **Pass**
- **Evidence reference:** `tests/reviews.integration.test.js`; `tests/portal.integration.test.js`; `functions/portal.js`; `.migration/acceptance-rules.log`; `.migration/acceptance-functions.log`
- **Cleanup instructions:** Emulator-only.

#### POR-004 — Historical live multi-provider API certification

- **Test ID:** POR-004
- **Feature/module:** Historical live multi-provider API certification
- **Preconditions:** Read retained sanitized evidence; do not repeat consumed OTP or old fixture mutations.
- **User role:** Authorized customer
- **Exact navigation path:** Customer portal API through normal OTP flow
- **Execution / evidence class:** mixed; Historical provider/live evidence — not repeated
- **Hands-on estimate:** 2 minutes
- **Test steps:**

1. Inspect completed prior live report and corresponding portal certification procedure.
2. Verify evidence distinguishes two provider associations, duplicate grouping, invoices/files and revocation.
3. Carry the result as historical API/provider evidence, not new Safari or new-tenant certification.

- **Expected result:** Historical evidence is traceable and is not misrepresented as a fresh physical test.
- **Actual result:** Prior live normal-OTP certification completed Nov 14 at 12:11 PM Pacific: two providers, duplicate grouping, scoped records/files/payment history, replay denial, and synthetic association/payment revocation passed. Not repeated in this program.
- **Status:** **Pass**
- **Evidence reference:** `.migration/portal-cms-live.json`; `docs/customer-portal-platform-cms.md`
- **Cleanup instructions:** Read-only evidence review; no changes.

#### POR-005 — Provider switching and duplicate customer grouping in browser

- **Test ID:** POR-005
- **Feature/module:** Provider switching and duplicate customer grouping in browser
- **Preconditions:** A controlled customer has active synthetic pest and pool associations; one provider has two same-email customer rows without duplicating Auth accounts.
- **User role:** Multi-provider customer
- **Exact navigation path:** /portal → provider selector
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Sign in normally with approved OTP.
2. Select pest, inspect its visits, then switch to pool and back.
3. Confirm duplicate customer rows group under one provider and unsaved review drafts warn before switching.

- **Expected result:** Selected provider controls every visible service/review/file/invoice; no stale asynchronous response from the prior provider appears.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/CustomerPortalPage.jsx`; `routeLogisticsWeb/src/components/CustomerReviews.jsx`; `tests/customerPortal.ui.test.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### POR-006 — Service, photo, PDF, invoice and payment visibility

- **Test ID:** POR-006
- **Feature/module:** Service, photo, PDF, invoice and payment visibility
- **Preconditions:** Synthetic completed visit, customer-visible photo/PDF, and synthetic invoice/payment fixtures published only to that customer.
- **User role:** Customer
- **Exact navigation path:** /portal → selected provider → visits/shared files/invoices/payments
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 7 minutes
- **Test steps:**

1. Open the visit and a shared photo; close/reopen its preview.
2. Download the shared PDF and inspect MIME/content on desktop and phone.
3. Inspect invoice and payment history without initiating a charge.
4. Confirm private attachments, internal job notes, drafts and other customers’ records are absent.

- **Expected result:** Only customer-published service files and authorized invoice/payment records are visible; no permanent public Storage token or private storage path is exposed.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `functions/portal.js`; `functions/paymentLifecycle.js`; `tests/portal.integration.test.js`; `tests/storage.rules.test.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### POR-007 — Service-file authorization and revocation races

- **Test ID:** POR-007
- **Feature/module:** Service-file authorization and revocation races
- **Preconditions:** Demo Firestore/Storage fixtures only; no production file deletion.
- **User role:** Emulator customer
- **Exact navigation path:** Local shell → portal/storage rules tests
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 2 minutes
- **Test steps:**

1. Use automated tests for wrong provider/customer links, unpublished files, path traversal and unsupported MIME/size.
2. Check association/job/publication revocation between download and response.
3. Confirm direct Storage/Firestore bypass attempts fail.

- **Expected result:** File bytes are declassified only after current authorization; revoked files do not remain available through permanent URLs.
- **Actual result:** Fresh current Functions tests: 138 passed, one emulator-only test skipped in the unit invocation and covered by the current emulator suite; current rules/integration suite: 330/330 passed. The named test cases passed in those suites. No new customer message, live mutation or physical-device action was performed.
- **Status:** **Pass**
- **Evidence reference:** `tests/portal.integration.test.js`; `tests/platformCms.rules.test.js`; `tests/storage.rules.test.js`; `.migration/acceptance-rules.log`; `.migration/acceptance-functions.log`
- **Cleanup instructions:** Emulator-only.

#### POR-008 — Synthetic provider-association revocation

- **Test ID:** POR-008
- **Feature/module:** Synthetic provider-association revocation
- **Preconditions:** Synthetic two-provider customer only; record fixture’s prior active state; preserve the other provider association.
- **User role:** Customer plus owner/manager
- **Exact navigation path:** Web /customers → synthetic customer deactivation; /portal → Refresh/provider selector
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Deactivate only the synthetic association for provider B.
2. Refresh/select B in the existing customer portal session.
3. Verify B’s service/files/payments/reviews are unavailable and A remains accessible.
4. Restore B only if subsequent planned synthetic tests need it.

- **Expected result:** Live association revocation removes access without requiring a new login and cannot affect another provider’s records.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `functions/portal.js`; `functions/reviews.js`; `tests/portal.integration.test.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### POR-009 — Empty, expired-session and network-error states

- **Test ID:** POR-009
- **Feature/module:** Empty, expired-session and network-error states
- **Preconditions:** Controlled inbox/account; no real customer data cached in shared browser.
- **User role:** Customer
- **Exact navigation path:** /portal → sign out/reload; controlled offline browser
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Open portal signed out and verify sign-in prompt.
2. Use an account with no active association and verify safe empty state.
3. Disconnect while loading a provider or file, then reconnect and retry.
4. Expire/revoke synthetic session through emulator for adversarial behavior; do not revoke a real user’s session.

- **Expected result:** The portal shows actionable loading/empty/error states without falling back to another provider or retaining unauthorized private content.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/CustomerPortalPage.jsx`; `routeLogisticsWeb/src/services/portal.js`; `tests/customerPortal.ui.test.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### POR-010 — Phone-browser customer journey and logout

- **Test ID:** POR-010
- **Feature/module:** Phone-browser customer journey and logout
- **Preconditions:** Approved OTP inbox, synthetic provider association and phone browser.
- **User role:** Customer
- **Exact navigation path:** iPhone Safari → /portal
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. Complete portal sign-in, provider selection, shared-file preview and review navigation on the phone.
2. Test keyboard, zoom/large text, portrait/landscape and visible errors.
3. Sign out and use Back/reload; verify private account data does not remain accessible.

- **Expected result:** The real mobile browser journey is usable and private. Desktop Chrome responsive emulation alone does not pass this case.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/CustomerPortalPage.jsx`; `tests/customerPortal.ui.test.js`; `.migration/platform-portal-browser.json`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

### Phase 11 — Verified reviews and feedback

#### REV-001 — Completed-visit eligibility and immutable review data

- **Test ID:** REV-001
- **Feature/module:** Completed-visit eligibility and immutable review data
- **Preconditions:** Demo fixtures for completed, scheduled, cancelled, reopened and invalidated visits.
- **User role:** Emulator customer/provider
- **Exact navigation path:** Local shell → reviews.integration.test.js
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 2 minutes
- **Test steps:**

1. Use current backend results for valid/invalid completed services and customer/provider ownership.
2. Verify one deterministic review per job across portal/invitation calls.
3. Attempt provider changes to customer rating/comment and verify refusal.

- **Expected result:** Only an authorized completed valid service can receive a review; original rating/comment cannot be replaced.
- **Actual result:** Fresh current Functions tests: 138 passed, one emulator-only test skipped in the unit invocation and covered by the current emulator suite; current rules/integration suite: 330/330 passed. The named test cases passed in those suites. No new customer message, live mutation or physical-device action was performed.
- **Status:** **Pass**
- **Evidence reference:** `tests/reviews.integration.test.js`; `functions/reviews.js`; `tests/reviews.rules.test.js`; `.migration/acceptance-rules.log`; `.migration/acceptance-functions.log`
- **Cleanup instructions:** Emulator-only.

#### REV-002 — Customer-portal review form and confirmation

- **Test ID:** REV-002
- **Feature/module:** Customer-portal review form and confirmation
- **Preconditions:** New disposable completed synthetic visit; approved OTP login. Review automation remains disabled.
- **User role:** Customer
- **Exact navigation path:** /portal → provider → Reviews and service feedback → Review this visit
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Choose a rating, optional comment and on-time answer.
2. Leave public-display permission unchecked; submit once and observe confirmation.
3. Refresh/switch providers/back and verify one saved review and no duplicate eligible row.

- **Expected result:** The portal creates one verified private synthetic review and preserves it across provider switches; all failures retain useful feedback.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/components/CustomerReviews.jsx`; `routeLogisticsWeb/src/components/ReviewForm.jsx`; `functions/reviews.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### REV-003 — Previously executed delivered invitation and live submission

- **Test ID:** REV-003
- **Feature/module:** Previously executed delivered invitation and live submission
- **Preconditions:** Inspect the prior authorized synthetic fixture evidence; do not request/send another invitation for this case.
- **User role:** Authorized review recipient
- **Exact navigation path:** Existing /review email link (already consumed)
- **Execution / evidence class:** mixed; Historical provider/live evidence — not repeated
- **Hands-on estimate:** 2 minutes
- **Test steps:**

1. Review the retained SendGrid/operator confirmation and live record summary.
2. Confirm one stored synthetic review, private state, consumed link and denied replay.
3. Do not reuse the already-consumed link as a new submission test.

- **Expected result:** The prior production path is recorded as live evidence without publishing fictional feedback or repeating messages.
- **Actual result:** Nov 14, 4:15 PM Pacific: exactly one approved email was SMTP-accepted on attempt one; operator reported SendGrid Delivered and submitted successfully. At 4:21 PM the live record was synthetic/private, one review counted, invitation consumed and replay denied. Public permission was selected but synthetic feedback remained unpublishable. No review SMS was sent.
- **Status:** **Pass**
- **Evidence reference:** `.migration/reviews-live-test.json`; `.migration/reviews-live-browser.json`; `docs/customer-reviews.md`
- **Cleanup instructions:** Retain private fixture evidence; synthetic review must never publish. No repeat send.

#### REV-004 — Secure invitation expiry, replay and privacy

- **Test ID:** REV-004
- **Feature/module:** Secure invitation expiry, replay and privacy
- **Preconditions:** Synthetic token fixtures and mocked transports only.
- **User role:** Emulator/anonymous
- **Exact navigation path:** Local shell → reviewInvitations.integration.test.js
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 2 minutes
- **Test steps:**

1. Test malformed/wrong token, expired/missing expiry, consumed token and repeated submission.
2. Confirm public invitation details omit customer email/address and provider APIs never return raw links/pending tokens.
3. Verify fragment removal in browser tests and no duplicate statistics.

- **Expected result:** Links are expiring, single-use and scoped to the current service/recipient; requests fail safely without private-data disclosure.
- **Actual result:** Fresh current Functions tests: 138 passed, one emulator-only test skipped in the unit invocation and covered by the current emulator suite; current rules/integration suite: 330/330 passed. The named test cases passed in those suites. No new customer message, live mutation or physical-device action was performed.
- **Status:** **Pass**
- **Evidence reference:** `tests/reviewInvitations.integration.test.js`; `tests/reviews.integration.test.js`; `tests/reviews.ui.test.js`; `.migration/acceptance-rules.log`; `.migration/acceptance-functions.log`
- **Cleanup instructions:** Emulator-only; do not print tokens.

#### REV-005 — Reopened/invalidated work cancels invitations

- **Test ID:** REV-005
- **Feature/module:** Reopened/invalidated work cancels invitations
- **Preconditions:** Mock email/SMS only; no real customer messages or production reopen.
- **User role:** Emulator technician/manager
- **Exact navigation path:** Local shell → review invitation lifecycle tests
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 2 minutes
- **Test steps:**

1. Queue synthetic invitation, then reopen/delete/invalidate/void/deactivate its job.
2. Run delivery and verify queued work cancels, tokens cannot submit and pending SMS secrets clear.
3. Exercise stale completion/reopen events within one millisecond and verify exact timestamp fencing.

- **Expected result:** Invalid work cannot solicit/accept feedback through an old invitation; historical private reviews remain preserved and unpublishable.
- **Actual result:** Fresh current Functions tests: 138 passed, one emulator-only test skipped in the unit invocation and covered by the current emulator suite; current rules/integration suite: 330/330 passed. The named test cases passed in those suites. No new customer message, live mutation or physical-device action was performed.
- **Status:** **Pass**
- **Evidence reference:** `tests/reviewInvitations.integration.test.js`; `tests/reviews.integration.test.js`; `functions/reviewInvitations.js`; `.migration/acceptance-rules.log`; `.migration/acceptance-functions.log`
- **Cleanup instructions:** Emulator-only.

#### REV-006 — Tenant invitation preferences, timing and reminder

- **Test ID:** REV-006
- **Feature/module:** Tenant invitation preferences, timing and reminder
- **Preconditions:** Synthetic provider only; global RL_REVIEW_INVITATIONS_ENABLED=false remains unchanged.
- **User role:** Owner/manager
- **Exact navigation path:** /reviews → Post-service invitations
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Inspect email default/SMS separate choice and global-disabled banner.
2. Change synthetic delay/link lifetime/one-reminder preferences and save; verify dirty/success/error behavior.
3. Attempt a reminder after link expiry and confirm server rejection.
4. Refresh history without generating a real message.

- **Expected result:** Preferences are tenant-scoped and versioned; saving cannot enable outbound delivery. Timing/reminder scheduling is exercised by emulators until an explicit test delivery window is authorized.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/components/ReviewInvitationSettings.jsx`; `functions/reviewInvitations.js`; `tests/reviewInvitations.integration.test.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### REV-007 — Provider dashboard, filters, responses and notes

- **Test ID:** REV-007
- **Feature/module:** Provider dashboard, filters, responses and notes
- **Preconditions:** Usable synthetic provider owner/manager account; do not try to sign in as the dummy owner of the historical email-only fixture.
- **User role:** Owner/manager
- **Exact navigation path:** /reviews → filters → selected synthetic review
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 7 minutes
- **Test steps:**

1. Filter by rating/service/date/status, page through results and compare count/average.
2. Respond to the synthetic customer and add a private follow-up note.
3. Verify visible success, unchanged customer rating/comment and full audit history.
4. Check customer portal can see the response but not internal notes.

- **Expected result:** Only the current provider’s reviews appear. All ratings count; authorized responses/private notes are distinct from immutable customer feedback.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/ReviewsPage.jsx`; `functions/reviews.js`; `tests/reviews.ui.test.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### REV-008 — Public-display permission and withdrawal

- **Test ID:** REV-008
- **Feature/module:** Public-display permission and withdrawal
- **Preconditions:** Synthetic review owned by the currently OTP-authenticated customer; original permission value recorded.
- **User role:** Customer
- **Exact navigation path:** /portal → provider → Your submitted reviews → Grant/Withdraw public-display permission
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Grant permission only on a clearly synthetic private fixture and verify no public publication occurs.
2. Withdraw permission and refresh the portal/provider dashboard.
3. Confirm old submission retry cannot restore withdrawal; check private history remains after reopening/deleting only its test job.

- **Expected result:** Consent is an independent customer choice and withdrawal is honored immediately. Synthetic reviews are permanently ineligible even with consent; provider moderation cannot restore consent.
- **Actual result:** Historical live synthetic submission exercised permission=true with private/unpublishable result. Live customer-portal withdrawal remains Not Run.
- **Status:** **Not Run**
- **Evidence reference:** `functions/reviews.js`; `routeLogisticsWeb/src/components/CustomerReviews.jsx`; `tests/reviews.integration.test.js`; `.migration/reviews-live-test.json`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### REV-009 — Equivalent positive/negative moderation and audit

- **Test ID:** REV-009
- **Feature/module:** Equivalent positive/negative moderation and audit
- **Preconditions:** Synthetic one-star and five-star fixtures, never publish them.
- **User role:** Emulator provider/customer
- **Exact navigation path:** Local shell → reviews.integration.test.js
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 2 minutes
- **Test steps:**

1. Apply identical consent/moderation criteria to both ratings.
2. Record documented moderation reasons; verify no provider edit/delete of original feedback.
3. Confirm hidden/unreviewed/negative ratings remain in all-submitted statistics and audit.

- **Expected result:** Solicitation and moderation do not privilege positive ratings; public permission alone never publishes content.
- **Actual result:** Fresh current Functions tests: 138 passed, one emulator-only test skipped in the unit invocation and covered by the current emulator suite; current rules/integration suite: 330/330 passed. The named test cases passed in those suites. No new customer message, live mutation or physical-device action was performed.
- **Status:** **Pass**
- **Evidence reference:** `tests/reviews.integration.test.js`; `functions/reviews.js`; `docs/customer-reviews.md`; `.migration/acceptance-rules.log`; `.migration/acceptance-functions.log`
- **Cleanup instructions:** Emulator-only; no fictional public publication.

#### REV-010 — Separately authorized review SMS provider test

- **Test ID:** REV-010
- **Feature/module:** Separately authorized review SMS provider test
- **Preconditions:** No fresh email, SMS, or push is authorized by this document alone. Obtain explicit recipient approval before any delivery step; keep broad review/SMS gates disabled. A fresh explicit review-specific SMS approval and a narrowly scoped operator delivery window are required.
- **User role:** Approved test customer plus operator
- **Exact navigation path:** /reviews → Post-service invitations; customer consent → optional review-invitation purpose
- **Execution / evidence class:** manual; Source/configuration gap or missing external acceptance
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Confirm normal service-purpose consent and old pilot do not authorize review SMS.
2. Without changing broad gates, inspect consent/configuration and retain emulator evidence for STOP/START/signed callbacks.
3. Only after a separately approved scoped activation, send one synthetic review SMS and verify carrier-delivered status plus phone receipt; otherwise leave blocked.

- **Expected result:** No unauthorized review SMS or broad campaign is sent; any later real test must use existing approved sender, signed callbacks, explicit purpose consent and valid secure link.
- **Actual result:** Review SMS has emulator coverage, including consent/STOP, durable retry and pilot denial. Broad SMS and review automation are disabled, and this task authorizes no fresh review SMS; no carrier/device review-SMS acceptance exists.
- **Status:** **Blocked**
- **Evidence reference:** `functions/sms.js`; `functions/reviewInvitations.js`; `tests/reviewInvitations.integration.test.js`; `docs/customer-reviews.md`
- **Cleanup instructions:** Do not change global gates automatically. If later authorized, close only the scoped test window and retain delivery evidence.

#### REV-011 — Review tenant isolation and provider RBAC

- **Test ID:** REV-011
- **Feature/module:** Review tenant isolation and provider RBAC
- **Preconditions:** Demo fixtures only; no adversarial production mutation.
- **User role:** Emulator owner/manager/admin/technician/customer/visitor
- **Exact navigation path:** Local shell → review authorization and Firestore rules tests
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 2 minutes
- **Test steps:**

1. Verify owner/manager access, admin/technician denial and wrong-tenant denial.
2. Try direct Firestore reads/writes of reviews, consent, stats, audit, tokens, pending SMS and test grants.
3. Try ordinary staff email matching to a customer and confirm rejection.

- **Expected result:** Provider access is independent of customer authorization; all private records are server-mediated and no role can edit customer review text.
- **Actual result:** Fresh current Functions tests: 138 passed, one emulator-only test skipped in the unit invocation and covered by the current emulator suite; current rules/integration suite: 330/330 passed. The named test cases passed in those suites. No new customer message, live mutation or physical-device action was performed.
- **Status:** **Pass**
- **Evidence reference:** `tests/reviews.rules.test.js`; `tests/reviews.integration.test.js`; `functions/shared/capabilities.json`; `.migration/acceptance-rules.log`; `.migration/acceptance-functions.log`
- **Cleanup instructions:** Emulator-only.

#### REV-012 — Older review history and privacy after record changes

- **Test ID:** REV-012
- **Feature/module:** Older review history and privacy after record changes
- **Preconditions:** Synthetic 105-review fixture; no production bulk review creation.
- **User role:** Emulator customer
- **Exact navigation path:** Local shell → reviews.integration.test.js → pagination/history cases
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 2 minutes
- **Test steps:**

1. Page to older history and withdraw its permission.
2. Reject a cursor owned by another customer/provider.
3. Delete/reopen only fixture jobs and confirm private review history remains while public eligibility turns off.
4. Reassign a customer email or review row in emulators and confirm old feedback cannot leak.

- **Expected result:** History is ordered/paginated by immutable customer identity and provider scope; older consent remains manageable and record changes never expose another customer’s feedback.
- **Actual result:** Fresh current Functions tests: 138 passed, one emulator-only test skipped in the unit invocation and covered by the current emulator suite; current rules/integration suite: 330/330 passed. The named test cases passed in those suites. No new customer message, live mutation or physical-device action was performed.
- **Status:** **Pass**
- **Evidence reference:** `tests/reviews.integration.test.js`; `functions/reviews.js`; `tests/reviews.ui.test.js`; `.migration/acceptance-rules.log`; `.migration/acceptance-functions.log`
- **Cleanup instructions:** Emulator-only.

### Phase 12 — Estimates, approval and PDFs

#### EST-001 — Create a customer photo estimate with explicit property

- **Test ID:** EST-001
- **Feature/module:** Estimates
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage. Estimates feature enabled; no email delivery needed.
- **User role:** Synthetic owner/admin/manager
- **Exact navigation path:** /estimates → New photo estimate
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. Select the synthetic customer; enter title, service type, scope, notes and explicit service property/category.
2. Add at least one labor and material line and save once.
3. Verify the saved customer, server total, version and separate approved service-property snapshot.
4. Refresh and reopen the estimate.

- **Expected result:** A versioned draft is saved for the selected customer; billing address is not silently treated as the service property.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/EstimatesPage.jsx:78`; `tests/estimates.integration.test.js:19`; `tests/save-workflows.ui.test.js:136`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### EST-002 — Prospect estimate without premature customer creation

- **Test ID:** EST-002
- **Feature/module:** Estimates
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage.
- **User role:** Synthetic owner/admin/manager
- **Exact navigation path:** /estimates → New photo estimate → Use a prospect
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Choose Use a prospect and enter a controlled synthetic name/contact address.
2. Keep service property separate; add supported pricing and save.
3. Check CRM counts/IDs to confirm saving a prospect estimate did not create or overwrite a customer.
4. Retain the draft for later explicitly approved conversion.

- **Expected result:** Prospect details remain on the estimate until explicit approved conversion; unrelated or matching customers are not overwritten.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `tests/estimates.integration.test.js:78`; `tests/estimates.integration.test.js:85`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### EST-003 — Gallery/camera photos and failed upload recovery

- **Test ID:** EST-003
- **Feature/module:** Estimates
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage. Harmless test photos, camera/gallery permission; a maximum of six photos.
- **User role:** Synthetic staff user; iPhone Safari operator
- **Exact navigation path:** /estimates → draft → Work photos
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 10 minutes
- **Test steps:**

1. Choose an existing photo and capture one new photo on iPhone Safari.
2. Cancel a picker and reopen the same draft.
3. Save; verify selected/uploaded/attached status and reopen each saved image.
4. Use a controlled offline interruption to verify failure feedback and retained photo/draft; reconnect and retry once.

- **Expected result:** Photos remain tied to the correct estimate and version; cancellation/error does not silently discard selected files; no permanent public file URL appears.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/EstimatesPage.jsx:76`; `tests/estimates.integration.test.js:42`; `tests/save-workflows.ui.test.js:130`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### EST-004 — Quantity, unit price and tax calculations

- **Test ID:** EST-004
- **Feature/module:** Estimate pricing
- **Preconditions:** Synthetic estimate with labor 1.5 × $100 and materials 2 × $25; tax 7.5%.
- **User role:** Synthetic owner/admin/manager
- **Exact navigation path:** /estimates → draft → Labor and materials
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Save the controlled line items and verify subtotal $200, tax $15 and total $215.
2. Change quantities within supported precision and verify version/total refresh.
3. Run negative prices, excess decimal precision and forged total rejection in the emulator only.

- **Expected result:** Server owns cents/tax/version; UI arithmetic and PDF agree; client totals or invalid inputs cannot override canonical totals.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `functions/estimates.js:46`; `tests/estimates.integration.test.js:19`; `routeLogisticsWeb/src/utils/estimateDraft.js`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### EST-005 — Discount control availability

- **Test ID:** EST-005
- **Feature/module:** Estimate pricing
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage.
- **User role:** Synthetic owner/admin/manager
- **Exact navigation path:** /estimates → Scope and terms / Labor and materials
- **Execution / evidence class:** manual; Source/configuration gap or missing external acceptance
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Inspect the existing estimate fields for a supported discount control.
2. Do not represent a negative-price line as a supported discount; server rejects negative unit prices.

- **Expected result:** The unsupported discount feature is explicitly recorded rather than marked passed or worked around silently.
- **Actual result:** Source inspection: no estimate discount input/calculation exists. Pilot can use supported non-negative line pricing if discounts are not essential.
- **Status:** **Blocked**
- **Evidence reference:** `routeLogisticsWeb/src/pages/EstimatesPage.jsx:78`; `functions/estimates.js:46`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### EST-006 — Branded PDF generation and external preview

- **Test ID:** EST-006
- **Feature/module:** Estimate PDFs
- **Preconditions:** Saved synthetic estimate and synthetic company logo URL/colors already verified; no customer PII in photos.
- **User role:** Synthetic staff user; desktop and mobile browser
- **Exact navigation path:** /estimates → saved version → Download estimate PDF
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. Download the saved version’s PDF and open it in the browser PDF viewer.
2. Verify business attribution, recipient, explicit service property, scope, images, line items, totals and validity.
3. Compare the same downloaded document on desktop and iPhone.
4. Record that PDF preview uses the downloaded viewer; no dedicated in-app Preview button is currently implemented.

- **Expected result:** Readable branded version-specific PDF matches the server totals and approved property without permanent public storage URLs.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `functions/estimates.js:106`; `routeLogisticsWeb/src/pages/EstimatesPage.jsx:82`; `tests/estimates.integration.test.js:35`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### EST-007 — Authorized email, private PDF and status

- **Test ID:** EST-007
- **Feature/module:** Estimate email
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage. Any email/push recipient and message count must be explicitly authorized before this case; otherwise leave the sending step Not Run. No customer SMS campaigns. Explicitly authorize this estimate email; the earlier review-email approval is not reused.
- **User role:** Synthetic staff sender; authorized test recipient
- **Exact navigation path:** /estimates → saved draft → Email estimate for approval
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. Confirm the recipient and saved version, then approve one email through the confirmation dialog.
2. Refresh delivery status and record queued/SMTP accepted/failure separately from inbox receipt.
3. Open the received PDF/link; verify it refers only to this estimate version and contains no private storage path.

- **Expected result:** One versioned private PDF email is queued/delivered only as authorized; failure is actionable and does not imply customer approval.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `tests/estimates.integration.test.js:51`; `tests/estimates.integration.test.js:66`; `functions/mail.js:29`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### EST-008 — Signed customer approval and revision behavior

- **Test ID:** EST-008
- **Feature/module:** Estimate approval
- **Preconditions:** One controlled estimate email already authorized/received; any replacement email needs separate permitted count.
- **User role:** Authorized test recipient; synthetic staff user
- **Exact navigation path:** Received /estimate-approval link; /estimates → saved record
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. Open the signed link and inspect exact version, scope, property and total.
2. Enter the test signer name and explicit approval.
3. Confirm the provider sees approved status and original approved terms are immutable.
4. For a revision, use a new version/copy as supported and confirm a new customer approval is required; exercise superseded-token attacks in the emulator.

- **Expected result:** Approval binds one version and recipient; later edits cannot reuse that approval, and the original history is preserved.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `tests/estimates.integration.test.js:51`; `tests/estimates.integration.test.js:61`; `routeLogisticsWeb/src/pages/EstimateApprovalPage.jsx`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### EST-009 — Approved estimate to one scheduled job

- **Test ID:** EST-009
- **Feature/module:** Estimate conversion
- **Preconditions:** Approved synthetic customer/prospect quote; explicit existing-customer selection or create-customer approval; valid current territory; permitted outbound gates.
- **User role:** Synthetic owner/admin/manager
- **Exact navigation path:** /estimates → approved estimate → Convert approved estimate
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. Choose a service date/time and validate the approved property for scheduling.
2. For a prospect, select the matching controlled customer or explicitly create one; do not overwrite an existing customer.
3. Confirm conversion and inspect the resulting scheduled job and original quote.
4. Repeat only the idempotent retry in the emulator; live UI should show the recorded converted job.

- **Expected result:** One job/customer conversion occurs; current geography and approved property are preserved; an existing conversion cannot duplicate or retroactively fail after a boundary change.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `tests/estimates.integration.test.js:78`; `tests/estimates.integration.test.js:85`; `tests/serviceAreas.workflows.integration.test.js`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### EST-010 — Expiration, replay, forged approval and private-file regressions

- **Test ID:** EST-010
- **Feature/module:** Estimate security
- **Preconditions:** Local demo emulators; no real expired links/records are edited.
- **User role:** Codex/local emulator
- **Exact navigation path:** Local: tests/estimates.integration.test.js + tests/firestore.rules.test.js
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run expiry/superseded approval, stale version, wrong-company, forged paid/approved fields and document-path checks.
2. Run duplicate PDF/photo operation and repeated conversion tests.

- **Expected result:** Expired/superseded/forged requests fail without creating a job or leaking a private file; valid retries are idempotent.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. This is automated coverage only; no corresponding physical/manual procedure is claimed complete.
- **Status:** **Pass**
- **Evidence reference:** `tests/estimates.integration.test.js:61`; `tests/estimates.integration.test.js:72`; `tests/firestore.rules.test.js:44`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Emulator fixtures only.

#### EST-011 — Save feedback, unsaved work and version history

- **Test ID:** EST-011
- **Feature/module:** Estimate usability
- **Preconditions:** Dedicated synthetic pest or pool fixture set, saved baseline and permitted test identities. Never edit Acme’s legitimate customers, active memberships, jobs or coverage.
- **User role:** Synthetic staff user
- **Exact navigation path:** /estimates → draft and saved record
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Verify unchanged saved input disables Save; change/revert a value and inspect dirty state.
2. Leave with an unsaved note/photo, choose Keep editing, then save and inspect confirmation.
3. Reopen the saved record and inspect Version history; simulate list-refresh failure only in the local UI harness.

- **Expected result:** Unsaved work stays recoverable, saved-vs-list-refresh failures are distinguished, and versions remain auditable.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `tests/save-workflows.ui.test.js:122`; `tests/save-workflows.ui.test.js:130`; `routeLogisticsWeb/src/pages/EstimatesPage.jsx:91`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

### Phase 13 — Invoices and Stripe test payments

#### INV-01 — Invoices: generate once from a synthetic job

- **Test ID:** INV-01
- **Feature/module:** Invoices: generate once from a synthetic job
- **Preconditions:** A clearly labeled synthetic job with a known $10.00 cost; no real customer invoice is selected.
- **User role:** Pest-control company owner or authorized finance admin
- **Exact navigation path:** /jobs → open synthetic job details → Create Invoice → /invoices
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Create the invoice from the synthetic job and record its fixture ID/number.
2. Return to the same job and choose Create Invoice again once; verify the existing non-void invoice opens.
3. Inspect customer/job association, line description, quantity, unit price, subtotal, tax and total; do not mark an actual customer invoice paid.

- **Expected result:** Sequential creation reuses one invoice for that job. Current UI creates one service line from job cost with default zero tax; it does not provide a standalone line-item/discount editor.
- **Actual result:** Not executed against the production UI or device in this acceptance run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/JobManagementPage.jsx:40`; `routeLogisticsWeb/src/pages/JobManagementPage.jsx:804`; `routeLogisticsWeb/src/services/invoiceService.js:50`
- **Cleanup instructions:** Retain the marked synthetic fixture for audit. Restore only its saved baseline settings when specified. Do not delete or change existing customer, membership, job, or financial records.

#### INV-02 — Invoices: rendering, filters and print

- **Test ID:** INV-02
- **Feature/module:** Invoices: rendering, filters and print
- **Preconditions:** The synthetic invoice from INV-01; pop-ups permitted for this site.
- **User role:** Owner or authorized finance admin
- **Exact navigation path:** /invoices → All/Draft/Sent/Overdue/Paid/Void → Print
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Use the available status filters and identify only the synthetic invoice.
2. Choose Print, inspect business/customer fields and arithmetic at desktop and phone widths, then cancel the system print dialog.
3. Verify escaped text, long descriptions, missing-contact fields and overdue display using only synthetic fixtures.

- **Expected result:** List/status/total and print view agree; print does not charge, send an email, or mutate the invoice.
- **Actual result:** Not executed against the production UI or device in this acceptance run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/InvoicesPage.jsx`; `routeLogisticsWeb/src/services/invoiceMath.test.js`
- **Cleanup instructions:** Retain the marked synthetic fixture for audit. Restore only its saved baseline settings when specified. Do not delete or change existing customer, membership, job, or financial records.

#### INV-03 — Invoices: totals, role restrictions and financial immutability

- **Test ID:** INV-03
- **Feature/module:** Invoices: totals, role restrictions and financial immutability
- **Preconditions:** Local synthetic invoices; destructive/invalid state tests are emulator-only.
- **User role:** Codex using local emulators
- **Exact navigation path:** Repository root → npm run test:functions; npm run test:web; npm run test:rules
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run invoice math and rule suites for quantities, rounding, totals, invalid amounts and allowed states.
2. Run payment-lock, paid-invoice immutability and cross-tenant/technician denial test cases.
3. Do not reproduce these adverse mutations on existing production invoices.

- **Expected result:** Unsupported/negative/non-finite/fractional-cent payment amounts fail, financial changes require the right role, and locks/paid states cannot be forged.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. No new provider write, transaction, message or physical-device action was performed for this case.
- **Status:** **Pass**
- **Evidence reference:** `routeLogisticsWeb/src/services/invoiceMath.test.js`; `tests/firestore.rules.test.js`; `tests/payments.integration.test.js`; `tests/paymentLifecycle.integration.test.js`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Emulator only.

#### INV-04 — Stripe: mode, account and Payment Element display

- **Test ID:** INV-04
- **Feature/module:** Stripe: mode, account and Payment Element display
- **Preconditions:** Dedicated synthetic sent invoice; deployed/backend/frontend mode must be test and live approval false.
- **User role:** Owner or authorized finance admin
- **Exact navigation path:** /integrations → Stripe readiness; /invoices → synthetic Sent invoice → Test card payment
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 4 minutes
- **Test steps:**

1. Confirm test mode on readiness and that the payment action says Test card payment.
2. Open the payment dialog; confirm the Stripe Payment Element loads and the displayed invoice total is correct.
3. Close before submitting. If a fresh payment is separately required later, use Stripe documented test credentials only; never a real card.

- **Expected result:** Matching test frontend/backend configuration is shown. Payment Element loading is a UI acceptance check; prior API success does not prove this browser interaction.
- **Actual result:** Not executed against the production UI or device in this acceptance run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/components/InvoicePayment.jsx`; `routeLogisticsWeb/src/services/paymentConfig.js`; `.migration/stripe-acceptance-run.json`
- **Cleanup instructions:** Close dialog; if an unpaid intent was created, use Cancel payment attempt only on this synthetic invoice.

#### INV-05 — Stripe: previously verified controlled test settlement

- **Test ID:** INV-05
- **Feature/module:** Stripe: previously verified controlled test settlement
- **Preconditions:** Read-only review of the prior dedicated $1.00 USD synthetic test; do not create another payment merely to repeat evidence.
- **User role:** Codex/operator reviewing existing sanitized evidence
- **Exact navigation path:** Existing evidence → .migration/stripe-acceptance-run.json
- **Execution / evidence class:** mixed; Historical provider/live evidence — not repeated
- **Hands-on estimate:** 1 minutes
- **Test steps:**

1. Verify the stored run says livemode false, provider succeeded, metadata/account match and signed event recorded.
2. Verify actual invoice status remained sent, testPaymentStatus became succeeded, paidAt remained absent and lock cleared.
3. Record the prior execution date and scope; do not label it newly executed or a real settlement.

- **Expected result:** The prior provider transaction proves test-mode creation/reconciliation only and does not mark a real invoice paid.
- **Actual result:** Historical provider PASS on November 13, 2026: dedicated $1.00 test intent succeeded and testPaymentStatus reconciled; actual invoice remained sent with no paidAt. No new charge/refund performed.
- **Status:** **Pass**
- **Evidence reference:** `.migration/stripe-acceptance-run.json`
- **Cleanup instructions:** Retain previous fixture; no provider write or secret access.

#### INV-06 — Stripe: signatures, replay, failures, refunds and disputes

- **Test ID:** INV-06
- **Feature/module:** Stripe: signatures, replay, failures, refunds and disputes
- **Preconditions:** Provider stubs and synthetic webhook fixtures; no Stripe API mutation.
- **User role:** Codex using local emulators
- **Exact navigation path:** Repository root → npm run test:rules
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run current payment suites for genuine signed/tampered/expired signatures, concurrent duplicate callbacks and wrong-mode/foreign metadata.
2. Run failed/processing/cancelled payment, partial/full refund and dispute reconciliation cases using mocked current provider state.
3. Verify all eight supported event types and that an older event cannot regress a newer settlement/refund.

- **Expected result:** Events reconcile idempotently and preserve tenant/invoice ownership. This verifies refund-event handling, not an RL refund-creation screen or a real refund.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. No new provider write, transaction, message or physical-device action was performed for this case.
- **Status:** **Pass**
- **Evidence reference:** `tests/payments.integration.test.js`; `tests/paymentLifecycle.integration.test.js`; `functions/paymentLifecycle.js:5`; `.migration/stripe-acceptance-run.json`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Emulator only.

#### INV-07 — Invoices: customer payment/history visibility

- **Test ID:** INV-07
- **Feature/module:** Invoices: customer payment/history visibility
- **Preconditions:** Authorized synthetic sent invoice associated with the portal customer; a second provider/customer fixture exists.
- **User role:** Single-provider customer and unauthorized customer
- **Exact navigation path:** /portal → select synthetic provider → Invoices and payment history
- **Execution / evidence class:** mixed; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Open the authorized provider invoice and inspect its status, amounts and payment history.
2. Confirm a pending/test payment is clearly described as test and does not falsely say a real invoice was paid.
3. Use emulator authorization tests for foreign invoice IDs, moved invoice ownership and revoked associations; do not expose real invoices in screenshots.

- **Expected result:** Customers see only invoices/payment records owned through the current provider association; foreign or revoked records are denied.
- **Actual result:** Not executed against the production UI or device in this acceptance run.
- **Status:** **Not Run**
- **Evidence reference:** `tests/paymentLifecycle.integration.test.js`; `tests/payments.integration.test.js`; `routeLogisticsWeb/src/components/PaymentHistory.jsx`; `functions/paymentLifecycle.js`
- **Cleanup instructions:** Retain the marked synthetic fixture for audit. Restore only its saved baseline settings when specified. Do not delete or change existing customer, membership, job, or financial records.

#### INV-08 — Invoices: cancellation and safe status controls

- **Test ID:** INV-08
- **Feature/module:** Invoices: cancellation and safe status controls
- **Preconditions:** Only an acceptance fixture is selected; preserve all real invoice status and balances.
- **User role:** Owner/finance admin; unauthorized technician
- **Exact navigation path:** /invoices → synthetic invoice → Cancel payment attempt / Mark sent / Void
- **Execution / evidence class:** mixed; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Use an emulator for destructive delete/void and forged-paid tests; inspect the production UI controls without acting on real invoices.
2. For an intentionally created synthetic pending test intent, cancel its unpaid attempt and verify unlock/history.
3. Verify that Cancel attempt explicitly says it does not issue a refund and technicians cannot access finance actions.

- **Expected result:** Only the intended synthetic attempt is cancelled; no refund occurs, existing financial records are untouched, and status controls are role scoped.
- **Actual result:** Not executed against the production UI or device in this acceptance run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/InvoicesPage.jsx`; `tests/payments.integration.test.js`; `tests/firestore.rules.test.js`
- **Cleanup instructions:** Retain the marked synthetic fixture for audit. Restore only its saved baseline settings when specified. Do not delete or change existing customer, membership, job, or financial records.

#### INV-09 — Invoice email authorization and disabled live confirmation

- **Test ID:** INV-09
- **Feature/module:** Invoice email authorization and disabled live confirmation
- **Preconditions:** No new email recipient approval exists for this acceptance run; test delivery must stay simulated.
- **User role:** Codex local tests; owner only if future email explicitly approved
- **Exact navigation path:** Repository root → npm run test:rules; /invoices → Email invoice
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run invoice email/receipt worker tests for valid recipient, paid/superseded invoices, retry leasing and customer/tenant changes.
2. Verify test Stripe events never queue live payment-confirmation mail.
3. Inspect the Email invoice action/confirmation only; do not click Send without separate current recipient authorization.

- **Expected result:** Email is guarded and idempotent where supported; test payment does not send a live receipt. Actual invoice-email inbox rendering is still a manual unperformed test.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. No new provider write, transaction, message or physical-device action was performed for this case.
- **Status:** **Pass**
- **Evidence reference:** `tests/workflows.integration.test.js`; `tests/paymentLifecycle.integration.test.js`; `functions/invoiceEmail.js`; `functions/mail.js`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Emulator only; no new message or production cleanup.

### Phase 14 — QuickBooks sandbox

#### QBO-01 — QuickBooks: connected sandbox status and safety gates

- **Test ID:** QBO-01
- **Feature/module:** QuickBooks: connected sandbox status and safety gates
- **Preconditions:** Existing dedicated Route Logistics connection; Sandbox Company_US_1, realm 9341455727000797.
- **User role:** Company owner
- **Exact navigation path:** /integrations → QuickBooks Online → Refresh connection status
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 4 minutes
- **Test steps:**

1. Refresh connection status once and record the displayed company/environment/health without copying tokens or internal authorization URLs.
2. Confirm sandbox environment, accounting exports disabled, production approval disabled and expected realm.
3. Compare current runtime/scheduler metadata from Section B with the UI; do not disconnect, export or refresh credentials manually.

- **Expected result:** Existing connection is preserved and clearly sandbox-only; blocked exports and any actionable connection error are visible.
- **Actual result:** Not executed against the production UI or device in this acceptance run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/IntegrationsPage.jsx`; `docs/quickbooks-tenant-onboarding.md`; `docs/quickbooks-sandbox-certification.md`
- **Cleanup instructions:** Retain the marked synthetic fixture for audit. Restore only its saved baseline settings when specified. Do not delete or change existing customer, membership, job, or financial records.

#### QBO-02 — QuickBooks: accounting dropdowns and saved defaults

- **Test ID:** QBO-02
- **Feature/module:** QuickBooks: accounting dropdowns and saved defaults
- **Preconditions:** Existing sandbox connection; record current saved income account and service item first.
- **User role:** Company owner; manager/admin for denial check
- **Exact navigation path:** /integrations → Accounting defaults → Refresh available options
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Load and search active income accounts/service items; inspect friendly names/details rather than raw ID entry.
2. Verify current valid defaults remain selected and unchanged Save defaults is disabled.
3. Select a different available value without saving, navigate away and decline/accept the unsaved warning as appropriate; discard to preserve baseline. Verify empty-list guidance in emulator/UI fixtures.

- **Expected result:** Read-only options are tenant scoped, saved selections persist, unavailable/empty/expired states are clear and nonowners cannot change defaults.
- **Actual result:** Not executed against the production UI or device in this acceptance run.
- **Status:** **Not Run**
- **Evidence reference:** `tests/quickbooks.options.integration.test.js`; `tests/quickbooks-portal.ui.test.js`; `routeLogisticsWeb/src/pages/IntegrationsPage.jsx:33`
- **Cleanup instructions:** Discard draft selection; do not overwrite live accounting defaults or create accounts/items.

#### QBO-03 — QuickBooks: prior customer/service/invoice synchronization and retry

- **Test ID:** QBO-03
- **Feature/module:** QuickBooks: prior customer/service/invoice synchronization and retry
- **Preconditions:** Read-only prior synthetic run RL-CERT-1411ac01; no new accounting write capability.
- **User role:** Codex/operator reviewing existing evidence
- **Exact navigation path:** docs/quickbooks-sandbox-certification.md → Actual Intuit sandbox operations
- **Execution / evidence class:** mixed; Historical provider/live evidence — not repeated
- **Hands-on estimate:** 2 minutes
- **Test steps:**

1. Review customer 59, existing service item 10 mapping, synthetic invoice 145 and stable operation/request identities in sanitized evidence.
2. Confirm accepted-response failure retry reused the same customer and that duplicate exports did not create another record.
3. Confirm current writes and production approval remain false; do not rerun the write runner.

- **Expected result:** Prior sandbox provider API evidence is preserved and labeled historical, not a newly executed browser export or production certification.
- **Actual result:** Historical provider PASS November 14, 2026: one synthetic customer, existing item mapping, invoice export, lost accepted-response retry and duplicate prevention passed; original connection/customer records stayed intact.
- **Status:** **Pass**
- **Evidence reference:** `docs/quickbooks-sandbox-certification.md`; `.migration/qb-live-1411ac01.json`
- **Cleanup instructions:** Retain original synthetic accounting records for audit. No new POST, update, void, delete or credentials access.

#### QBO-04 — QuickBooks: prior tax validation and unsupported cases

- **Test ID:** QBO-04
- **Feature/module:** QuickBooks: prior tax validation and unsupported cases
- **Preconditions:** Existing synthetic taxed invoice evidence; production writes stay disabled.
- **User role:** Codex/operator; accounting reviewer for interpretation
- **Exact navigation path:** docs/quickbooks-sandbox-certification.md → Tax validation; /integrations → Preview export only
- **Execution / evidence class:** mixed; Historical provider/live evidence — not repeated
- **Hands-on estimate:** 2 minutes
- **Test steps:**

1. Review prior non-taxable invoice 145 and manual 8% taxable invoice 146 totals and tenant/realm tax mapping.
2. Run emulator tests for wrong realm/tenant, inactive/mismatched code/rates, AST, compound/effective-dated rates, non-USD and discounts.
3. Confirm unsupported cases remain explicit review errors rather than silently exporting incorrect totals; do not create/modify a tax code, rate, item or account.

- **Expected result:** Only the certified simple US manual-tax path is claimed; unsupported accounting paths remain blocked and are not a general field-service pilot blocker if excluded from scope.
- **Actual result:** Historical provider PASS for explicit NON and simple US manual 8% tax; emulator rejection coverage exists for unsupported mappings. No new tax export/provider mutation in this run.
- **Status:** **Pass**
- **Evidence reference:** `docs/quickbooks-sandbox-certification.md`; `tests/quickbooks.tax.integration.test.js`; `functions/quickbooks.js:156`; `functions/quickbooks.js:203`
- **Cleanup instructions:** Read-only review and emulator cleanup only.

#### QBO-05 — QuickBooks: prior partial/full payment reconciliation

- **Test ID:** QBO-05
- **Feature/module:** QuickBooks: prior partial/full payment reconciliation
- **Preconditions:** Read-only provider receipts; do not process card/bank payments or invoke Stripe.
- **User role:** Codex/operator reviewing existing evidence
- **Exact navigation path:** Existing sandbox certification evidence → invoices/payments
- **Execution / evidence class:** mixed; Historical provider/live evidence — not repeated
- **Hands-on estimate:** 2 minutes
- **Test steps:**

1. Review synthetic $20 invoice 145, $5 partial payment 147 and remaining $15 payment 148.
2. Verify ProcessPayment=false, test status partial→paid, exact allocations/balances, repeated reconciliation unchanged and actual RL invoice status still sent.
3. Distinguish operator-origin event queue rows from genuine Intuit webhook notifications.

- **Expected result:** Historical non-processing sandbox payments reconcile into test fields without real charges or falsely marking the production invoice paid.
- **Actual result:** Historical provider PASS November 14, 2026: partial and full payment allocations matched; duplicates were suppressed and actual invoice status stayed sent. No new payment, refund or financial write in this run.
- **Status:** **Pass**
- **Evidence reference:** `docs/quickbooks-sandbox-certification.md`; `.migration/qb-live-1411ac01.json`; `tests/quickbooks.certification.integration.test.js`
- **Cleanup instructions:** Retain fixtures; no provider mutation.

#### QBO-06 — QuickBooks: tenant isolation, token refresh and errors

- **Test ID:** QBO-06
- **Feature/module:** QuickBooks: tenant isolation, token refresh and errors
- **Preconditions:** Two synthetic tenant connections and fake provider responses in the emulator only.
- **User role:** Codex using local emulators
- **Exact navigation path:** Repository root → npm run test:rules
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run owner authorization, cross-tenant connection/mapping/adoption/defaults denial and shared-realm uniqueness tests.
2. Run concurrent refresh rotation, expired/revoked token, provider timeout/failure and changed-owner/state race tests.
3. Confirm one platform credential pair serves tenant-isolated OAuth connections; no per-customer Secret Manager setup is required.

- **Expected result:** One tenant cannot read, modify or disconnect another connection; refresh is serialized safely and failures are actionable without leaking tokens.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. No new provider write, transaction, message or physical-device action was performed for this case.
- **Status:** **Pass**
- **Evidence reference:** `tests/quickbooks.tenancy.integration.test.js`; `tests/quickbooks.options.integration.test.js`; `tests/quickbooks.integration.test.js`; `tests/quickbooks.rules.test.js`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Emulator only.

#### QBO-07 — QuickBooks: controlled disconnect/reconnect acceptance

- **Test ID:** QBO-07
- **Feature/module:** QuickBooks: controlled disconnect/reconnect acceptance
- **Preconditions:** Owner schedules a brief interruption and explicitly chooses the sandbox connection; baseline company/realm/defaults/mappings recorded. Do not run automatically just to repeat previous evidence.
- **User role:** Existing sandbox company owner
- **Exact navigation path:** /integrations → QuickBooks Online → Disconnect → Reconnect
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. Confirm this is sandbox and no export is in flight, then disconnect once only when the owner chooses to execute this manual case.
2. Refresh until local disconnect completes; verify an Intuit revocation warning is distinguished from a stale transition and reconnect becomes available.
3. Reauthorize the same dedicated RL app and same sandbox realm; verify connection health/defaults/mappings and original accounting records remain preserved.

- **Expected result:** Disconnect invalidates local tokens safely; reconnect works without developer credentials/per-tenant secrets and does not leave a permanent finishing-disconnect state.
- **Actual result:** Not rerun in this acceptance program to avoid disrupting the preserved connection. Earlier investigation/fix has sanitized evidence and emulator coverage; fresh owner UI reconnection remains Not Run.
- **Status:** **Not Run**
- **Evidence reference:** `tests/quickbooks.tenancy.integration.test.js`; `.migration/qb-disconnect-investigation.json`; `.migration/qb-disconnect-portal-live.json`; `docs/quickbooks-tenant-onboarding.md`
- **Cleanup instructions:** Restore the original sandbox connection before ending the case; stop if the original realm/defaults cannot be confirmed. Never delete mappings or accounting records.

#### QBO-08 — QuickBooks: genuine webhook delivery remains unresolved

- **Test ID:** QBO-08
- **Feature/module:** QuickBooks: genuine webhook delivery remains unresolved
- **Preconditions:** Do not repeat synthetic accounting writes just to trigger another event; existing endpoint/subscriptions and previous controlled update are documented.
- **User role:** Operator with Intuit Development dashboard; Codex read-only logs
- **Exact navigation path:** Intuit dedicated RL app → Webhooks → Development; /integrations → Accounting connection health
- **Execution / evidence class:** mixed; Source/configuration gap or missing external acceptance
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Inspect the saved endpoint rlQuickBooksWebhook and Customer/Item/Invoice/Payment subscriptions without revealing verifier values.
2. Inspect Intuit delivery history for the prior controlled sandbox Customer update and correlate time/event with sanitized RL request/queue logs.
3. Only mark verified when a genuine provider POST, valid signature, correct realm/tenant routing and idempotent processing are evidenced; do not substitute portal SUCCESS, self-signed probes or operator queue rows.

- **Expected result:** A real provider-origin notification must be correlated before webhook acceptance is marked Pass. This external accounting issue must not stop unrelated CRM, dispatch, mobile or offline acceptance.
- **Actual result:** Blocked external verification: no genuine RL request was correlated with the prior sandbox Customer update or Intuit portal sample SUCCESS. The sample realm 310687 is not the connected realm; the observed 401 was our operator diagnostic, not provider delivery. No new delivery/write was triggered.
- **Status:** **Blocked**
- **Evidence reference:** `docs/quickbooks-sandbox-certification.md`; `.migration/qb-webhook-final-acceptance.json`; `.migration/qb-intuit-fresh-screenshot-audit.json`; `.migration/qb-intuit-fresh-portal-correlation.json`
- **Cleanup instructions:** Keep writes/production approval off and preserve the existing connection. Do not unpause accounting automation or change verifier values merely for this document.

### Phase 15 — SMS and push integrations

#### MSG-01 — Messaging: runtime limits and sender/readiness

- **Test ID:** MSG-01
- **Feature/module:** Messaging: runtime limits and sender/readiness
- **Preconditions:** No new send authorization exists for this document run; previous pilot budget/expiry must be read, never assumed.
- **User role:** Codex read-only metadata; owner viewing settings
- **Exact navigation path:** /integrations → SMS preferences; production metadata evidence in Section B
- **Execution / evidence class:** mixed; Current production metadata and regression
- **Hands-on estimate:** 1 minutes
- **Test steps:**

1. Record current broad SMS flags, review-automation flag, pilot scope/expiry and provider approval without reading credential payloads.
2. Confirm the owner UI cannot grant its own global sender or company-wide approval.
3. Confirm approved direct toll-free sender and existing signed callback endpoints are preserved; do not retarget the shared sender inbound route.

- **Expected result:** Broad SMS/review campaigns stay disabled; a previous limited pilot is not permission for a new customer, purpose or unlimited new test.
- **Actual result:** Fresh read-only deployed metadata on November 14, 4:31 PM Pacific confirms broad SMS enabled=false, liveApproved=false, bounded pilot=true and email=true. Source and current regression enforce independent provider suppression, tenant purpose consent and pilot gates. Pilot=true alone does not establish an unexpired recipient budget or authorize another send.
- **Status:** **Pass**
- **Evidence reference:** `docs/customer-sms-setup.md`; `.migration/reviews-postdeploy.json`; `tests/sms.integration.test.js`; `tests/sms.pilot.integration.test.js`; `.migration/acceptance-production-inventory.json`
- **Cleanup instructions:** Read-only; preserve all approval and consent records.

#### MSG-02 — Twilio: previously verified real delivery and signed callback

- **Test ID:** MSG-02
- **Feature/module:** Twilio: previously verified real delivery and signed callback
- **Preconditions:** Existing authorized test sender/recipient evidence only; no current send is authorized by this plan.
- **User role:** Operator/Codex reviewing prior evidence
- **Exact navigation path:** docs/customer-sms-setup.md → November 14 working-infrastructure investigation
- **Execution / evidence class:** mixed; Historical provider/live evidence — not repeated
- **Hands-on estimate:** 1 minutes
- **Test steps:**

1. Review the prior single RL test from +1 888-250-6769 and distinguish accepted/sent from delivered.
2. Confirm Twilio delivered status, matching sender/recipient, signed callback reconciliation and operator receipt confirmation.
3. Record the date and that the current acceptance did not create another message.

- **Expected result:** Historical provider delivery proves the existing sender/transport/callback path, not new campaign approval or every template/device scenario.
- **Actual result:** Historical provider PASS November 14, 2026 at approximately 10:30 AM Pacific: one message delivered, signed sent/delivered callbacks matched, and recipient confirmed receipt.
- **Status:** **Pass**
- **Evidence reference:** `docs/customer-sms-setup.md`; `.migration/rl-working-sms-test.json`
- **Cleanup instructions:** No send, credential read, recipient enrollment or record change.

#### MSG-03 — SMS: appointment/reminder/en-route/completion template pilot

- **Test ID:** MSG-03
- **Feature/module:** SMS: appointment/reminder/en-route/completion template pilot
- **Preconditions:** Fresh specific authorization for this handset/purpose/message budget; a valid narrow pilot; do not reuse prior consent as a blanket new campaign approval.
- **User role:** Synthetic company owner and technician plus explicitly authorized test handset
- **Exact navigation path:** /customers → synthetic customer → SMS preferences and consent; /integrations → SMS; /dispatch; mobile assigned job
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 12 minutes
- **Test steps:**

1. Record the exact four service purposes independently consented, current provider suppression and remaining private pilot budget/expiry.
2. On synthetic jobs only, exercise appointment confirmation, pre-visit due scheduling, en-route and completion one at a time within the approved total budget.
3. For each, compare worker/outbox status, genuine signed provider callback, handset receipt and absence of another customer recipient; stop at the budget.

- **Expected result:** Only approved purposes/recipient receive messages; templates identify the provider, callbacks match and one logical event does not duplicate. No company-wide campaign is enabled.
- **Actual result:** Not executed against the production UI or device in this acceptance run.
- **Status:** **Not Run**
- **Evidence reference:** `docs/customer-sms-setup.md`; `tests/sms.integration.test.js`; `tests/sms.pilot.integration.test.js`
- **Cleanup instructions:** Disable/expire only the dedicated test pilot after approval budget is used; retain consent/history. Do not touch shared sender configuration.

#### MSG-04 — SMS: historical physical STOP/START and independent re-consent

- **Test ID:** MSG-04
- **Feature/module:** SMS: historical physical STOP/START and independent re-consent
- **Preconditions:** Read-only acceptance of previous genuine STOP/START; no fresh STOP requested in this documentation run.
- **User role:** Operator/Codex reviewing prior handset/provider evidence
- **Exact navigation path:** docs/customer-sms-setup.md → Provider and tenant approval
- **Execution / evidence class:** mixed; Historical provider/live evidence — not repeated
- **Hands-on estimate:** 1 minutes
- **Test steps:**

1. Review the signed Twilio Event Streams HTTP 200 reductions and handset acknowledgements for prior STOP then START.
2. Verify STOP cancelled the dedicated queued test without a provider send; START removed provider suppression only and did not revive consent or cancelled rows.
3. Confirm independent four-purpose consent renewal was recorded before the old pilot activated.

- **Expected result:** Provider suppression and tenant consent are separate; START alone cannot restore or create RL permission. A shared sender STOP affects its recipient across applications.
- **Actual result:** Historical provider/handset PASS November 14, 2026; signed events and actual acknowledgements agreed. No new opt-out or re-opt-in was sent now.
- **Status:** **Pass**
- **Evidence reference:** `docs/customer-sms-setup.md`; `.migration/sms-readiness-evidence.json`; `tests/sms.integration.test.js`
- **Cleanup instructions:** No new shared-number STOP/START action; leave current consent and suppression unchanged.

#### MSG-05 — SMS: suppression, signatures, retries, duplicates and pilot safety

- **Test ID:** MSG-05
- **Feature/module:** SMS: suppression, signatures, retries, duplicates and pilot safety
- **Preconditions:** Mock transports, synthetic phones and signed callback fixtures only.
- **User role:** Codex using local emulators
- **Exact navigation path:** Repository root → npm run test:rules
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run current SMS/pilot suites for forged/wrong-service callback rejection, provider STOP ordering/ties, independent consent withdrawal and shared-tenant suppression.
2. Run duplicate suppression, queued-message cancellation, uncertain acceptance handling, pilot limits/expiry and foreign-recipient denial.
3. Run new review-invitation-specific consent and durable queue recovery tests without any real Twilio API call.

- **Expected result:** No unauthorized recipient/purpose sends, START never restores consent, duplicates do not consume another pilot slot, and transient queue failures recover safely with bounded attempts.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. No new provider write, transaction, message or physical-device action was performed for this case.
- **Status:** **Pass**
- **Evidence reference:** `tests/sms.integration.test.js`; `tests/sms.pilot.integration.test.js`; `tests/reviewInvitations.integration.test.js`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Emulator only.

#### MSG-06 — iOS push: previously verified receipt and tap

- **Test ID:** MSG-06
- **Feature/module:** iOS push: previously verified receipt and tap
- **Preconditions:** Read-only prior corporate TestFlight/APNs acceptance; do not enqueue another push now.
- **User role:** Operator/Codex reviewing prior acceptance
- **Exact navigation path:** Mobile Settings → Native work notifications; notification → existing job
- **Execution / evidence class:** mixed; Historical provider/live evidence — not repeated
- **Hands-on estimate:** 1 minutes
- **Test steps:**

1. Review corporate bundle/team/APNs production entitlement and installed-build evidence.
2. Review the prior provider receipt and operator confirmation that tapping Important job update opened the existing completed job.
3. Record that the push referred to existing work; it did not create a new assignment or prove a new job queue update.

- **Expected result:** Prior iOS visible delivery and authorized job tap are evidenced without overstating assignment/scheduling or all app-state coverage.
- **Actual result:** Historical physical/provider PASS November 14, 2026: APNs/Expo receipt was successful and operator said the notification opened the existing job.
- **Status:** **Pass**
- **Evidence reference:** `.migration/push-tap-test-20261114.json`; `.migration/native-push-ipa-audit.json`; `.migration/native-push-eas-metadata.json`
- **Cleanup instructions:** No push or job mutation.

#### MSG-07 — iOS push: assignment and schedule-change end-to-end

- **Test ID:** MSG-07
- **Feature/module:** iOS push: assignment and schedule-change end-to-end
- **Preconditions:** Corporate TestFlight installed version recorded; explicit authorization for the technician handset notifications; synthetic job assigned to that member.
- **User role:** Synthetic company manager and assigned iOS technician
- **Exact navigation path:** /dispatch → assign/reschedule synthetic job; iPhone → Settings → Native work notifications
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 10 minutes
- **Test steps:**

1. Confirm notification permission and native registration are enabled for the signed-in technician.
2. Create/assign one synthetic future job on the web, observe its arrival in the technician queue, and inspect/tap the assignment notification.
3. Reschedule the same job once, verify queue/Dispatch Board updates and notification content; include foreground and background/terminated states in the device checklist.

- **Expected result:** Only the authorized assigned technician receives correct work updates, taps open that job, and web/mobile queues reflect current schedule without duplicates.
- **Actual result:** Not executed against the production UI or device in this acceptance run.
- **Status:** **Not Run**
- **Evidence reference:** `functions/nativePush.js`; `functions/nativePush.emulator.test.js`; `routeLogisticsMobile/services/nativePush.js`; `docs/commercial-readiness.md`
- **Cleanup instructions:** Retain the marked synthetic fixture for audit. Restore only its saved baseline settings when specified. Do not delete or change existing customer, membership, job, or financial records.

#### MSG-08 — Push: preferences, invalid tokens and revoked membership

- **Test ID:** MSG-08
- **Feature/module:** Push: preferences, invalid tokens and revoked membership
- **Preconditions:** Emulator for token deletion and member revocation; never deactivate a real worker for this test.
- **User role:** Codex emulator; operator optional permitted phone UI
- **Exact navigation path:** Repository root → npm run test:functions; npm run test:rules; iPhone Settings → Native work notifications
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run device ownership/registration, duplicate events, current member/job checks and dead-token cleanup tests.
2. On an explicitly authorized synthetic account only, inspect native notification preference enable/disable and status refresh without sending.
3. Verify browser FCM and Expo native registration are distinct paths and a revoked/foreign member cannot use a stale notification to open work.

- **Expected result:** Preferences and live authorization govern delivery/taps; invalid device tokens are cleaned only from their own channel, and revoked members lose access.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. No new provider write, transaction, message or physical-device action was performed for this case.
- **Status:** **Pass**
- **Evidence reference:** `functions/nativePush.emulator.test.js`; `functions/nativePush.test.js`; `routeLogisticsMobile/scripts/nativePush.test.js`; `functions/notify.js`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Emulator only; do not delete a production registration or revoke real membership.

#### MSG-09 — Web notification history and browser push

- **Test ID:** MSG-09
- **Feature/module:** Web notification history and browser push
- **Preconditions:** Explicit browser-notification permission; synthetic assignment; no message is generated without the operator choosing to execute.
- **User role:** Owner/manager and synthetic technician in separate approved browser profiles
- **Exact navigation path:** Web header → Enable notifications; /notifications; /dispatch assignment
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Inspect browser notification permission handling and saved Notifications page.
2. Assign an authorized synthetic job and compare browser delivery/history with the native push case without assuming they share device tokens.
3. Test denial/default browser permission states and links to work; record Chrome/Edge results separately.

- **Expected result:** Saved notifications remain tenant/user scoped; browser permission refusal is handled; browser/native paths do not claim each other’s delivery.
- **Actual result:** Not executed against the production UI or device in this acceptance run.
- **Status:** **Not Run**
- **Evidence reference:** `functions/index.js:302`; `functions/notify.js`; `routeLogisticsWeb/src/pages/NotificationsPage.jsx`
- **Cleanup instructions:** Retain the marked synthetic fixture for audit. Restore only its saved baseline settings when specified. Do not delete or change existing customer, membership, job, or financial records.

#### MSG-10 — Android FCM v1 and physical delivery prerequisite

- **Test ID:** MSG-10
- **Feature/module:** Android FCM v1 and physical delivery prerequisite
- **Preconditions:** Existing Firebase project only; no Android send until FCM v1 is configured in EAS and an approved physical build/account is available.
- **User role:** Operator responsible for Android build credentials
- **Exact navigation path:** EAS existing project → Android credentials; Android app → native notification settings
- **Execution / evidence class:** manual; Source/configuration gap or missing external acceptance
- **Hands-on estimate:** 10 minutes
- **Test steps:**

1. Inspect non-secret current EAS Android credential metadata; do not print or commit a service-account JSON.
2. If missing, record the required FCM v1 credential setup as an Android prerequisite rather than treating iOS APNs success as Android evidence.
3. When an authorized Android build exists, execute assignment/status delivery and tap cases on a real device, with current notification/runtime permissions.

- **Expected result:** Android native push is accepted only after a configured FCM v1 path and real-device receipt/tap; Android browser tests remain separate.
- **Actual result:** Blocked prerequisite at last verified EAS inspection (November 14, 2026): androidCredentials was empty. No physical Android delivery or tap is verified; parent current metadata may supersede this snapshot.
- **Status:** **Blocked**
- **Evidence reference:** `.migration/native-push-eas-metadata.json`; `docs/commercial-readiness.md`; `routeLogisticsMobile/app.config.js`
- **Cleanup instructions:** Do not create a new Firebase project, alter iOS signing, or expose credentials. Retain the existing Android package.

### Phase 16 — Security and access control

#### SEC-001 — Sign-out and session refresh behavior

- **Test ID:** SEC-001
- **Feature/module:** Authentication and sessions
- **Preconditions:** Dedicated browser profile per role; no irreplaceable unsynchronized work.
- **User role:** Each controlled staff role
- **Exact navigation path:** /login; /; one protected deep link
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 5 minutes
- **Test steps:**

1. Sign out using the normal app command; reopen a protected deep link.
2. Sign in again, background/return to the browser and refresh the page.
3. For true expired/invalid token scenarios use the auth emulator; never copy real ID/refresh tokens into evidence.

- **Expected result:** Signed-out users return to login; active verified workspace/role is rechecked; no stale private screen persists after session changes.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/components/ProtectedRoute.jsx:7`; `tests/staffLogin.auth.test.js`; `tests/syncclaims.e2e.test.js`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### SEC-002 — Role route matrix by deep link

- **Test ID:** SEC-002
- **Feature/module:** Authorization
- **Preconditions:** Existing controlled identities; inspect only data each role is authorized to access.
- **User role:** Owner; admin; manager; technician
- **Exact navigation path:** All protected routes in the route inventory
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. For each role, compare sidebar links to the documented route capability matrix.
2. Open a permitted route directly and then an unpermitted route such as technician /customers, manager /invoices, admin /reviews.
3. Confirm technician / and /my-work show assigned work only; company/team owner privileges are not inferred from labels.

- **Expected result:** UI and deep-link gates match the current role policy; no hidden-link-only security assumption.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `functions/shared/capabilities.json`; `routeLogisticsWeb/src/utils/routeAccess.js`; `tests/access.integration.test.js:30`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### SEC-003 — Cross-tenant API/rules adversarial regression

- **Test ID:** SEC-003
- **Feature/module:** Tenant isolation
- **Preconditions:** Demo fixture companies only; no destructive production probes.
- **User role:** Codex/local emulator
- **Exact navigation path:** Local: tests/access.integration.test.js + tests/firestore.rules.test.js
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run foreign company/customer/job/photo/service-plan/claim tests.
2. Include an owner of a second company and stale/revoked role claims.
3. Record exact suite results; do not infer a real two-device UI pass.

- **Expected result:** No user can read/mutate another tenant through forged IDs or role claims; safe server projections remain scoped.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. This is automated coverage only; no corresponding physical/manual procedure is claimed complete.
- **Status:** **Pass**
- **Evidence reference:** `tests/access.integration.test.js`; `tests/firestore.rules.test.js`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Local emulators only.

#### SEC-004 — Independent identity classes regression

- **Test ID:** SEC-004
- **Feature/module:** Platform and customer isolation
- **Preconditions:** Local emulator with staff, portal and explicit platform-admin identities.
- **User role:** Codex/local emulator
- **Exact navigation path:** Local: portal/platform/reviews authorization suites
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run cases proving ordinary owners/technicians cannot use platform administration.
2. Run portal sessions attempting staff/company creation, and staff email matching attempting customer reviews.
3. Run platform grant revocation and customer-provider association revocation cases.

- **Expected result:** Company ownership, platform access and portal customer identity remain distinct; email match alone never grants data access.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. This is automated coverage only; no corresponding physical/manual procedure is claimed complete.
- **Status:** **Pass**
- **Evidence reference:** `tests/platformCms.integration.test.js:19`; `tests/platformCms.rules.test.js:62`; `tests/reviews.integration.test.js`; `tests/portal.integration.test.js`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Local emulators only.

#### SEC-005 — Files, publication and revocation regression

- **Test ID:** SEC-005
- **Feature/module:** Storage authorization
- **Preconditions:** Demo Storage/Firestore emulators; harmless image/PDF fixtures.
- **User role:** Codex/local emulator
- **Exact navigation path:** Local: Storage + portal + access tests
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run unassigned/foreign photo reads, published/private portal document access and path traversal/MIME/oversize denial tests.
2. Revoke the fixture association/publication during a download and confirm final authorization recheck.
3. Verify no permanent bearer download token is returned.

- **Expected result:** Authorized bytes are declassified only for current scope/assignment/publication, and revoked or private files cannot escape.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. This is automated coverage only; no corresponding physical/manual procedure is claimed complete.
- **Status:** **Pass**
- **Evidence reference:** `tests/storage.rules.test.js`; `tests/portal.integration.test.js`; `tests/access.integration.test.js:85`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Stop emulators; no production files affected.

#### SEC-006 — OTP/review/invitation expiration and replay regression

- **Test ID:** SEC-006
- **Feature/module:** Rate limiting and bounded tokens
- **Preconditions:** Local clocks and fake messages only.
- **User role:** Codex/local emulator
- **Exact navigation path:** Local: staffLogin/portal/review/invitation/workflow tests
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run invalid/expired/consumed OTP and invitation checks; verify attempt/rate limits persist transactionally.
2. Run duplicate review and invitation replay, wrong recipient/provider and superseded staff link checks.
3. Verify no code/token is logged or returned by list/status APIs.

- **Expected result:** Guessing/replay/expiry cannot authorize a second operation or cross-provider access; private token payloads remain server-only.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. This is automated coverage only; no corresponding physical/manual procedure is claimed complete.
- **Status:** **Pass**
- **Evidence reference:** `tests/workflows.integration.test.js:89`; `tests/workflows.integration.test.js:115`; `tests/reviews.integration.test.js`; `tests/reviewInvitations.integration.test.js`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Emulator fixtures only; do not send live challenge requests for adversarial testing.

#### SEC-007 — Signature and duplicate-delivery regressions

- **Test ID:** SEC-007
- **Feature/module:** Webhook signatures
- **Preconditions:** Fake signed payloads, sandbox/test-mode identifiers and local transports.
- **User role:** Codex/local emulator
- **Exact navigation path:** Local: payments/QuickBooks/SMS integration tests
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run valid/tampered/unsigned/stale signature checks and concurrent duplicate events.
2. Verify each provider resolves the correct tenant and no test event alters a real invoice/payment.
3. Record genuine provider deliveries separately from these local results.

- **Expected result:** Unsigned/tampered events cannot mutate protected data; signed duplicates reconcile idempotently without real transactions.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. This is automated coverage only; no corresponding physical/manual procedure is claimed complete.
- **Status:** **Pass**
- **Evidence reference:** `tests/payments.integration.test.js`; `tests/quickbooks.tenancy.integration.test.js`; `tests/sms.integration.test.js`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Local emulator state only.

#### SEC-008 — Secret exposure and audit inspection

- **Test ID:** SEC-008
- **Feature/module:** Secrets and audit
- **Preconditions:** Only metadata and synthetic records; never call Secret Manager access on credential values for this test.
- **User role:** Codex with operator read-only metadata access
- **Exact navigation path:** Repository/deployed configuration metadata; no secret values
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Verify private credentials/service-account JSON are not committed or bundled; report patterns/counts only, not matching values.
2. Confirm runtime secret bindings and disabled financial/messaging flags from metadata.
3. Inspect a synthetic audit event and the telemetry scrubber; ensure request URL query/fragment and user/body/header details are scrubbed.

- **Expected result:** Backend secrets remain server-side; evidence contains no credentials/OTPs/invitation tokens; changes have appropriate audit identifiers.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/services/monitoring.js:12`; `functions/index.js`; `tests/reviews.rules.test.js`; `tests/firestore.rules.test.js:217`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### SEC-009 — Server-owned fields and immutable history regression

- **Test ID:** SEC-009
- **Feature/module:** Audit and privilege integrity
- **Preconditions:** Local synthetic fixtures only.
- **User role:** Codex/local emulator
- **Exact navigation path:** Local: Firestore/workflow/review/service-form rules and integration tests
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run attempts to self-grant roles/company ownership or write payment/location/review/private queue fields.
2. Run membership removal/transfer, chemical-log deletion and service-template revision protection test cases.
3. Confirm provider responses/notes/moderation cannot change original customer rating/comment or restore withdrawn permission.

- **Expected result:** Clients cannot bypass audited callables, overwrite immutable history or silently gain privileges.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. This is automated coverage only; no corresponding physical/manual procedure is claimed complete.
- **Status:** **Pass**
- **Evidence reference:** `tests/firestore.rules.test.js`; `tests/workflows.integration.test.js`; `tests/reviews.integration.test.js`; `tests/serviceForms.integration.test.js`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Local emulators only.

#### SEC-010 — Unsaved-input and modal lifecycle regression

- **Test ID:** SEC-010
- **Feature/module:** Safe editing
- **Preconditions:** Synthetic mocked interfaces; no production saves.
- **User role:** Codex/local UI harness
- **Exact navigation path:** Local: npm run test:web
- **Execution / evidence class:** automated; Current automated regression
- **Hands-on estimate:** 0 minutes
- **Test steps:**

1. Run changed/reverted/unchanged Save states and failed-save retry tests across company/customer/job/template/plan/route/estimate/checklist/review editors.
2. Run Cancel/Escape/back/navigation safeguards and duplicate-tap tests.
3. Confirm pending operations do not discard context or affect another selected tenant/job.

- **Expected result:** Changes are explicitly saved/discarded; failures retain retryable context and no invisible modal overlay traps the user.
- **Actual result:** Current November 14 acceptance run passed the referenced test cases in the Functions (138 passed, 1 unit-invocation skip), Firestore/Storage/integration (330 passed), and final full web UI/unit (232 passed, including five emulator opt-in/transport guard test cases) suites as applicable. This is automated coverage only; no corresponding physical/manual procedure is claimed complete.
- **Status:** **Pass**
- **Evidence reference:** `tests/editable-modals.ui.test.js`; `tests/save-workflows.ui.test.js`; `tests/service-plans.ui.test.js`; `tests/reviews.ui.test.js`; `.migration/acceptance-functions.log`; `.migration/acceptance-rules.log`; `.migration/acceptance-web-final.log`
- **Cleanup instructions:** Close local harness and browser.

### Phase 17 — Browser and device coverage

#### BRO-001 — Chrome desktop critical workflow

- **Test ID:** BRO-001
- **Feature/module:** Browser coverage
- **Preconditions:** Current stable Chrome, 1440×900 or larger; synthetic fixtures; any outgoing messages separately authorized.
- **User role:** Operator with authorized owner/manager/customer accounts
- **Exact navigation path:** Chrome desktop → /login → /dispatch → /jobs → /estimates → /portal
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 12 minutes
- **Test steps:**

1. Execute one supported schedule/dispatch/detail/edit workflow.
2. Inspect PDF download, portal file viewing and review form with keyboard/mouse.
3. Record browser/version, screenshots with no tokens and any console/network errors.

- **Expected result:** Critical screens remain readable and operable with no horizontal overflow or hidden action controls; source/UI tests alone do not count as this live workflow.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/App.jsx`; `Physical/browser evidence required`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### BRO-002 — Edge desktop critical workflow

- **Test ID:** BRO-002
- **Feature/module:** Browser coverage
- **Preconditions:** Actual Edge installation, not a Chromium user-agent label; synthetic fixtures.
- **User role:** Operator with authorized test accounts
- **Exact navigation path:** Microsoft Edge desktop → /dispatch → /portal
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 10 minutes
- **Test steps:**

1. Repeat job details/reopen and one safe edit, then portal provider selection and published file preview.
2. Check downloads, form feedback and keyboard navigation.
3. Record Edge version and defects separately from Chrome.

- **Expected result:** Actual Edge behavior is verified; Chrome-only headless evidence is not mislabeled Edge certification.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `Physical/browser evidence required`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### BRO-003 — iPhone Safari customer and estimate flow

- **Test ID:** BRO-003
- **Feature/module:** Browser coverage
- **Preconditions:** Physical operator iPhone; explicitly authorized new links/codes where required; use no irreplaceable data.
- **User role:** Authorized customer; synthetic staff user
- **Exact navigation path:** Physical iPhone Safari → /portal; authorized /review and /estimate-approval links
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 15 minutes
- **Test steps:**

1. Use the ordinary OTP portal sign-in and switch between the two controlled providers.
2. Review shared photo/PDF/payment-history metadata; exercise a synthetic feedback form.
3. Inspect estimate/gallery capture/download and app background/resume behavior as permitted.
4. Check keyboard zoom, readable labels, tappable actions, scroll/modal closure and orientation.

- **Expected result:** Safari on a real iPhone completes supported browser flows; desktop viewport simulation does not establish this result.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `Physical-device evidence required`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### BRO-004 — Android browser critical customer flow

- **Test ID:** BRO-004
- **Feature/module:** Browser coverage
- **Preconditions:** Physical Android phone; approved test inbox; synthetic fixtures.
- **User role:** Authorized controlled customer
- **Exact navigation path:** Physical Android Chrome → /portal; secure review link
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 12 minutes
- **Test steps:**

1. Sign into the portal through the ordinary flow; inspect provider switching and shared files.
2. Fill/cancel a synthetic review; submit only the intended fixture.
3. Inspect keyboard, file download, orientation and back behavior.

- **Expected result:** The actual Android browser works; no inference from desktop Chrome emulation.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `Physical Android evidence required`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### BRO-005 — Tablet and phone-width layout audit

- **Test ID:** BRO-005
- **Feature/module:** Responsive layout
- **Preconditions:** Harmless fixtures/mocked harness where authentication cannot be exercised safely; record which is used.
- **User role:** Operator/Codex browser harness
- **Exact navigation path:** Representative /platform-admin, /dispatch, /customers, /estimates, /portal, /reviews
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 10 minutes
- **Test steps:**

1. Inspect 390×844 phone, 768×1024 tablet and 1440×900 desktop widths.
2. Check long company/customer/service names, tables, dialogs and empty/error states.
3. Run axe where available and record violations/overflow; distinguish mocked layout from live workflow evidence.

- **Expected result:** No inaccessible overflow or hidden actions at tested widths; evidence explicitly names page scope and whether mocked/live.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `Browser/axe report required; historical review-only 12-scenario report is not full-platform certification`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### BRO-006 — Keyboard, focus and assistive labels

- **Test ID:** BRO-006
- **Feature/module:** Accessibility
- **Preconditions:** Keyboard-only pass; synthetic forms; no active transaction.
- **User role:** Operator; optional Codex axe harness
- **Exact navigation path:** Chrome/Edge → representative forms/dialogs and public content
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 10 minutes
- **Test steps:**

1. Use Tab/Shift+Tab/Enter/Space and Escape through navigation, modal details and form choices.
2. Check visible focus, dialog focus return, labels, radio/checkbox semantics and success/error announcements.
3. Try 200% zoom and high-contrast/large-text settings; capture only nonprivate fixtures.

- **Expected result:** Core actions remain reachable and understandable without pointer input; axe results are accompanied by a manual keyboard pass.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/components/ReviewForm.jsx`; `routeLogisticsWeb/src/pages/DispatchPage.jsx`; `Manual accessibility evidence required`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### BRO-007 — Actionable browser failures without lost drafts

- **Test ID:** BRO-007
- **Feature/module:** Error and offline browser states
- **Preconditions:** Browser DevTools offline simulation and harmless synthetic draft; no invoice charge/export send in flight.
- **User role:** Synthetic owner/manager/customer
- **Exact navigation path:** Representative safe editor; /portal; /reviews
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. Load a permitted page, turn browser network offline, change a harmless draft and attempt save.
2. Confirm visible error, retained input and disabled duplicate operations.
3. Reconnect, retry once and verify context/tenant is unchanged; test a denied role’s read-only deep link.

- **Expected result:** Errors are actionable; failure does not fabricate success or leave a private stale page after authorization changes.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `tests/save-workflows.ui.test.js`; `tests/reviews.ui.test.js`; `Live browser evidence required`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### BRO-008 — Signed-out crawlability and private noindex

- **Test ID:** BRO-008
- **Feature/module:** Public routes and SEO
- **Preconditions:** No authentication or publication required; existing factual published content only.
- **User role:** Codex/operator read-only browser
- **Exact navigation path:** /; /privacy; /faqs; /testimonials; /success-stories; /sitemap.xml; /robots.txt; /platform-admin; /portal; /review
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 6 minutes
- **Test steps:**

1. Fetch public pages and inspect server HTML title/description/canonical/structured data and sitemap links.
2. Check empty testimonial/story pages without creating fictional content.
3. Inspect private route robots metadata/headers and verify a missing public slug does not expose a draft.
4. Record HTTP status, accessible navigation and noindex scope; do not count a 200 SPA shell as authenticated feature success.

- **Expected result:** Published content is discoverable; drafts/private routes stay excluded; public shell availability is distinguished from authorized data access.
- **Actual result:** Not executed in this acceptance run. Source inspection establishes the procedure only; automated evidence must not be substituted for the live/manual result.
- **Status:** **Not Run**
- **Evidence reference:** `netlify.toml`; `functions/publicContent.js`; `routeLogisticsWeb/src/App.jsx:78`; `Read-only HTTP/browser evidence required`
- **Cleanup instructions:** Retain evidence with secrets redacted. Restore only this case’s synthetic settings/fixtures to their recorded baseline; deactivate/archive test data through supported UI. Do not delete or change legitimate records.

#### DEV-001 — iPhone Safari real browser/accessibility

- **Test ID:** DEV-001
- **Feature/module:** iPhone Safari real browser/accessibility
- **Preconditions:** Physical iPhone, approved OTP recipient if needed; never reuse the consumed historical invitation.
- **User role:** Customer or owner/manager
- **Exact navigation path:** iPhone Safari → /portal /review /reviews as authorized
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 10 minutes
- **Test steps:**

1. Exercise representative signed-in customer and owner pages with the correct role.
2. Check portrait/landscape, keyboard occlusion, text enlargement, VoiceOver focus and controls.
3. Inspect error and empty states plus one synthetic form submission; do not publish test content.

- **Expected result:** Real Safari interaction is usable and accessible without horizontal clipping or hidden controls. Headless Chrome is supporting evidence only.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/CustomerPortalPage.jsx`; `routeLogisticsWeb/src/pages/ReviewInvitationPage.jsx`; `.migration/reviews-browser/results.json`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### DEV-002 — Corporate iOS push across app states

- **Test ID:** DEV-002
- **Feature/module:** Corporate iOS push across app states
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used. Verify installed corporate build and a fresh explicit authorization for each new notification.
- **User role:** Technician plus operator
- **Exact navigation path:** Corporate TestFlight app → Settings → Native work notifications; iOS Notification Center
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 10 minutes
- **Test steps:**

1. Confirm native registration/settings match the current test account.
2. For separately approved fixture events, test visible foreground, background/locked, and terminated-app notification taps one at a time.
3. Verify a tapped job is the current authorized assigned job; an unsaved work draft must be protected.

- **Expected result:** Delivery/receipt and navigation are separately recorded for each actual OS state; no notification creates an extra job by itself.
- **Actual result:** Historical Nov 14 iOS visible push and tap passed for an existing completed job; foreground/background state was not identified. This program has not sent another push or certified all OS states.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/components/NativePushSettings.js`; `routeLogisticsMobile/services/nativePush.js`; `.migration/communications-push-test.json`; `.migration/push-tap-test-20261114.json`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### DEV-003 — Android browser customer/provider workflows

- **Test ID:** DEV-003
- **Feature/module:** Android browser customer/provider workflows
- **Preconditions:** Android handset and approved browser test identities; no new native app required.
- **User role:** Customer and owner/manager
- **Exact navigation path:** Physical Android Chrome → /portal /reviews
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 10 minutes
- **Test steps:**

1. Repeat portal provider switching, file preview and review/consent UI at phone width.
2. Test owner management filters/errors and keyboard behavior with a synthetic provider.
3. Confirm no desktop-only hover requirement, clipped control or unauthorized cached data.

- **Expected result:** Android web journeys work on the real browser; desktop responsive emulation alone does not pass the case.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsWeb/src/pages/CustomerPortalPage.jsx`; `routeLogisticsWeb/src/pages/ReviewsPage.jsx`; `tests/reviews.ui.test.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

#### DEV-004 — Physical Android native/FCM readiness

- **Test ID:** DEV-004
- **Feature/module:** Physical Android native/FCM readiness
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used. A physical Android build/device and existing-project FCM v1 credentials must be available before delivery testing.
- **User role:** Pool/pest technician plus operator
- **Exact navigation path:** Android corporate build → Home/Schedule/Route/Settings; EAS Android credentials read-only audit
- **Execution / evidence class:** manual; Source/configuration gap or missing external acceptance
- **Hands-on estimate:** 15 minutes
- **Test steps:**

1. Confirm package com.workside.routelogistics and public Firebase registration; keep private FCM credentials only in EAS.
2. Verify native login/role, camera/gallery, offline queue and explicit background-location foreground notification.
3. Only after separately authorized delivery, test FCM arrival/tap/invalid-token recovery.

- **Expected result:** Native Android workflow and actual FCM v1 delivery are independently accepted; iOS/APNs evidence is not reused as Android proof.
- **Actual result:** Historical configuration audit documented no EAS Android FCM v1 credential and no physical Android delivery. Current handset/build/credential acceptance is outstanding; recheck metadata before claiming this remains a fresh configuration failure.
- **Status:** **Blocked**
- **Evidence reference:** `routeLogisticsMobile/app.config.js`; `routeLogisticsMobile/services/nativePush.js`; `docs/communications-activation.md:72`
- **Cleanup instructions:** Do not buy/create infrastructure or expose service-account credentials. Close any later explicitly authorized test window.

#### DEV-005 — Native accessibility, large text and return navigation

- **Test ID:** DEV-005
- **Feature/module:** Native accessibility, large text and return navigation
- **Preconditions:** Use the named synthetic provider/customer/jobs in section C. The technician is active and assigned to the fixture; no real job or customer is used.
- **User role:** Technician
- **Exact navigation path:** Corporate TestFlight app → Home → Schedule → work order → Route → Settings
- **Execution / evidence class:** manual; Operator/manual acceptance — not executed
- **Hands-on estimate:** 8 minutes
- **Test steps:**

1. Enable larger accessibility text and VoiceOver/TalkBack on the device being tested.
2. Traverse tabs, job cards, camera/gallery controls, completion confirmation and saved-work controls.
3. Rotate where allowed, background/reopen, and verify a draft is retained or an explicit discard is required.
4. Restore personal accessibility preference after evidence if desired.

- **Expected result:** Controls have readable labels/focus, no hidden touch overlay, no inaccessible required action, and work context is not silently lost.
- **Actual result:** Not executed on a physical device in this acceptance-program run.
- **Status:** **Not Run**
- **Evidence reference:** `routeLogisticsMobile/components/MobileUI.js`; `routeLogisticsMobile/components/WorkspaceTabs.js`; `routeLogisticsMobile/components/JobWorkflow.js`; `routeLogisticsMobile/scripts/workspaceNavigation.test.js`
- **Cleanup instructions:** Restore only this case’s synthetic fixtures and own preferences; retain evidence. Do not delete legitimate records or uninstall an app with pending work.

### Phase 18 — Dual-mode native operations

#### MOB-DM-01 — Working owner

- **User role:** Owner
- **Preconditions:** Rebuilt native binary; independently authorized disposable tenant/staff/work fixtures.
- **Exact navigation path:** Field → Home → assigned job → Management → Team/Map → Field
- **Steps:**
1. Confirm this rebuilt app uses the corporate bundle and existing owner account.
2. Complete a synthetic personally assigned visit with checklist, photo, notes and evidence.
3. Switch to Management, inspect schedules/authorized locations, then return to Field.
- **Expected result:** One identity; only personal work in Field; company operations in Management; no lost work or permission changes.
- **Actual result:** Not executed on a physical device. Automated coverage is supporting evidence only.
- **Status:** **Not Run**
- **Evidence reference:** docs/mobile-dual-mode-operations.md; scripts/mobileMode/workspaceNavigation/managementScreens tests; tests/mobileDualMode.integration.test.js; tests/staffAvailability.integration.test.js.

#### MOB-DM-02 — Working manager and reassignment

- **User role:** Manager
- **Preconditions:** Rebuilt native binary; independently authorized disposable tenant/staff/work fixtures.
- **Exact navigation path:** Field → Work shift → Route; Management → Team → details → Schedule
- **Steps:**
1. Explicitly start a shift and its permitted sharing mode.
2. Inspect another staff schedule and authorized last-known position.
3. Reassign a synthetic job, check availability, confirm and return to the personal route.
- **Expected result:** Saved assignment and audit persist; field queue remains intact; no owner-only or financial privilege appears.
- **Actual result:** Not executed on a physical device. Automated coverage is supporting evidence only.
- **Status:** **Not Run**
- **Evidence reference:** docs/mobile-dual-mode-operations.md; scripts/mobileMode/workspaceNavigation/managementScreens tests; tests/mobileDualMode.integration.test.js; tests/staffAvailability.integration.test.js.

#### MOB-DM-03 — Technician mode and scoped preference

- **User role:** Technician, owner/manager
- **Preconditions:** Rebuilt native binary; independently authorized disposable tenant/staff/work fixtures.
- **Exact navigation path:** App header and account/company switching
- **Steps:**
1. Verify technicians cannot select Management.
2. Use a disposable test preference to attempt management restoration under a technician.
3. Switch authorized users/companies, then revoke the fixture membership and refresh.
- **Expected result:** No management data, preference leakage or stale company access. Current capabilities remain authoritative.
- **Actual result:** Not executed on a physical device. Automated coverage is supporting evidence only.
- **Status:** **Not Run**
- **Evidence reference:** docs/mobile-dual-mode-operations.md; scripts/mobileMode/workspaceNavigation/managementScreens tests; tests/mobileDualMode.integration.test.js; tests/staffAvailability.integration.test.js.

#### MOB-DM-04 — Offline work preservation across modes

- **User role:** Owner/manager
- **Preconditions:** Rebuilt native binary; independently authorized disposable tenant/staff/work fixtures.
- **Exact navigation path:** Field → assigned work order; airplane mode → restart → reconnect
- **Steps:**
1. Open the synthetic work order online, then disconnect.
2. Queue a photo and note; attempt switching with a draft or camera operation active.
3. Save/close through the guard, restart, reconnect and synchronize once.
- **Expected result:** Durable file copies and operation IDs survive; no duplicate completion, dropped draft or cross-company queue.
- **Actual result:** Not executed on a physical device. Automated coverage is supporting evidence only.
- **Status:** **Not Run**
- **Evidence reference:** docs/mobile-dual-mode-operations.md; scripts/mobileMode/workspaceNavigation/managementScreens tests; tests/mobileDualMode.integration.test.js; tests/staffAvailability.integration.test.js.

#### MOB-DM-05 — Team map and shift privacy

- **User role:** Owner/manager plus technician
- **Preconditions:** Rebuilt native binary; independently authorized disposable tenant/staff/work fixtures.
- **Exact navigation path:** Field → Start/End Shift; Management → Map → marker → schedule
- **Steps:**
1. Start a fixture shift with explicit device location consent.
2. Inspect marker identity, update time, accuracy, next visit, fit behavior and stale state.
3. End the shift; check marker removal/stopped state and another-company access denial.
- **Expected result:** No GPS activation by opening Management; no off-duty/expired position displayed as live; retention and tenant isolation hold.
- **Actual result:** Not executed on a physical device. Automated coverage is supporting evidence only.
- **Status:** **Not Run**
- **Evidence reference:** docs/mobile-dual-mode-operations.md; scripts/mobileMode/workspaceNavigation/managementScreens tests; tests/mobileDualMode.integration.test.js; tests/staffAvailability.integration.test.js.

#### MOB-DM-06 — Sick leave, vacation and emergency call-out

- **User role:** Owner/manager
- **Preconditions:** Rebuilt native binary; independently authorized disposable tenant/staff/work fixtures.
- **Exact navigation path:** Management → Team → details → Change staff availability; web Dispatch/Team Locations
- **Steps:**
1. Record a bounded unavailable period for an active disposable staff fixture.
2. Verify new assignment is rejected while original appointments remain visible.
3. Overlay a bounded emergency period; verify it expires back into leave, then restore normal availability.
- **Expected result:** Unavailable windows block scheduling; no role/access elevation or automatic shift/GPS start; existing jobs and audits preserved.
- **Actual result:** Not executed on a physical device. Automated coverage is supporting evidence only.
- **Status:** **Not Run**
- **Evidence reference:** docs/mobile-dual-mode-operations.md; scripts/mobileMode/workspaceNavigation/managementScreens tests; tests/mobileDualMode.integration.test.js; tests/staffAvailability.integration.test.js.

## E. Automated test evidence

These are completed current-run local checks against existing isolated **demo-routelogistics emulators**, not a deployed staging environment or a new Firebase project. The Auth E2E wrapper applied sanitized configuration guards: provider features disabled, dummy local secret values and SMTP restricted to localhost; it restored the local files afterward. This wrapper is **not a network firewall**. See `.migration/acceptance-auth-safety.json`. No production message or provider financial/accounting action was generated by these suites.

| Suite / command from repository root | Count | Current result | Evidence |
| --- | --- | --- | --- |
| npm run test:functions | 139 total: 138 pass, 1 skip | Pass for executed test cases; the native-push emulator-only test is skipped in this unit invocation and covered in test:rules | .migration/acceptance-functions.log |
| npm run test:web | 232 total: 232 pass on final full rerun, including five emulator opt-in/transport guard test cases | Pass; prior full227/231 logs retained; do not count the guard5 separately | .migration/acceptance-web-final.log; .migration/acceptance-web-fixed.log; .migration/acceptance-web.log |
| npm run test:rules | 330 total: 330 pass | Pass; Firestore/Storage/rules/tenancy/integration with native-push emulator coverage | .migration/acceptance-rules.log |
| Auth/claims E2E via sanitized temporary configuration guards; underlying npm run test:e2e | 6 total: 6 pass | Pass; disabled provider flags/dummy credentials/localhost SMTP, not a network firewall; use the harness below for rerun | .migration/acceptance-auth-e2e.log; .migration/acceptance-auth-safety.json |
| npm --prefix routeLogisticsMobile test | 168 total: 168 pass on corrected full rerun | Pass after test-only workspaceApi boundary mock and classic-JSX React injection. Initial 167pass/1fail log retained; no application behavior changed | .migration/acceptance-mobile-fixed.log; .migration/acceptance-mobile.log |
| npm --prefix routeLogisticsWeb run build | Normal production dist rebuilt successfully in 12.46s after isolated browser tests | Pass; existing >500KB bundle-size warning; browser .browser-dist does not overwrite normal dist | .migration/acceptance-build-restored.log |
| npm --prefix routeLogisticsWeb run lint | 0 errors, 2 warnings on final run | Pass; existing useEffect dependency warnings in CalendarPage and ReportsPage | .migration/acceptance-lint-final.log |
| Read-only production metadata | 100/100 source exports ACTIVE; four approved identities | Pass for the recorded metadata only | .migration/acceptance-production-inventory.json |
| Read-only public HTTP / SEO | 12 public routes/shells; one published FAQ; one missing article | Pass for specific crawl checks: sitemap HTTP200 and missing article404 | .migration/acceptance-public-read.json |
| npm run test:browser:all | 75 executions:74 pass,1 fail | Completed batch failed only Firefox PW-POR-04 click/readiness race; targeted correction verified below | .migration/playwright-acceptance.log |
| npm run test:browser:all -- --grep=PW-POR-04 --repeat-each=3 | 9 executions:9 pass (3 repeats each in Chromium,Firefox,WebKit) | Pass after explicit feedback readiness and native invoice-details-open check; no API/UI authorization weakened | .migration/playwright-invoice-regression.log |
| npm run test:browser:smoke | 9 Chromium smoke executions: 9 pass in 1.2 minutes | Pass for the exact routine CI command locally, with final CSP/ADC/transport guards and isolated browser build; no remote CI run claimed | .migration/playwright-ci-smoke.log |

Combined current individual automated test cases before Playwright: **875 tests: 874 pass, 0 fail, 1 skip**, including the final full web 232 rerun (five emulator opt-in/transport guard test cases counted once) and corrected full mobile168 rerun. Do not sum these with the 155 acceptance cases as though they were the same measurement. The initial mobile failure is retained as resolved test-harness history, not erased or described as an application fix.

Safe repeat commands for the completed non-Auth suites:

```powershell
Set-Location 'C:\Users\sjroy\Source\routeLogistics'
npm run test:functions
npm run test:web
npm run test:rules
npm --prefix routeLogisticsMobile test
npm --prefix routeLogisticsWeb run lint
npm --prefix routeLogisticsWeb run build
```

The standalone Auth/Functions-emulator audit used the local helper `.migration/acceptance-auth-emulators.cjs`; that ignored helper is retained in this workspace with its safety receipt. For portable, credential-free browser verification, use the committed Playwright commands below, which independently exercise staff claims, sign-in and customer OTP with dummy configuration. Do not run a Functions emulator against genuine local provider credentials. Firebase emulator identity does not by itself stop Twilio/Intuit/Stripe/SMTP HTTP clients from reaching their providers.

### Playwright browser automation — matrix and corrected focused rerun complete

The browser harness uses the existing application, isolated local Auth/Firestore/Functions/Storage emulators and deterministic synthetic fixtures. It is configured for **25 browser scenarios, including nine smoke scenarios**, across Chromium, Firefox and WebKit (**75 configured browser executions** for the full matrix). A prior completed run in `.migration/playwright-final.log` recorded **73/75 Pass**: Chromium 25/25, Firefox 25/25, WebKit 23/25. WebKit stream timeouts reproduced even after removing route interception; the earlier routing-only explanation was incomplete. The actual observed compatibility issue is the Windows WebKit/Firebase JS SDK11.10 native-fetch-stream path against local emulators, not a confirmed production application defect.

The final completed full matrix in `.migration/playwright-acceptance.log` recorded **74/75 Pass** after the emulator-only transport correction. The remaining Firefox PW-POR-04 failure was a test-click race while the above-invoice feedback area was still loading. The spec now waits explicitly for feedback readiness and asserts the native invoice details element is open; API/UI authorization checks are unchanged. The corrected focused rerun in `.migration/playwright-invoice-regression.log` passed **9/9 executions**, with three repeats in each of Chromium, Firefox and WebKit. Consequently all 25 scenarios are verified per engine across the matrix plus focused rerun, **not a single clean 75/75 batch**. PW-OPS-06 and all 25 WebKit scenarios passed in the completed matrix.

The runner builds the web app using emulator configuration into ignored `routeLogisticsWeb/.browser-dist/` and serves its **production preview**, matching the deployed React lifecycle rather than Vite development StrictMode without overwriting normal `dist/`. Emulator opt-in/demo-project guards prevent configuring the Firebase SDK for the production project. When `VITE_FIREBASE_EMULATORS=true`, the Vite preview adds a native **Content-Security-Policy** restricting API/resource requests to the local test environment. The fixture asserts that header and collects sanitized `securitypolicyviolation` origins/directives; optional fonts/Stripe SDK static resources remain blocked. Unexpected external API/resource attempts fail the test. There is **no Playwright route interception**. This CSP controls API/resources, not every possible navigation; these test flows contain no external navigation.

The separate `localFirestoreTransport()` helper applies only to explicit local emulator mode: `experimentalForceLongPolling=true`, `experimentalAutoDetectLongPolling=false` and `useFetchStreams=false`. Outside that mode it returns an empty settings object, preserving production default transport. A targeted guard regression verifies this boundary; it is one of the five guard test cases already included in web 232. The change addresses local emulator/WebKit stream compatibility without asserting a production defect or changing normal production transport.

Backend provider features are disabled separately and secrets are dummy values; browser CSP is not a backend network firewall. The runner pins ADC to an inert local dummy credential file, preventing real ADC fallback, and removes that file after the run while restoring existing local provider files. Geographic scenarios use cached synthetic coordinates and seeded validation snapshots, with **no real Google Maps address-validation request**. No Stripe SDK download, customer message, charge or accounting export is part of the browser run. The preview-only CSP does not alter production functionality or require a deployment.

Configuration and fixture sources: `playwright.config.js`; `routeLogisticsWeb/vite.config.js`; `routeLogisticsWeb/src/services/emulators.js`; `routeLogisticsWeb/src/services/firebase.js`; `tests/firebaseEmulators.ui.test.js`; `scripts/run-browser-tests.js`; `tests/browser/support/fixtures.js`; `tests/browser/operations.spec.js`; `tests/browser/portal-cms.spec.js`. One worker and per-scenario synthetic scopes limit inter-test interference. Completed-run `test-results/emulator-safety.json` confirms localConfigurationRestored=true, syntheticFixturesOnly=true, providerTransportsDisabled=true, scheduledWorkersNotInvoked=true, realMessagesSent=false and applicationDefaultCredentialFallbackDisabled=true. This ignored report is replaced by subsequent runs. The exact routine CI command `npm run test:browser:smoke` passed **9/9 locally in 1.2 minutes** with the final guards/build isolation; remote GitHub CI remains unverified. No local browser verification remains pending.

First-time setup requires **Node.js 22** and **Java 21** available on PATH. From the repository root, install the existing lockfile dependencies and Playwright browser binaries:

```powershell
Set-Location 'C:\Users\sjroy\Source\routeLogistics'
node --version
java -version
npm ci
npm --prefix functions ci
npm --prefix routeLogisticsWeb ci --legacy-peer-deps
npx playwright install chromium firefox webkit
```

Run the browser commands from the same repository root:

```powershell
npm run test:browser:smoke
npm run test:browser
npm run test:browser:all
npm run test:browser:report
```

The smoke/default command uses Chromium; the all-browser command uses Chromium, Firefox and WebKit. Test artifacts are ignored local `test-results/` and `playwright-report/`; failure traces/screenshots must contain emulator fixtures only. Browser automation is not physical Safari, TestFlight, Android native, camera hardware, APNs/FCM delivery or locked-screen GPS acceptance. The manual case statuses in Section D remain unchanged unless that exact operator acceptance was genuinely executed.

An initial Vite-development run observed missing Helmet head metadata and a stuck review-loading state under development StrictMode. It is retained as **OBS-DEV-STRICTMODE (S3), development-only observation**, with no asserted production defect or application behavior fix. The emulator-configured production preview passed all 25 Chromium scenarios; actual unauthenticated production browser reads of /portal and /platform-admin confirmed correct titles and `noindex,nofollow` in `.migration/playwright-production-read.json`. The initial development failure log must not be confused with the current production-preview result.

### Browser-to-master coverage mapping

The following **27 browser regression scenarios are separate from the 155 master acceptance cases**. Titles match the current spec files; nine are tagged `@smoke`. Latest Chromium27/27 includes PW-OPS-13/14; those two new cases are not yet executed in Firefox/WebKit. Earlier cross-engine runs for the original25 are documented below. Mapping indicates specific emulator-backed browser behavior, not completion of every step or device/provider requirement in a broader manual case. Consequently the mapped manual cases retain **Not Run**.

| Browser scenario / exact title | Related master cases | Browser behavior covered | Remaining manual / physical / provider acceptance |
| --- | --- | --- | --- |
| PW-OPS-01 @smoke — unauthenticated operational routes require sign-in | ONB-001; SEC-001; SEC-002 | Signed-out dispatch/customer deep links return to login without operational controls | Real session expiration, remembered email, fresh OTP and installed-device entry |
| PW-OPS-02 @smoke — company owner sees operational data without inheriting platform administration | ONB-001; SEC-002; CMS-002 | Emulator owner signs in, reads CRM and is denied independent platform access | Existing production identities, complete role route matrix and real portal login |
| PW-OPS-03 @smoke — manager can dispatch but cannot access financial invoices | DSP-003; SEC-002 | Manager sees dispatch while invoice navigation/data is denied | Actual web-to-mobile assignment delivery, current installed build and exhaustive role actions |
| PW-OPS-04 @smoke — technician sees only assigned work and cannot open customer administration | SEC-002; SEC-003; MOB-004; DSP-010 | Assigned My Work detail closes/reopens; foreign job/customer administration hidden | Native TestFlight navigation, reassignment propagation, camera/completion and physical authorization states |
| PW-OPS-05 @smoke — owner creates and edits a customer with persisted success feedback | CRM-001; CRM-002 | Normal CRM create/edit, disabled unchanged Save, feedback, reload persistence and one tenant row | Production synthetic fixture, offline failure/cancel/unsaved warning, other browsers/devices and contact safety |
| PW-OPS-06 — manager schedules an eligible property and the job appears on dispatch | DSP-002; DSP-003; GEO-02 | Real browser/form/callable creates one eligible synthetic emulator job using cached synthetic coordinates and displays it in dispatch | Actual Google validation, technician queue/push delivery, conflict review and timezone/device handling |
| PW-OPS-07 — dispatch assignment persists and details reopen without changing another tenant | DSP-003; DSP-006; SEC-003 | Unassign/reassign persists; details close/reopen/Escape removes backdrop/restores focus; foreign fixture unchanged | Physical mobile reassignment, GPS/map interaction and native modal/picker lifecycle |
| PW-OPS-08 — owner saves service coverage and receives inside and outside property outcomes | GEO-01; GEO-02; GEO-07; GEO-08 | Synthetic ZIP policy saves/reloads with server eligibility over cached synthetic coordinates and unchanged existing job; no Maps call | Actual provider geocoding, radius/category/exception paths, owner fixture and private production geography |
| PW-OPS-09 — owner creates an estimate with server-calculated tax and persisted line pricing | EST-001; EST-004; EST-011 | Browser estimate save/reload and server subtotal/tax/total on controlled emulator lines | Manual alternate values, customer/prospect UX, photo capture, visual formatting and supported terms |
| PW-OPS-10 — estimate PDF downloads from the authorized callable as an actual PDF | EST-006; SEC-005 | Authenticated estimate download has PDF bytes/filename and the seeded estimate remains sent | Branding/photo/layout inspection in actual desktop/iPhone PDF viewer and cross-device downloads |
| PW-OPS-11 — recipient approval converts once to a tenant-scoped scheduled job | EST-008; EST-009 | Synthetic secure approval then owner conversion produces one linked job and no second conversion control | Actual authorized email delivery, recipient comprehension, revisions/expiry, real scheduling and mobile receipt |
| PW-OPS-12 — owner can view invoice and payment history without changing invoice status | INV-02; INV-07; SEC-002 | Owner opens read-only invoice/payment history and unchanged financial fields | Print/render filters, actual provider reconciliation and Stripe test-only Payment Element behavior |
| PW-OPS-13 — saved job addresses are locked and an explicitly edited one-off visit leaves the customer unchanged | DSP-002; CRM-002 | Chromium: saved address prefills locked; Enable Editing permits a different scoped job property without changing the master customer or historical job | Firefox/WebKit, production property validation and physical operator acceptance |
| PW-OPS-14 — permanent address opt-in updates the selected customer and refreshes the next locked job default | DSP-002; CRM-002; SEC-003 | Chromium: explicit permanent choice, atomic job/customer/audit save, immediate next-form default, and unchanged duplicate customer/historical job | Firefox/WebKit; operator-authorized production address changes remain separate |
| PW-POR-01 @smoke — rejects a wrong OTP, accepts the current code and signs out | POR-001; POR-002; POR-010 | Normal emulator OTP request, invalid code feedback, valid code entry, noindex and logout clearing | Real authorized OTP inbox receipt, expiration/rate/replay matrix and physical phone browser |
| PW-POR-02 @smoke — switches authorized providers without leaking visits and groups duplicate customers | POR-005; SEC-003 | Two authorized emulator providers switch scoped visits and group duplicate customer rows | Physical Safari/Android session/scroll/layout and chosen controlled mailbox/production associations |
| PW-POR-03 — retrieves authorized image/PDF bytes and clears the preview on provider switch | POR-006; POR-007; SEC-005 | Authorized private image renders, PDF downloads and preview clears on provider switch | Real handset document viewer, larger photos/files, assistive labels and download usability |
| PW-POR-04 — opens the selected tenant invoice and read-only payment history | POR-006; INV-07 | Selected provider invoice/history reads preserve invoice financial fields and hide on provider switch | Actual provider-settled history, real invoice display/amounts and handset layout |
| PW-POR-05 — records honest negative feedback once and keeps synthetic reviews private | REV-001; REV-002; REV-009 | One negative synthetic rating/on-time/comment saves once and remains private with one count | Actual customer form usability, provider response/moderation and no fake publication |
| PW-POR-06 — allows independent public-display permission to be withdrawn without replacing feedback | REV-008 | Synthetic customer grants then withdraws public permission; immutable feedback stays private | Physical customer navigation and real controlled association/consent history; synthetic publication still prohibited |
| PW-POR-07 — revokes a provider association before file access and removes its records on refresh | POR-007; POR-008; SEC-005 | Revoked emulator association fails file access, removes provider rows on refresh and clears preview | Controlled production association revocation only with chosen fixture; current phone/browser session behavior |
| PW-CMS-01 — requires staff sign-in for the independent platform-admin area | CMS-001; SEC-004 | Signed-out platform shell has sign-in link/noindex and no editor | Real verified platform-admin login and complete current-session checks |
| PW-CMS-02 — denies owner platform privileges | CMS-002; SEC-004 | Ordinary emulator company owner denied platform editor | Existing production role matrix and explicit grant/revocation manual inspection |
| PW-CMS-03 — denies technician platform privileges | CMS-002; SEC-004 | Emulator technician denied platform editor | Existing TestFlight/web account restriction and deep-link behavior |
| PW-CMS-04 @smoke — saves and previews a factual FAQ and protects a dirty draft | CMS-003; SEC-010 | Private FAQ draft save, preview, unsaved-change keep-editing and revision2 audit | Operator content accuracy, actual production permissions and keyboard/accessibility across devices |
| PW-CMS-05 @smoke — publishes factual FAQ metadata and removes public access when archived | CMS-004; BRO-008 | Emulator factual publication produces metadata/canonical/JSON-LD/sitemap; archive removes public projection with404/noindex | Production crawler routing is separate ENV-002; approved real content publication and physical layout/accessibility |
| PW-CMS-06 — keeps a draft image private and blocks an unverified testimonial publication | CMS-005; CMS-007 | Emulator image uploads/previews privately; unverified testimonial cannot publish and public image is404 | Owned real image usability/alt text, full MIME/oversize security suites, authentic content approval; never fictional publication |

CI configuration is reviewable source, **not evidence of a completed remote CI run**. Record the remote run URL/result only after GitHub actually executes it. This document claims only locally completed commands with their sanitized artifact paths.

Evidence files under `.migration/` are ignored local artifacts and are not uploaded with this document. The table records sanitized results for reviewers; retain logs privately or attach approved sanitized extracts to the release record. Source/test paths remain reviewable in the repository. Never attach token-bearing URLs, provider keys, raw request headers or customer photos.

### Jobs calendar-date correction — verified production release

Deployment commit: **`176bb244b33c394601fd176dfa46c05fa4df0ad5`** on existing `main`. Netlify production deploy **`6af91f67576519d1f0ee43b0`** was confirmed `ready` for that exact commit at **November 14, 2026, 6:57 PM Pacific**. This is a web-only release; no mobile rebuild or Firebase deployment is required.

The existing customer-specific date helper was reviewed but not reused: it treats small numeric values as seconds and restricts timestamp strings, which would change Jobs timestamp semantics. The small shared `routeLogisticsWeb/src/utils/calendarDate.js` instead parses strict `YYYY-MM-DD` components into a validated local calendar date at noon. It rejects invalid rollover dates, displays missing/invalid input as `—`, and preserves native ISO/offset/RFC timestamp, Date-object and numeric-millisecond handling. Firestore `toDate()` values remain actual instants. No date library was added.

The application change is limited to the Jobs table, scheduled date in Job Details, and its shared Created-label formatter in `JobManagementPage.jsx`. Date filters, sorting, time formatting, calendar/dispatch/route behavior, recurring generation, technician assignments, backend functions, Firestore rules and application timezone configuration were not changed.

| Verification | Result | Evidence |
| --- | --- | --- |
| Focused calendar-date regression | 9/9 test cases pass across America/Los_Angeles, America/New_York and UTC. Covers November 14, January 1, December 31, March 8 and November 1, plus invalid/missing values and timestamp preservation | `routeLogisticsWeb/src/utils/calendarDate.test.js`; included in full web result |
| Web regression | 241/241 pass | `.migration/jobs-date-web.log` |
| Chromium smoke | 9/9 pass | `.migration/jobs-date-smoke.log` |
| Full Playwright matrix | **75/75 pass in one clean run**, 25 scenarios each in WebKit, Chromium and Firefox; 6.9 minutes | `.migration/jobs-date-browser-validated.log` |
| Pacific Jobs UI | Existing PW-OPS-06 now creates only a synthetic emulator job for `2026-11-14`, verifies `Nov 14, 2026` in its table and details, retains `2:30 PM`, and compares stored scheduling fields before/after viewing | `tests/browser/operations.spec.js`; all three engines passed |
| Lint | 0 errors, 2 pre-existing hook-dependency warnings in CalendarPage and ReportsPage | `.migration/jobs-date-lint-final.log` |
| Production web build | Pass; 11.50 seconds, existing large-chunk advisory | `.migration/jobs-date-build.log` |
| Netlify / served code | Exact release commit ready; deployed `/assets/JobManagementPage-Cral8avm.js` contains two service-date calls and one Created-timestamp call to the corrected formatter | `.migration/jobs-date-production-verification.json` |
| Production formatter verification | Pure formatter extracted from the actual public Jobs bundle and evaluated offline in a Pacific-time browser: all five calendar dates pass, UTC timestamp still converts to November 13, and invalid/missing inputs show `—` | Same sanitized production receipt; no authenticated session or production-record reads/writes |
| Public production startup | `/login` and `/portal` return HTTP 200 and display their expected headings in a fresh unauthenticated browser; non-read HTTP methods were blocked | `.migration/jobs-date-production-public-smoke.json` |

Initial browser attempts exposed test setup issues rather than a broader date regression. The fixed historical date correctly requires the existing **Schedule anyway** acknowledgement; the test now uses that normal UI path. An unrelated customer test encountered two initial Add Customer buttons before seeded rows loaded; one explicit data-readiness wait resolves its locator ambiguity without changing customer code or weakening assertions. The final full matrix above passed after these test-only corrections. The existing navigation/status unit harness imports the real new formatter. ESLint now excludes generated `.browser-dist` output alongside `dist`.

All mutations used disposable local emulators and synthetic fixtures. No production job dates, customer records, calendars, Firebase timestamps or other scheduling data were modified. Production verification used public Netlify metadata/assets, anonymous login/portal startup with non-read HTTP methods blocked, and offline evaluation of the validated pure formatter; it did not sign in or inspect customer jobs. Broader physical-device and real-provider manual cases retain their existing statuses.

### Scoped data refresh, address warnings and green dropdowns — November 15, 2026

Operational web and mobile reads now use identity/company/role/membership-scoped query caches. Visible operational controls poll every 30 seconds and refresh on foreground/reconnect; slower company/report metadata uses 60 seconds and mobile template metadata uses 120 seconds. Known successful writes invalidate matching resources. A write cancels an older pending read so its stale result cannot overwrite the committed state. Background reads preserve forms, selected jobs, photos, offline work and checklist revision baselines; they do not reload the page. Existing notification listeners remain in place.

Customer-portal OTP and platform administration use independent principal caches; ordinary company roles do not grant platform access. Permission failures hide protected cached data. Polling does not initiate Google lookups, OAuth, payments, accounting exports, messages, uploads, PDFs or publications. Invoice list reads require a server-confirmed snapshot: a connection failure displays retry feedback rather than silently presenting an empty offline cache as an empty company.

Internal scheduling by authorized owners/managers/admins can save an entered address when Google cannot confirm it. The server records the address and coverage as unverified, returns a visible warning and clears stale coordinates. Required address syntax, public booking eligibility, known coverage restrictions, customer-update authorization and explicit permanent-address intent remain enforced. Google suggestions stay optional. No production job/customer records were changed during verification.

All application-owned web dropdowns now use accessible green DOM options, including priority and nested scheduling choices; third-party calendar popup selections have scoped green styles. The source audit finds no native `<select>` in application JSX. OS-owned mobile permission dialogs and native pickers remain device-controlled.

| Verification | Actual evidence | Remaining acceptance |
| --- | --- | --- |
| Web service/UI regressions | 399/399 pass, including real query observers, stale-read/write ordering, draft retention, portal revocation, payment-client auth, pagination and invoice offline feedback | None of these tests certifies external provider delivery |
| Mobile regressions | 329/329 pass; query/API subset 32/32; Expo Doctor 18/18; compatibility/configuration checks and iOS bundle export pass | Install rebuilt iOS/Android apps; verify foreground/background and mode switching on physical devices |
| Functions units | 182 pass; one emulator-only case skipped by the unit command | Targeted emulator checks are recorded separately |
| Address/authorization emulators | 80 unique targeted address cases pass; additional scheduling, working owner/manager and job-instruction subset 28/28 passes; no production data mutations | Operator saves the intended real appointment through the normal UI |
| Green browser controls | PW-UI-01 passes Chromium, Firefox and WebKit with computed green colors, search, keyboard, empty-required and nested-label checks | Visual/device preference inspection remains physical acceptance |
| Cross-session browser updates | PW-SYNC-01 passes Chromium, Firefox and WebKit: a separate assigned technician session uses the normal completion callable; owner Jobs counts update without navigation/reload while a scheduling draft stays open | Rebuilt physical mobile session remains separate acceptance |
| Full browser coverage | 105 distinct cases verified across three engines. Initial matrix: 94 pass/11 fail; all 11 pass on the final-source rerun. Nine failures were outdated denial-copy assertions, one exposed the corrected invoice cache fallback, and one required explicit feedback-layout readiness before the photo click. Final last-run has no failed IDs and emulator configuration is restored | This is combined executed coverage, not a claim that the original matrix was entirely green |

The production read-only investigation found David's active, verified Acme manager account and correct company/member claims, but no job assigned to his membership or UID. Acme retained seven job records. Off-duty state is not a filter for assigned-job reads. The operator confirmed that this was the appointment blocked by the address-correction requirement, so no assignment was missing from synchronization. No assignment was invented or rewritten. Existing historical appointments and all manual acceptance statuses remain intact.

The initial Netlify build compiled successfully but its scanner classified a redundant project-ID literal in the new query helper as an environment secret. The helper now takes the project exclusively from the initialized Firebase app, with no literal fallback. Secret scanning and all existing scan exclusions remain unchanged. All six affected backend functions were independently confirmed ACTIVE in the Route Logistics codebase after deployment.

### Saved-address review and mobile scheduling shortcuts — November 15, 2026

A job saved with an address-verification warning now remains open in the web editor. A visible footer confirms that the job is saved and offers **Edit address** or **Done**. Corrections update the same persisted job using its latest server revision; repeated warnings do not create another job or recurring plan. Jobs and Calendar refresh their data while retaining this editor. Closing without a correction leaves the saved appointment intact. Normal successful saves still close normally.

Mobile Management already supported Team schedule → Reassign job → Check assignment availability → Confirm. **Scheduled jobs** and the other job-count cards now open the corresponding filtered schedule for the selected service date. The reassignment form appears in the shared JavaScript dialog, with errors and confirmation visible. Active membership, field-work eligibility, leave windows, calendar conflicts and server revision checks remain authoritative. Off-duty status alone does not prevent scheduling. Completed/cancelled cards show history without reassignment actions.

Executed checks: 406/406 web tests, including seven saved-warning/canonical-ID/revision/navigation regressions; 332/332 mobile tests, including 31 focused management checks; web lint/build; and iOS/Android bundle exports pass. No production assignments were changed. PW-OPS-21 passes Chromium, Firefox and WebKit (3/3), covering warned save, same-job correction without duplicates, Done retention and unchanged customer addresses using local synthetic fixtures with no Google API calls. The initial test locator needed to account for the existing Modified badge; the corrected case passes in all engines. Its execution result is retained in the ignored release log. Physical testing of the new mobile card/dialog flow remains pending until rebuilt apps are installed. No backend redeployment is required for this interface change.

## F. Physical-device checklist

| Operator action | Cases | Record / pass condition |
| --- | --- | --- |
| Identify installed corporate TestFlight binary | MOB-002 | Version/build, iOS/device, EAS build/source mapping; no pending offline work lost |
| Login/remember email/verification/role gate | MOB-003–005; ONB-001; SEC-001–002 | First-attempt entry, separate technician workspace, locally persisted theme/phone format; no business CRUD for tech |
| Assign/reschedule on web, observe iPhone | DSP-002–003; MOB-006–007; MSG-07 | Correct queue/assignment within active polling cycle; reassigned-away work inaccessible; no new job inferred merely from a push |
| Pest and pool report inputs | MOB-008–010 | Required fields/ranges/chemical details; pool remains pending until real approved test identities/template exist |
| Camera/gallery/cancel/reopen/upload/failure | MOB-011; OFF-003; EST-003 | Stable selected job and photo URI; visible upload/queued/error/retry; no invisible backdrop or stuck details |
| Review and confirm completion | MOB-012; DSP-010 | Required work performed, loading, actual assignment/status reason, one operation, list/status update |
| Offline queue/restart/sync/account switch | OFF-001–009 | Durable scoped photo/notes/checklist; no silent loss; conflicts actionable; do not uninstall or clear storage |
| Start/end shift and GPS permission states | MOB-013–015; DSP-008 | Availability separate from GPS freshness; owner1/3/5min policy; end shift stops tracking |
| Background/locked-screen interval | MOB-014 | Wait at least two configured intervals and record actual timestamps/accuracy. OS may delay; force-quit tracking is not guaranteed |
| Visit Arrived/Departed/Could not access | MOB-015 | Connectivity, note/reason and timestamp/accuracy; evidence corroborates presence, never proves property access by itself |
| iOS native push by OS state and tap | DEV-002; MSG-07 | Foreground, background, locked, terminated cases separately; approved device only; drafts retained and correct existing assignment opens |
| Safari portal/reviews/PDF/withdrawal | POR-001,005–010; REV-002,007–008; DEV-001; BRO-003 | Explicit fresh OTP/message permission; provider switch, file auth, revocation, readable feedback/keyboard |
| Android browser | BRO-004; DEV-003 | Physical Chrome portal/back/files/keyboard; not satisfied by desktop emulation |
| Android native and FCM v1 | DEV-004; MSG-10 | Build plus credential metadata then actual device delivery/tap; currently outstanding |
| Native accessibility and return navigation | DEV-005; BRO-006 | Large text, labels/focus, usable touch targets, no clipping or trapped overlay |

Batch work with one operator: keep desktop dispatch open while the iPhone runs the assigned work. Perform the short background waits while checking portal/history/CMS. Record actual app foreground/background state for every push, since prior receipt did not identify all OS states. A local acceptance harness can verify UI transitions but cannot certify camera hardware, battery policy or native permission prompts.

## G. Integration checklist

| Integration | Current / historical verified evidence | Still to execute or scope limit |
| --- | --- | --- |
| Firebase Auth/Firestore/Storage/Functions | Current 100 ACTIVE functions; four verified identities; rules330/330; guarded AuthE2E6/6 | Interactive sessions/device permission changes and current installed build remain manual; authorization always current tenant/membership |
| SendGrid SMTP | Earlier production mail reached authorized Workside inbox; portal normal OTP delivered/consumed Nov14 12:11PM; review invitation SMTPaccepted+SendGridDelivered and synthetic submit Nov14 4:15–4:21PM | Current run sends none; SMTP acceptance is not inbox delivery. Prologix earlier quarantined; record actual inbox/junk separately. Fresh messages need authorized recipient/count |
| Google Maps | APIs/billing/browser restrictions current; prior browser Routes test Nov13 and two AddressValidation public-site requests Nov14 passed | New ZIP/radius inside/outside UI checks Not Run with separate synthetic owner; avoid repeated paid lookups; no marketplace endpoint |
| Stripe | Historical Nov13 $1USD TEST intent and signed settlement/replay passed; actual invoice stayed sent/no paidAt | Current enabled=true/test/liveApproved=false; new UI/account matching and controlled retry/failure device path manual. No live charge/refund; no RL refund creation UI/API |
| QuickBooks OAuth/options | Prior sandbox OAuth connect and owner option/default selection; existing connection retained; current sandbox/writes=false/prodApproved=false | Do not disconnect or refresh provider data repeatedly for documentation. UI lifecycle and current browser errors remain manual |
| QuickBooks accounting API | Historical Nov14 9:09–9:10AM: customer59, existing serviceitem10, invoices145/146, payments147/148; synthetic scoped certification and accepted-response retries passed | Five provider records (1customer,2invoices,2nonprocessingpayments); eight POSTattempts incl3 idempotent replays. No new writes now; see detailed tax/payment notes |
| QuickBooks tax | Historical explicit NON and simple US manual8%: $20subtotal/$1.60tax/$21.60total | AST, compound/effective-dated rates, nonUSD and nonzero discounts unsupported; do not treat them as certified |
| QuickBooks genuine webhook | Local signatures/tenant routing/idempotency tests pass; operator probes are distinguishable | Genuine Intuit-origin request not correlated for sandbox Customer59 update or sample realm310687 portalSUCCESS. Accounting-only outstanding acceptance; do not mark portalSUCCESS as verified RL delivery |
| Twilio delivery | Nov14 ~10:30AM approved tollfree +1 888-250-6769 produced carrierDelivered, genuine signed status callbacks and handsetreceipt | Dedicated RL send-only credentials; directFrom/noMessagingService required. Broad SMS staysfalse; only authorized recipient may be retested with explicit budget |
| Twilio STOP/START | Historical physical STOP→START acknowledgements and signed EventStreams verified; STOP suppressed/cancelled queued; START did not restore RL consent | Fourpurpose RL consent independently renewed for bounded prior pilot; refresh expiry/budget before any future send; provider optout shared acrossMerxus/RL |
| Expo / APNs iOS | Nov14 authorized push received and tap opened existing completed work order; corporate APNs/bundle audited | Not proof of a newly created assignment queue, current installed build, all OS states or Android delivery; current physical matrix NotRun |
| Android FCM v1 | Last recorded EAS audit Androidcredentials=[]; no physical Android success | Recheck metadata/operator build before calling it current missing configuration; native delivery acceptance remainsBlocked |
| Review SMS | Automated consent/STOP/durable retry/expiry/pilot denial test cases pass | No real reviewSMS sent or separately authorized purpose. Broad review automationfalse. Do not reuse fourpurpose service-message consent |

QuickBooks prior financial checks were **sandbox accounting records**, not Stripe processing: payment147 $5partial then payment148 $15remaining reconciled the controlled $20 invoice. The RL source invoice remained sent while test fields moved partial→paid. Tax invoice146 separately used the certified manual8% mapping. Exact persisted evidence and limitations are in [quickbooks-sandbox-certification.md](quickbooks-sandbox-certification.md). Do not replay these writes or manufacture new certification records unnecessarily.

QuickBooks webhook distinction: the connected realm is **9341455727000797**. Intuit portal samples used **310687**. A screenshot labelled SUCCESS with no correlated deployed request cannot prove HTTP response status, signature validation or tenant routing. The recorded 401 belongs to our diagnostic request. Local HMAC/unknown-realm/replay tests establish implementation behavior, while genuine provider origin/delivery remains QBO-08. No new webhook-triggering customer update is authorized merely by this plan.

Provider acceptance references: `.migration/stripe-acceptance-run.json`; `.migration/portal-cms-live.json`; `.migration/reviews-postdeploy.json`; `.migration/qb-live-1411ac01.json`; `.migration/qb-webhook-final-acceptance.json`; `.migration/qb-intuit-fresh-screenshot-audit.json`; `.migration/rl-working-sms-test.json`; `.migration/sms-readiness-evidence.json`; `.migration/push-tap-test-20261114.json`. Use the exact per-case files as authoritative; do not infer receipt from a queued/sent state.

## H. Defect log

Severity: **S1** data loss, cross-tenant exposure or unusable core operation; **S2** material workflow/configuration limitation requiring a workaround or blocking a specific platform; **S3** noncritical supported-scope/test/UX gap; **S4** documentation/reference issue. A source gap is not a fabricated physical failure; an acceptance gap is not a defect until observed.

| ID / severity | Reproduction / evidence | Owner | Resolution / effect |
| --- | --- | --- | --- |
| DEF-TEST-01 / S3 — resolved | Initial mobile run → estimateScreens.test.js loader lacked firebase/functions boundary mock and classic-JSX React binding; .migration/acceptance-mobile.log | Development | Test-only workspaceApi boundary mock plus React injection corrected the harness; full rerun168/168Pass in .migration/acceptance-mobile-fixed.log. No application behavior changed; no native hardware claim |
| OBS-DEV-STRICTMODE / S3 development only | Initial Vite-development browser run had missing Helmet head metadata and a stuck review loading state; .migration/playwright-chromium.log | Development | Open development-lifecycle observation. Production-preview Chromium25Pass and actual production public title/noindex reads pass; no production defect or application behavior fix asserted |
| OBS-WEBKIT-STREAM / S3 local emulator compatibility — resolved | WebKit stream timeouts persisted without route interception; Windows WebKit/Firebase JS SDK11.10 native fetch streams against local emulators | Development | Explicit emulator-only localFirestoreTransport forces long polling/useFetchStreams=false; production returns{} and default transport unchanged. Guard test passes and all 25 WebKit cases passed the final matrix. No production defect asserted |
| OBS-POR04-READINESS / S3 test timing — resolved | Firefox PW-POR-04 invoice click raced asynchronous feedback loading in the 74/75 matrix | Development | Spec waits for explicit feedback readiness and asserts invoice details open; no API/UI authorization weakened. Corrected case passed 9/9 across three engines with 3 repeats each; initial failed batch retained |
| DEF-JOBS-DATE / S3 — resolved | Original UTC parsing shifted date-only Jobs labels. Corrected shared `calendarDate.js` is used by Jobs table/details; 9 timezone tests, web241/241, smoke9/9 and a single clean browser75/75 passed. Original evidence: `.migration/job-date-display-audit.json` | Development | Production fix `176bb244b33c394601fd176dfa46c05fa4df0ad5`, verified ready on Netlify November 14 at 6:57 PM Pacific. Actual served formatter verified offline; `.migration/jobs-date-production-verification.json`. Stored dates/times unchanged; no customer-record reads/writes or mobile rebuild |
| GAP-MOB-GEO / S2 native manager forms | Native Home → Schedule service lacks customerId/serviceProperty/serviceCategory; shared native estimate input lacks serviceProperty; HomeScreen.js:1075, functions/shared/estimateClient.js:19 | Development | Source contract gap; use web schedule/estimate for configured territory. Do not weaken server eligibility. Not a technician work-order blocker |
| GAP-ANDROID-FCM / S2 Android native only | Last audit EAS androidCredentials=[]; docs/communications-activation.md:72; DEV-004/MSG-10 | Operator/development | Current metadata/build/physical receipt and tap outstanding. Does not block iOS or Android browser pilot |
| GAP-WEB-01 / S3 explicit industry selection | CompanySetupPage.jsx has categories but no industry selector; ONB-003 | Product/development | Use pest/pool category and pinned service checklist; no selector certification |
| GAP-WEB-02 / S3 company template summary | Company Setup → Templates is Coming Soon; estimate template CRUD is separate | Development | Use /estimate-templates; do not claim automatic photo-estimate template application |
| GAP-WEB-03 / S3 discounts | Estimate form/backend has no discount field and rejects negative unit prices; EST-005 | Product/development | Use supported fixed line pricing; not required for zero-value field pilot |
| GAP-WEB-04 / resolved by scheduling release | Server conflict prevention and future recurring reservations implemented; DSP-009 automated Pass | Development | Retain physical mobile delivery acceptance; travel/PTO remain separate from calendar availability |
| GAP-MOB-CRM / S3 native parity | Native customer search/edit rendered without handlers; HomeScreen.js:741/776 | Development | Use web CRM search/update; native full CRM not certified |
| GAP-WEB-CRM / S3 scope limits | Customer detail has no full timeline/attachment tab; search filters loaded rows only | Product/documentation | Load more; use Jobs for service history/photos and Portal for published documents |
| QB-DELIVERY / accounting acceptance | Customer59 update Nov14 9:21:44AM and portal sampleSUCCESS uncorrelated with RL genuine delivery; QBO-08 | Operator/Intuit with Codex sanitized log support | Externally unresolved; preserve existing connection; no redeploy without actual defect |
| PHYSICAL-PENDING / acceptance gap | Current build/camera/offline/backgroundGPS/OSpush matrix NotRun | Operator with Codex assistance | Core physical path gates pilot signoff; old test counts/native camera logs cannot close it |
| SOURCE-DOC-STALE / S4 | docs/mobile-app.md refers to older stack/modal/photo placeholders | Documentation | Current App/Workspace/JobWorkflow source and this inventory authoritative; no unrelated doc rewrite |
| RISK-INVOICE-CONCURRENCY / unconfirmed | createInvoiceFromJob queries existing then creates; sequential retry covered, concurrent double-client create not reproduced | Development | Record as unverified concurrency risk; do not claim confirmed duplicates or create real duplicate invoices |

Other bounded limitations: company branding uses an HTTPS logo URL, not a logo-upload manager; CMS image upload is separate. Calendar drag/resize is intentionally disabled. Estimate PDF preview uses Download plus browser viewer. Invoices have no standalone line/tax/discount editor or invoice-specific Checkout link; emails point to /portal. Refund/dispute event reconciliation exists but no refund-creation control. No automatic pool chemical dosing recommendations, no offline visit-evidence queue, and no public provider marketplace/discovery/booking UI exist in this phase.

## I. Pilot readiness assessment

**Conditional pest-control pilot:** use existing approved Acme owner/manager/technician, web scheduling, a pinned pest checklist and the corporate iPhone build. Before serving actual pilot visits, pass identity/build provenance, assigned queue refresh, camera/gallery/reopen, completion, scoped offline restart/sync and shift/end-shift behavior. Confirm the customer-facing shared record/photo projection is appropriate. Until then readiness is acceptance-pending, not fully signed off.

**Conditional pool-service pilot:** same core gates plus an approved separate pool provider/owner/technician, pool checklist/ranges/equipment inputs and tenant isolation. Pool identities/fixture are not available today; that is a real prerequisite for the pool end-to-end journey. Do not borrow Acme ownership or invent credentials.

Native manager scheduling/estimates under geographic policies must use the existing web forms until GAP-MOB-GEO is corrected and validated. If automatic conflict prevention is required by the operator, its absence blocks that promised capability; a controlled dispatcher can otherwise review Calendar/Dispatch manually. If Android native push is required for the first pilot, credential/handset acceptance is a blocker for that platform only.

These are **not whole field-pilot gates** when intentionally excluded: genuine QuickBooks webhook acceptance, production accounting writes, live Stripe payments/refunds, discounts, public marketplace, automatic review invitations, company-wide SMS, fictional marketing content or native full-CRM parity. Keep those disabled/out of scope and document the operator’s chosen supported pilot. QuickBooks sandbox stays connected with accounting writes false; Stripe stays test-only; broad SMS and review automation stay off.

Recommended one-operator order:

1. Read ENV/IDN baseline and record device/build plus synthetic fixture IDs.
2. Execute ONB-001/007, DSP-002/003/006, MOB-002–015 as relevant: web schedule → assigned iPhone work → capture/select → complete → reopen.
3. Execute OFF-001–009 in one synthetic session; finish synchronization and end shift.
4. Execute portal/review customer journey using explicitly authorized fresh OTP/link, then provider response/withdrawal/access checks.
5. Repeat pool checklist with the separate approved pool identities; run GEO in the synthetic settings provider.
6. Finish CRM/estimates/invoice visual/status checks with no new real charges or broad messaging.
7. Review historical provider evidence; perform only explicitly approved missing delivery steps. Finish CMS, browser/accessibility coverage and signoff.

Plan **10–13 hours hands-on** for the full operator matrix including setup and evidence; **9–11 hours** with fixture reuse and overlapping UI coverage. The core iOS pest pilot path is about **2–3 hours**. The raw Not Run case estimates sum to 719 minutes before reuse; they include repeated browser/platform comparisons rather than one continuous production workflow. Add asynchronous wait time separately for message delivery, background location intervals, TestFlight availability and external Intuit support. Do not spend repeated operator hours on the unresolved Intuit delivery issue while unrelated acceptance can proceed.

## J. Final acceptance checklist

- [ ] Record acceptance date, operator, source commit, production release and installed iOS/Android build(s).
- [ ] Verify all intended identities use approved roles; technician has assigned work only; platform access remains explicitly separate.
- [ ] Record synthetic provider/customer/property/job IDs and a legitimate-record baseline; make no real-customer or active-membership edits.
- [ ] Pass the assigned job → photo → complete → close → reopen physical iPhone path with actionable errors.
- [ ] Pass scoped offline save/restart/sync/retry with no silent loss or duplicate work; clear only acknowledged synthetic pending work.
- [ ] Confirm Start/End Shift, explicit location permissions and dispatch availability/freshness; record background/locked limitations honestly.
- [ ] Verify pest checklist/chemical record and, separately, pool readings/equipment checklist with the correct provider roles.
- [ ] Verify customer OTP, two-provider switching, scoped photos/documents/invoices/payments, revocation and private review behavior.
- [ ] Verify owner/manager/technician/admin/platform/customer tenant boundaries through the current automated evidence and relevant manual deep links.
- [ ] Keep broad SMS/review automation, live Stripe and production QuickBooks accounting off; no unauthorized recipients, charges or exports.
- [ ] Record each remaining Blocked/Not Run item with scope, owner and accepted workaround; do not mark historical evidence newly executed.
- [ ] Retain sanitized evidence, fixture audit/history and cleanup status; no tokens/credentials/private customer material in committed artifacts.
- [ ] Obtain operator approval for the narrow pest/pool/device/purpose pilot actually tested, not an unbounded commercial launch.

| Sign-off field | Operator entry |
| --- | --- |
| Operator / date | Pending |
| Production/source release and installed build(s) | Pending |
| Pilot tenant(s), industry, device/platform and allowed workflows | Pending |
| Core scenario result / evidence | Pending |
| Unresolved scope exclusions / accepted workarounds | Pending |
| Messaging recipients/purposes/budget/expiry, if separately approved | Pending; broad automation remains disabled |
| Cleanup and legitimate-record baseline verification | Pending |
| Final decision | Not signed off — physical/manual core acceptance remains |

## Appendix 1. Complete Cloud Functions inventory — 100 source exports

All entries below matched ACTIVE deployed metadata on November 14, 4:31 PM Pacific. API URL base for callable/HTTP entries: `https://us-central1-mi-factotum-field-service.cloudfunctions.net/`. Each source name is exact. Firestore/scheduler entries are triggers, not browser-invokable REST APIs. Do not invoke schedules or write trigger documents merely to complete this inventory.

| Export / type | Module / trigger | Authorization / tenant scope | Required configuration / safety flags | Implementation / export source | Deployment |
| --- | --- | --- | --- | --- | --- |
| rlServiceAreas (onCall) | Geographic coverage | Current tenant owner/manager settings; owner-only exceptions; admin operational checks; technician denied | RL_APP_URL; Google Address Validation ADC/API; coverage configured per tenant | functions/serviceAreas.js; functions/index.js:48 | ACTIVE |
| syncClaims (onCall) | Staff authentication | Signed-in team user for claims; OTP request/verification public with rate limits and isolated eligible account checks | RL_EMAIL_ENABLED | functions/staffLogin.js; functions/claims.js; functions/workspace.js; functions/index.js:125 | ACTIVE |
| rlReadWorkspace (onCall) | Workspace and jobs | Live workspace capability checks; technician assigned-job scope; company creation only eligible solo owner | RL_SERVICE_FORMS_ENABLED where form actions used | functions/workData.js; functions/jobPhotos.js; functions/index.js:134 | ACTIVE |
| rlManageJob (onCall) | Workspace and jobs | Live workspace capability checks; technician assigned-job scope; company creation only eligible solo owner | RL_SERVICE_FORMS_ENABLED where form actions used | functions/workData.js; functions/jobPhotos.js; functions/index.js:135 | ACTIVE |
| rlRecordApplication (onCall) | Workspace and jobs | Live workspace capability checks; technician assigned-job scope; company creation only eligible solo owner | RL_SERVICE_FORMS_ENABLED where form actions used | functions/workData.js; functions/jobPhotos.js; functions/index.js:136 | ACTIVE |
| rlCreateCompany (onCall) | Workspace and jobs | Live workspace capability checks; technician assigned-job scope; company creation only eligible solo owner | RL_SERVICE_FORMS_ENABLED where form actions used | functions/workData.js; functions/jobPhotos.js; functions/index.js:137 | ACTIVE |
| rlJobPhoto (onCall) | Workspace and jobs | Live workspace capability checks; technician assigned-job scope; company creation only eligible solo owner | RL_SERVICE_FORMS_ENABLED where form actions used | functions/workData.js; functions/jobPhotos.js; functions/index.js:138 | ACTIVE |
| sendTeamInviteEmail (onCall) | Team and CRM | Owner-managed invitations/roles; verified matching invited account accepts; explicit transfer; tenant-scoped import | RL_EMAIL_ENABLED; RL_APP_URL | functions/invitations.js; functions/ownership.js; functions/customers.js; functions/index.js:141 | ACTIVE |
| acceptTeamInvite (onCall) | Team and CRM | Owner-managed invitations/roles; verified matching invited account accepts; explicit transfer; tenant-scoped import | RL_EMAIL_ENABLED; RL_APP_URL | functions/invitations.js; functions/ownership.js; functions/customers.js; functions/index.js:142 | ACTIVE |
| manageTeamMember (onCall) | Team and CRM | Owner-managed invitations/roles; verified matching invited account accepts; explicit transfer; tenant-scoped import | RL_EMAIL_ENABLED; RL_APP_URL | functions/invitations.js; functions/ownership.js; functions/customers.js; functions/index.js:143 | ACTIVE |
| transferCompanyOwnership (onCall) | Team and CRM | Owner-managed invitations/roles; verified matching invited account accepts; explicit transfer; tenant-scoped import | RL_EMAIL_ENABLED; RL_APP_URL | functions/invitations.js; functions/ownership.js; functions/customers.js; functions/index.js:144 | ACTIVE |
| bulkImportCustomers (onCall) | Team and CRM | Owner-managed invitations/roles; verified matching invited account accepts; explicit transfer; tenant-scoped import | RL_EMAIL_ENABLED; RL_APP_URL | functions/invitations.js; functions/ownership.js; functions/customers.js; functions/index.js:145 | ACTIVE |
| rlCustomerReviews (onCall) | Verified reviews | Customer portal association or secure invitation for submission; owner/manager provider management; server-only completion lifecycle | RL_REVIEW_INVITATIONS_ENABLED=false; existing email/SMS authorization gates | functions/reviews.js; functions/reviewInvitations.js; functions/index.js:148 | ACTIVE |
| rlProviderReviews (onCall) | Verified reviews | Customer portal association or secure invitation for submission; owner/manager provider management; server-only completion lifecycle | RL_REVIEW_INVITATIONS_ENABLED=false; existing email/SMS authorization gates | functions/reviews.js; functions/reviewInvitations.js; functions/index.js:149 | ACTIVE |
| rlRequestCustomerOTP (onCall) | Customer portal | OTP request/verify public and rate limited; portal-only isolated identity plus live provider/customer associations for reads/files | RL_EMAIL_ENABLED | functions/portal.js; functions/index.js:150 | ACTIVE |
| rlVerifyCustomerOTP (onCall) | Customer portal | OTP request/verify public and rate limited; portal-only isolated identity plus live provider/customer associations for reads/files | RL_EMAIL_ENABLED | functions/portal.js; functions/index.js:151 | ACTIVE |
| rlRequestStaffOTP (onCall) | Staff authentication | Signed-in team user for claims; OTP request/verification public with rate limits and isolated eligible account checks | RL_EMAIL_ENABLED | functions/staffLogin.js; functions/claims.js; functions/workspace.js; functions/index.js:153 | ACTIVE |
| rlVerifyStaffOTP (onCall) | Staff authentication | Signed-in team user for claims; OTP request/verification public with rate limits and isolated eligible account checks | RL_EMAIL_ENABLED | functions/staffLogin.js; functions/claims.js; functions/workspace.js; functions/index.js:154 | ACTIVE |
| getCustomerPortal (onCall) | Customer portal | OTP request/verify public and rate limited; portal-only isolated identity plus live provider/customer associations for reads/files | RL_EMAIL_ENABLED | functions/portal.js; functions/index.js:155 | ACTIVE |
| rlGetCustomerPortalFile (onCall) | Customer portal | OTP request/verify public and rate limited; portal-only isolated identity plus live provider/customer associations for reads/files | RL_EMAIL_ENABLED | functions/portal.js; functions/index.js:156 | ACTIVE |
| rlPlatformCms (onCall) | Platform CMS/public content | Explicit platform-admin grant for private CMS; sanitized published public read/image/content endpoints | RL_APP_URL; no auto-publication of synthetic testimonials/stories | functions/platformCms.js; functions/publicContent.js; functions/index.js:158 | ACTIVE |
| rlReadPublicContent (onCall) | Platform CMS/public content | Explicit platform-admin grant for private CMS; sanitized published public read/image/content endpoints | RL_APP_URL; no auto-publication of synthetic testimonials/stories | functions/platformCms.js; functions/publicContent.js; functions/index.js:159 | ACTIVE |
| rlPlatformContentImage (onCall) | Platform CMS/public content | Explicit platform-admin grant for private CMS; sanitized published public read/image/content endpoints | RL_APP_URL; no auto-publication of synthetic testimonials/stories | functions/platformCms.js; functions/publicContent.js; functions/index.js:160 | ACTIVE |
| rlPublicContentImage (onRequest) | Platform CMS/public content | Explicit platform-admin grant for private CMS; sanitized published public read/image/content endpoints | RL_APP_URL; no auto-publication of synthetic testimonials/stories | functions/platformCms.js; functions/publicContent.js; functions/index.js:161 | ACTIVE |
| rlPublicContent (onRequest) | Platform CMS/public content | Explicit platform-admin grant for private CMS; sanitized published public read/image/content endpoints | RL_APP_URL; no auto-publication of synthetic testimonials/stories | functions/platformCms.js; functions/publicContent.js; functions/index.js:162 | ACTIVE |
| rlDeliverEmail (onSchedule) | Email/invoices; every 1 minutes | Private mail worker; tenant-authorized invoice management; dispatch rechecks customer/invoice/invitation state | RL_EMAIL_ENABLED; RL_EMAIL_FROM; RL_SMTP_URL bound to worker | functions/mail.js; functions/invoiceEmail.js; functions/index.js:163 | ACTIVE |
| emailInvoice (onCall) | Email/invoices | Private mail worker; tenant-authorized invoice management; dispatch rechecks customer/invoice/invitation state | RL_EMAIL_ENABLED; RL_EMAIL_FROM; RL_SMTP_URL bound to worker | functions/mail.js; functions/invoiceEmail.js; functions/index.js:165 | ACTIVE |
| rlQueueInvoiceReminders (onSchedule) | Email/invoices; every day 09:00 | Private mail worker; tenant-authorized invoice management; dispatch rechecks customer/invoice/invitation state | RL_EMAIL_ENABLED; RL_EMAIL_FROM; RL_SMTP_URL bound to worker | functions/mail.js; functions/invoiceEmail.js; functions/index.js:166 | ACTIVE |
| rlManageServicePlan (onCall) | Recurring service | Tenant scheduler/manager capability; server-only recurrence; configured geographic validation for new/changed property | Existing configured service-area policy | functions/recurring.js; functions/index.js:168 | ACTIVE |
| generateServicePlanJob (onCall) | Recurring service | Tenant scheduler/manager capability; server-only recurrence; configured geographic validation for new/changed property | Existing configured service-area policy | functions/recurring.js; functions/index.js:169 | ACTIVE |
| rlGenerateRecurringJobs (onSchedule) | Recurring service; every day 04:00 | Tenant scheduler/manager capability; server-only recurrence; configured geographic validation for new/changed property | Existing configured service-area policy | functions/recurring.js; functions/index.js:170 | ACTIVE |
| rlCreateInvoicePayment (onCall) | Stripe payments | Live invoice ownership/financial capability or portal payer association; Stripe webhook raw-body signature; internal receipt trigger | RL_STRIPE_ENABLED; RL_STRIPE_MODE=test; RL_STRIPE_LIVE_APPROVED=false; existing Stripe secrets | functions/payments.js; functions/paymentLifecycle.js; functions/index.js:179 | ACTIVE |
| rlGetInvoicePaymentStatus (onCall) | Stripe payments | Live invoice ownership/financial capability or portal payer association; Stripe webhook raw-body signature; internal receipt trigger | RL_STRIPE_ENABLED; RL_STRIPE_MODE=test; RL_STRIPE_LIVE_APPROVED=false; existing Stripe secrets | functions/payments.js; functions/paymentLifecycle.js; functions/index.js:180 | ACTIVE |
| rlCancelInvoicePayment (onCall) | Stripe payments | Live invoice ownership/financial capability or portal payer association; Stripe webhook raw-body signature; internal receipt trigger | RL_STRIPE_ENABLED; RL_STRIPE_MODE=test; RL_STRIPE_LIVE_APPROVED=false; existing Stripe secrets | functions/payments.js; functions/paymentLifecycle.js; functions/index.js:181 | ACTIVE |
| rlStripeWebhook (onRequest) | Stripe payments | Live invoice ownership/financial capability or portal payer association; Stripe webhook raw-body signature; internal receipt trigger | RL_STRIPE_ENABLED; RL_STRIPE_MODE=test; RL_STRIPE_LIVE_APPROVED=false; existing Stripe secrets | functions/payments.js; functions/paymentLifecycle.js; functions/index.js:182 | ACTIVE |
| rlGetPaymentReadiness (onCall) | Stripe payments | Live invoice ownership/financial capability or portal payer association; Stripe webhook raw-body signature; internal receipt trigger | RL_STRIPE_ENABLED; RL_STRIPE_MODE=test; RL_STRIPE_LIVE_APPROVED=false; existing Stripe secrets | functions/payments.js; functions/paymentLifecycle.js; functions/index.js:184 | ACTIVE |
| rlGetInvoicePaymentHistory (onCall) | Stripe payments | Live invoice ownership/financial capability or portal payer association; Stripe webhook raw-body signature; internal receipt trigger | RL_STRIPE_ENABLED; RL_STRIPE_MODE=test; RL_STRIPE_LIVE_APPROVED=false; existing Stripe secrets | functions/payments.js; functions/paymentLifecycle.js; functions/index.js:185 | ACTIVE |
| rlSendPaymentConfirmation (onDocumentCreated) | Stripe payments; rlPaymentEvents/{id} | Live invoice ownership/financial capability or portal payer association; Stripe webhook raw-body signature; internal receipt trigger | RL_STRIPE_ENABLED; RL_STRIPE_MODE=test; RL_STRIPE_LIVE_APPROVED=false; existing Stripe secrets | functions/payments.js; functions/paymentLifecycle.js; functions/index.js:186 | ACTIVE |
| rlServiceForms (onCall) | Service checklists | Action-specific company/assigned-job capabilities; technicians cannot publish company templates | RL_SERVICE_FORMS_ENABLED | functions/serviceForms.js; functions/index.js:187 | ACTIVE |
| rlEstimate (onCall) | Photo estimates | Owner/admin/manager estimates.manage; secure version-bound recipient approval link for public approval | RL_ESTIMATES_ENABLED; RL_ESTIMATE_EMAIL_ENABLED; RL_EMAIL_ENABLED | functions/estimates.js; functions/index.js:189 | ACTIVE |
| rlEstimateApproval (onCall) | Photo estimates | Owner/admin/manager estimates.manage; secure version-bound recipient approval link for public approval | RL_ESTIMATES_ENABLED; RL_ESTIMATE_EMAIL_ENABLED; RL_EMAIL_ENABLED | functions/estimates.js; functions/index.js:190 | ACTIVE |
| rlNativePush (onCall) | Native push | Live user/install/member authorization; private event/outbox workers and member revocation | RL_NATIVE_PUSH_ENABLED; RL_EXPO_ACCESS_TOKEN_ENABLED; corporate APNs/Android FCM credentials | functions/nativePush.js; functions/index.js:197 | ACTIVE |
| rlQueueNativeJobCreated (onDocumentCreated) | Native push; jobs/{jobId} | Live user/install/member authorization; private event/outbox workers and member revocation | RL_NATIVE_PUSH_ENABLED; RL_EXPO_ACCESS_TOKEN_ENABLED; corporate APNs/Android FCM credentials | functions/nativePush.js; functions/index.js:198 | ACTIVE |
| rlQueueNativeJobUpdated (onDocumentUpdated) | Native push; jobs/{jobId} | Live user/install/member authorization; private event/outbox workers and member revocation | RL_NATIVE_PUSH_ENABLED; RL_EXPO_ACCESS_TOKEN_ENABLED; corporate APNs/Android FCM credentials | functions/nativePush.js; functions/index.js:199 | ACTIVE |
| rlDeliverNativePush (onSchedule) | Native push; every 1 minutes | Live user/install/member authorization; private event/outbox workers and member revocation | RL_NATIVE_PUSH_ENABLED; RL_EXPO_ACCESS_TOKEN_ENABLED; corporate APNs/Android FCM credentials | functions/nativePush.js; functions/index.js:200 | ACTIVE |
| rlNativePushMemberUpdated (onDocumentUpdated) | Native push; teamMembers/{id} | Live user/install/member authorization; private event/outbox workers and member revocation | RL_NATIVE_PUSH_ENABLED; RL_EXPO_ACCESS_TOKEN_ENABLED; corporate APNs/Android FCM credentials | functions/nativePush.js; functions/index.js:201 | ACTIVE |
| rlNativePushMemberDeleted (onDocumentDeleted) | Native push; teamMembers/{id} | Live user/install/member authorization; private event/outbox workers and member revocation | RL_NATIVE_PUSH_ENABLED; RL_EXPO_ACCESS_TOKEN_ENABLED; corporate APNs/Android FCM credentials | functions/nativePush.js; functions/index.js:202 | ACTIVE |
| rlReviewInvitationSettings (onCall) | Verified reviews | Customer portal association or secure invitation for submission; owner/manager provider management; server-only completion lifecycle | RL_REVIEW_INVITATIONS_ENABLED=false; existing email/SMS authorization gates | functions/reviews.js; functions/reviewInvitations.js; functions/index.js:221 | ACTIVE |
| rlReviewInvitation (onCall) | Verified reviews | Customer portal association or secure invitation for submission; owner/manager provider management; server-only completion lifecycle | RL_REVIEW_INVITATIONS_ENABLED=false; existing email/SMS authorization gates | functions/reviews.js; functions/reviewInvitations.js; functions/index.js:222 | ACTIVE |
| rlReviewJobCreated (onDocumentCreated) | Verified reviews; jobs/{jobId} | Customer portal association or secure invitation for submission; owner/manager provider management; server-only completion lifecycle | RL_REVIEW_INVITATIONS_ENABLED=false; existing email/SMS authorization gates | functions/reviews.js; functions/reviewInvitations.js; functions/index.js:223 | ACTIVE |
| rlReviewJobUpdated (onDocumentUpdated) | Verified reviews; jobs/{jobId} | Customer portal association or secure invitation for submission; owner/manager provider management; server-only completion lifecycle | RL_REVIEW_INVITATIONS_ENABLED=false; existing email/SMS authorization gates | functions/reviews.js; functions/reviewInvitations.js; functions/index.js:224 | ACTIVE |
| rlReviewJobDeleted (onDocumentDeleted) | Verified reviews; jobs/{jobId} | Customer portal association or secure invitation for submission; owner/manager provider management; server-only completion lifecycle | RL_REVIEW_INVITATIONS_ENABLED=false; existing email/SMS authorization gates | functions/reviews.js; functions/reviewInvitations.js; functions/index.js:225 | ACTIVE |
| rlScheduleReviewInvitations (onSchedule) | Verified reviews; every 5 minutes | Customer portal association or secure invitation for submission; owner/manager provider management; server-only completion lifecycle | RL_REVIEW_INVITATIONS_ENABLED=false; existing email/SMS authorization gates | functions/reviews.js; functions/reviewInvitations.js; functions/index.js:226 | ACTIVE |
| rlSmsConfig (onCall) | Customer SMS | Tenant roles/consent for settings/queue; private sender approval; signed Twilio callbacks and shared sender STOP suppression | RL_SMS_ENABLED=false; RL_SMS_LIVE_APPROVED=false; bounded private pilot; RL_SMS_SECRETS_CONFIGURED; existing Twilio secrets | functions/sms.js; functions/smsProvider.js; functions/smsProviderEvents.js; functions/smsPilot.js; functions/index.js:231 | ACTIVE |
| rlSmsCustomerConsent (onCall) | Customer SMS | Tenant roles/consent for settings/queue; private sender approval; signed Twilio callbacks and shared sender STOP suppression | RL_SMS_ENABLED=false; RL_SMS_LIVE_APPROVED=false; bounded private pilot; RL_SMS_SECRETS_CONFIGURED; existing Twilio secrets | functions/sms.js; functions/smsProvider.js; functions/smsProviderEvents.js; functions/smsPilot.js; functions/index.js:232 | ACTIVE |
| rlQueueCustomerSms (onCall) | Customer SMS | Tenant roles/consent for settings/queue; private sender approval; signed Twilio callbacks and shared sender STOP suppression | RL_SMS_ENABLED=false; RL_SMS_LIVE_APPROVED=false; bounded private pilot; RL_SMS_SECRETS_CONFIGURED; existing Twilio secrets | functions/sms.js; functions/smsProvider.js; functions/smsProviderEvents.js; functions/smsPilot.js; functions/index.js:233 | ACTIVE |
| rlSmsInbound (onRequest) | Customer SMS | Tenant roles/consent for settings/queue; private sender approval; signed Twilio callbacks and shared sender STOP suppression | RL_SMS_ENABLED=false; RL_SMS_LIVE_APPROVED=false; bounded private pilot; RL_SMS_SECRETS_CONFIGURED; existing Twilio secrets | functions/sms.js; functions/smsProvider.js; functions/smsProviderEvents.js; functions/smsPilot.js; functions/index.js:234 | ACTIVE |
| rlSmsStatus (onRequest) | Customer SMS | Tenant roles/consent for settings/queue; private sender approval; signed Twilio callbacks and shared sender STOP suppression | RL_SMS_ENABLED=false; RL_SMS_LIVE_APPROVED=false; bounded private pilot; RL_SMS_SECRETS_CONFIGURED; existing Twilio secrets | functions/sms.js; functions/smsProvider.js; functions/smsProviderEvents.js; functions/smsPilot.js; functions/index.js:235 | ACTIVE |
| rlSmsProviderEvents (onRequest) | Customer SMS | Tenant roles/consent for settings/queue; private sender approval; signed Twilio callbacks and shared sender STOP suppression | RL_SMS_ENABLED=false; RL_SMS_LIVE_APPROVED=false; bounded private pilot; RL_SMS_SECRETS_CONFIGURED; existing Twilio secrets | functions/sms.js; functions/smsProvider.js; functions/smsProviderEvents.js; functions/smsPilot.js; functions/index.js:236 | ACTIVE |
| rlScheduleCustomerSms (onSchedule) | Customer SMS; every 15 minutes | Tenant roles/consent for settings/queue; private sender approval; signed Twilio callbacks and shared sender STOP suppression | RL_SMS_ENABLED=false; RL_SMS_LIVE_APPROVED=false; bounded private pilot; RL_SMS_SECRETS_CONFIGURED; existing Twilio secrets | functions/sms.js; functions/smsProvider.js; functions/smsProviderEvents.js; functions/smsPilot.js; functions/index.js:240 | ACTIVE |
| rlDeliverCustomerSms (onSchedule) | Customer SMS; every 1 minutes | Tenant roles/consent for settings/queue; private sender approval; signed Twilio callbacks and shared sender STOP suppression | RL_SMS_ENABLED=false; RL_SMS_LIVE_APPROVED=false; bounded private pilot; RL_SMS_SECRETS_CONFIGURED; existing Twilio secrets | functions/sms.js; functions/smsProvider.js; functions/smsProviderEvents.js; functions/smsPilot.js; functions/index.js:241 | ACTIVE |
| rlQueueSmsJobCreated (onDocumentCreated) | Customer SMS; jobs/{jobId} | Tenant roles/consent for settings/queue; private sender approval; signed Twilio callbacks and shared sender STOP suppression | RL_SMS_ENABLED=false; RL_SMS_LIVE_APPROVED=false; bounded private pilot; RL_SMS_SECRETS_CONFIGURED; existing Twilio secrets | functions/sms.js; functions/smsProvider.js; functions/smsProviderEvents.js; functions/smsPilot.js; functions/index.js:242 | ACTIVE |
| rlQueueSmsJobUpdated (onDocumentUpdated) | Customer SMS; jobs/{jobId} | Tenant roles/consent for settings/queue; private sender approval; signed Twilio callbacks and shared sender STOP suppression | RL_SMS_ENABLED=false; RL_SMS_LIVE_APPROVED=false; bounded private pilot; RL_SMS_SECRETS_CONFIGURED; existing Twilio secrets | functions/sms.js; functions/smsProvider.js; functions/smsProviderEvents.js; functions/smsPilot.js; functions/index.js:243 | ACTIVE |
| rlGetRoutingTeam (onCall) | Routes | Active tenant staff; technician own member only; dispatch/optimize authority to save | Existing browser VITE_GOOGLE_MAPS_API_KEY; Maps JavaScript Routes API | functions/routes.js; functions/index.js:245 | ACTIVE |
| rlGetDailyRoute (onCall) | Routes | Active tenant staff; technician own member only; dispatch/optimize authority to save | Existing browser VITE_GOOGLE_MAPS_API_KEY; Maps JavaScript Routes API | functions/routes.js; functions/index.js:246 | ACTIVE |
| rlApplyJobOperation (onCall) | Offline job operations | Verified live workspace and assigned-job authorization; idempotent operation IDs/version conflicts | No offline privilege or assignment bypass | functions/offline.js; functions/index.js:247 | ACTIVE |
| rlSaveDailyRoute (onCall) | Routes | Active tenant staff; technician own member only; dispatch/optimize authority to save | Existing browser VITE_GOOGLE_MAPS_API_KEY; Maps JavaScript Routes API | functions/routes.js; functions/index.js:248 | ACTIVE |
| rlWorkShift (onCall) | Work location/attendance | Explicit worker permission/active shift; owner policy and tenant dispatcher visibility; retained GPS cleanup | Company interval 1/3/5 minutes; native permission; active shift; retention policy | functions/locations.js; functions/index.js:250 | ACTIVE |
| rlSetLocationPolicy (onCall) | Work location/attendance | Explicit worker permission/active shift; owner policy and tenant dispatcher visibility; retained GPS cleanup | Company interval 1/3/5 minutes; native permission; active shift; retention policy | functions/locations.js; functions/index.js:251 | ACTIVE |
| rlJobVisit (onCall) | Work location/attendance | Explicit worker permission/active shift; owner policy and tenant dispatcher visibility; retained GPS cleanup | Company interval 1/3/5 minutes; native permission; active shift; retention policy | functions/locations.js; functions/index.js:252 | ACTIVE |
| rlUpdateWorkLocation (onCall) | Work location/attendance | Explicit worker permission/active shift; owner policy and tenant dispatcher visibility; retained GPS cleanup | Company interval 1/3/5 minutes; native permission; active shift; retention policy | functions/locations.js; functions/index.js:253 | ACTIVE |
| rlGetTeamLocations (onCall) | Work location/attendance | Explicit worker permission/active shift; owner policy and tenant dispatcher visibility; retained GPS cleanup | Company interval 1/3/5 minutes; native permission; active shift; retention policy | functions/locations.js; functions/index.js:254 | ACTIVE |
| rlSetLocationRetention (onCall) | Work location/attendance | Explicit worker permission/active shift; owner policy and tenant dispatcher visibility; retained GPS cleanup | Company interval 1/3/5 minutes; native permission; active shift; retention policy | functions/locations.js; functions/index.js:255 | ACTIVE |
| rlCleanupLocations (onSchedule) | Work location/attendance; every 60 minutes | Explicit worker permission/active shift; owner policy and tenant dispatcher visibility; retained GPS cleanup | Company interval 1/3/5 minutes; native permission; active shift; retention policy | functions/locations.js; functions/index.js:256 | ACTIVE |
| rlQuickBooksStatus (onCall) | QuickBooks | Live tenant authorization; owner OAuth/config/write actions; single-use callback state; signed realm-routed webhook | RL_QB_ENABLED=true; RL_QB_ENV=sandbox; RL_QB_CREDENTIAL_ENV=sandbox; RL_QB_WRITES_ENABLED=false; RL_QB_PRODUCTION_APPROVED=false; processor schedule historically PAUSED | functions/quickbooks.js; functions/index.js:260 | ACTIVE |
| rlQuickBooksConnect (onCall) | QuickBooks | Live tenant authorization; owner OAuth/config/write actions; single-use callback state; signed realm-routed webhook | RL_QB_ENABLED=true; RL_QB_ENV=sandbox; RL_QB_CREDENTIAL_ENV=sandbox; RL_QB_WRITES_ENABLED=false; RL_QB_PRODUCTION_APPROVED=false; processor schedule historically PAUSED | functions/quickbooks.js; functions/index.js:261 | ACTIVE |
| rlQuickBooksOAuthCallback (onRequest) | QuickBooks | Live tenant authorization; owner OAuth/config/write actions; single-use callback state; signed realm-routed webhook | RL_QB_ENABLED=true; RL_QB_ENV=sandbox; RL_QB_CREDENTIAL_ENV=sandbox; RL_QB_WRITES_ENABLED=false; RL_QB_PRODUCTION_APPROVED=false; processor schedule historically PAUSED | functions/quickbooks.js; functions/index.js:262 | ACTIVE |
| rlQuickBooksDisconnect (onCall) | QuickBooks | Live tenant authorization; owner OAuth/config/write actions; single-use callback state; signed realm-routed webhook | RL_QB_ENABLED=true; RL_QB_ENV=sandbox; RL_QB_CREDENTIAL_ENV=sandbox; RL_QB_WRITES_ENABLED=false; RL_QB_PRODUCTION_APPROVED=false; processor schedule historically PAUSED | functions/quickbooks.js; functions/index.js:263 | ACTIVE |
| rlQuickBooksSettings (onCall) | QuickBooks | Live tenant authorization; owner OAuth/config/write actions; single-use callback state; signed realm-routed webhook | RL_QB_ENABLED=true; RL_QB_ENV=sandbox; RL_QB_CREDENTIAL_ENV=sandbox; RL_QB_WRITES_ENABLED=false; RL_QB_PRODUCTION_APPROVED=false; processor schedule historically PAUSED | functions/quickbooks.js; functions/index.js:264 | ACTIVE |
| rlQuickBooksOptions (onCall) | QuickBooks | Live tenant authorization; owner OAuth/config/write actions; single-use callback state; signed realm-routed webhook | RL_QB_ENABLED=true; RL_QB_ENV=sandbox; RL_QB_CREDENTIAL_ENV=sandbox; RL_QB_WRITES_ENABLED=false; RL_QB_PRODUCTION_APPROVED=false; processor schedule historically PAUSED | functions/quickbooks.js; functions/index.js:265 | ACTIVE |
| rlQuickBooksAdopt (onCall) | QuickBooks | Live tenant authorization; owner OAuth/config/write actions; single-use callback state; signed realm-routed webhook | RL_QB_ENABLED=true; RL_QB_ENV=sandbox; RL_QB_CREDENTIAL_ENV=sandbox; RL_QB_WRITES_ENABLED=false; RL_QB_PRODUCTION_APPROVED=false; processor schedule historically PAUSED | functions/quickbooks.js; functions/index.js:266 | ACTIVE |
| rlQuickBooksPreview (onCall) | QuickBooks | Live tenant authorization; owner OAuth/config/write actions; single-use callback state; signed realm-routed webhook | RL_QB_ENABLED=true; RL_QB_ENV=sandbox; RL_QB_CREDENTIAL_ENV=sandbox; RL_QB_WRITES_ENABLED=false; RL_QB_PRODUCTION_APPROVED=false; processor schedule historically PAUSED | functions/quickbooks.js; functions/index.js:267 | ACTIVE |
| rlQuickBooksSync (onCall) | QuickBooks | Live tenant authorization; owner OAuth/config/write actions; single-use callback state; signed realm-routed webhook | RL_QB_ENABLED=true; RL_QB_ENV=sandbox; RL_QB_CREDENTIAL_ENV=sandbox; RL_QB_WRITES_ENABLED=false; RL_QB_PRODUCTION_APPROVED=false; processor schedule historically PAUSED | functions/quickbooks.js; functions/index.js:268 | ACTIVE |
| rlQuickBooksReconcile (onCall) | QuickBooks | Live tenant authorization; owner OAuth/config/write actions; single-use callback state; signed realm-routed webhook | RL_QB_ENABLED=true; RL_QB_ENV=sandbox; RL_QB_CREDENTIAL_ENV=sandbox; RL_QB_WRITES_ENABLED=false; RL_QB_PRODUCTION_APPROVED=false; processor schedule historically PAUSED | functions/quickbooks.js; functions/index.js:269 | ACTIVE |
| rlQuickBooksWebhook (onRequest) | QuickBooks | Live tenant authorization; owner OAuth/config/write actions; single-use callback state; signed realm-routed webhook | RL_QB_ENABLED=true; RL_QB_ENV=sandbox; RL_QB_CREDENTIAL_ENV=sandbox; RL_QB_WRITES_ENABLED=false; RL_QB_PRODUCTION_APPROVED=false; processor schedule historically PAUSED | functions/quickbooks.js; functions/index.js:270 | ACTIVE |
| rlQuickBooksProcessEvents (onSchedule) | QuickBooks; every 5 minutes | Live tenant authorization; owner OAuth/config/write actions; single-use callback state; signed realm-routed webhook | RL_QB_ENABLED=true; RL_QB_ENV=sandbox; RL_QB_CREDENTIAL_ENV=sandbox; RL_QB_WRITES_ENABLED=false; RL_QB_PRODUCTION_APPROVED=false; processor schedule historically PAUSED | functions/quickbooks.js; functions/index.js:271 | ACTIVE |
| onTeamMemberDeleted (onDocumentDeleted) | Membership claims lifecycle; teamMembers/{id} | Server-only member lifecycle; reevaluates claims and revokes sessions | No public invocation | functions/index.js; functions/claims.js; functions/index.js:282 | ACTIVE |
| onTeamMemberUpdated (onDocumentUpdated) | Membership claims lifecycle; teamMembers/{id} | Server-only member lifecycle; reevaluates claims and revokes sessions | No public invocation | functions/index.js; functions/claims.js; functions/index.js:286 | ACTIVE |
| notifyJobAssigned (onDocumentUpdated) | Web FCM notification history; jobs/{jobId} | Server-only assigned-member/owner notifications; tenant-scoped saved notification history | Registered web FCM deviceTokens; distinct from Expo native registration | functions/index.js; functions/notify.js; functions/index.js:337 | ACTIVE |
| rlNotifyNewJobAssigned (onDocumentCreated) | Web FCM notification history; jobs/{jobId} | Server-only assigned-member/owner notifications; tenant-scoped saved notification history | Registered web FCM deviceTokens; distinct from Expo native registration | functions/index.js; functions/notify.js; functions/index.js:338 | ACTIVE |
| rlNotifyJobStatus (onDocumentUpdated) | Web FCM notification history; jobs/{jobId} | Server-only assigned-member/owner notifications; tenant-scoped saved notification history | Registered web FCM deviceTokens; distinct from Expo native registration | functions/index.js; functions/notify.js; functions/index.js:339 | ACTIVE |
| stamp_customers (onDocumentCreated) | Legacy tenancy stamping; customers/{id} | Server-only legacy owner attribution; only current authorized verified manager; never turns technician solo records into company records | No browser invocation; preserves existing tenanted records | functions/index.js; functions/index.js:296 | ACTIVE |
| stamp_jobs (onDocumentCreated) | Legacy tenancy stamping; jobs/{id} | Server-only legacy owner attribution; only current authorized verified manager; never turns technician solo records into company records | No browser invocation; preserves existing tenanted records | functions/index.js; functions/index.js:296 | ACTIVE |
| stamp_appointments (onDocumentCreated) | Legacy tenancy stamping; appointments/{id} | Server-only legacy owner attribution; only current authorized verified manager; never turns technician solo records into company records | No browser invocation; preserves existing tenanted records | functions/index.js; functions/index.js:296 | ACTIVE |
| stamp_photos (onDocumentCreated) | Legacy tenancy stamping; photos/{id} | Server-only legacy owner attribution; only current authorized verified manager; never turns technician solo records into company records | No browser invocation; preserves existing tenanted records | functions/index.js; functions/index.js:296 | ACTIVE |
| stamp_estimates (onDocumentCreated) | Legacy tenancy stamping; estimates/{id} | Server-only legacy owner attribution; only current authorized verified manager; never turns technician solo records into company records | No browser invocation; preserves existing tenanted records | functions/index.js; functions/index.js:296 | ACTIVE |
| stamp_estimateTemplates (onDocumentCreated) | Legacy tenancy stamping; estimateTemplates/{id} | Server-only legacy owner attribution; only current authorized verified manager; never turns technician solo records into company records | No browser invocation; preserves existing tenanted records | functions/index.js; functions/index.js:296 | ACTIVE |
| stamp_invoices (onDocumentCreated) | Legacy tenancy stamping; invoices/{id} | Server-only legacy owner attribution; only current authorized verified manager; never turns technician solo records into company records | No browser invocation; preserves existing tenanted records | functions/index.js; functions/index.js:296 | ACTIVE |
| stamp_servicePlans (onDocumentCreated) | Legacy tenancy stamping; servicePlans/{id} | Server-only legacy owner attribution; only current authorized verified manager; never turns technician solo records into company records | No browser invocation; preserves existing tenanted records | functions/index.js; functions/index.js:296 | ACTIVE |
| stamp_serviceLogs (onDocumentCreated) | Legacy tenancy stamping; serviceLogs/{id} | Server-only legacy owner attribution; only current authorized verified manager; never turns technician solo records into company records | No browser invocation; preserves existing tenanted records | functions/index.js; functions/index.js:296 | ACTIVE |

The endpoint inventory, current metadata correlation and trigger details are retained locally in `.migration/acceptance-api-inventory.json`. The source of truth for current bindings remains `functions/index.js` and the named implementation modules. Private secrets are identified by names/configuration only; no payload appears in this plan.
