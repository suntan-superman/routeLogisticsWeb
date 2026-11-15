# RouteLogistics migration progress — November 12, 2026

## Commercial readiness release — November 13, 2026

Implemented the independently executable commercial-readiness work in the existing main checkout and production project. Detailed configuration, rebuild commands and operational limitations are in [commercial readiness](commercial-readiness.md) and [customer SMS setup](customer-sms-setup.md).

- Native push: scoped installation registration, explicit opt-in/preferences, monotonic token rotation, membership invalidation, stale-token expiry, assignment/schedule/status outbox, receipt processing and authorized/deferred notification navigation. Ambiguous send acceptance is retained for review. Existing web push is preserved. Native delivery stays disabled pending EAS APNs/FCM credentials and device verification.
- SMS: purpose-scoped consent evidence, suppression, signed STOP/START/HELP and delivery callbacks, company templates/timing, idempotent scheduling, controlled retries, audit and private per-company sender/automation approval. No legacy phone number constitutes consent. Delivery remains disabled; Twilio credentials and registered-sender authorization are missing.
- Stripe: payment eligibility, history, review alerts, current-state refund/dispute reconciliation and guarded customer confirmation. Deployed Stripe remains enabled in test mode with `RL_STRIPE_LIVE_APPROVED=false`; no real charges or refunds were issued.
- QuickBooks: RL-owned OAuth/mappings/reviewed exports/reconciliation retained and hardened with explicit production approval, connection health and finite-total validation. Reviewed all three supplied `docs/QuickBooks` MF documents. Their callback/secrets/permissive connection rules are not copied. Production remains disabled. Sandbox credentials, reviewed service/account mappings and provider validation remain; taxed invoice export still requires explicit tax mapping. Automatic two-way customer/item or outbound Stripe-payment export is not claimed.
- Service templates: eight versioned starter/foundation templates, required validation, readings/units, checklists/dropdowns/photos/notes, immutable service-date reports, company versions and durable mobile offline drafts/conflict review. Template attachment is explicit. Existing chemical application records and legacy job-completion rules remain intact.
- Estimates: manager/owner/admin-only photo-first mobile/web workflow, server cents/tax totals, private JPEGs/PDFs, immutable versions, delivery status, expiring version-bound customer approval and idempotent approved-estimate conversion. Prospect conversion requires explicit customer creation or matching-customer reuse and never overwrites an existing customer. Existing estimates are preserved. SendGrid is enabled only through an explicit confirmed Send action; creating/revising an estimate does not send it. A pre-activation audit found zero pending estimate messages. No real estimate email was sent during testing.

Validation:

| Check | Result |
| --- | --- |
| Mobile/UI/service tests | 168 passed |
| Web tests | 60 passed |
| Functions unit tests | 55 passed; one emulator-only case skipped here and exercised in emulator run |
| Combined Firestore/Storage/authorization/workflow tests | 133 passed |
| Final estimate/QuickBooks regressions after JPEG and numeric-total fixes | 19 passed (targeted rerun, not an additional distinct-suite total) |
| Auth/Functions end-to-end | 6 passed |
| Expo Doctor | 18/18 passed |
| Expo dependency compatibility | Up to date |
| iOS and Android bundle exports | Passed |
| Web lint/build | Passed; 8 existing hook warnings, 0 errors |

The JPEG/PDF regression found and fixed pooled-buffer offset handling in the local PDF encoder. The Auth trigger test now waits for its actual asynchronous stamped-field condition with a bounded 30-second deadline; the expanded emulator trigger queue exceeded the old 10-second bound. No application modal/picker delays were introduced.

Production deployment verified: all **82** `routelogistics` functions are `ACTIVE`. The full RL codebase deployment succeeded; the estimate callables and existing email worker then received the enabled estimate-email configuration. Representative revisions: `rlestimate-00002-pur`, `rlestimateapproval-00002-pol`, `rldeliveremail-00013-kes`, `rlserviceforms-00001-biy`. The existing SMTP secret remains bound only where required; Stripe webhook retains both existing Stripe secret bindings. Missing optional/provider secrets are not bound prematurely.

The narrow managed-estimate Firestore rule guard is deployed, and the new SMS/payment-history indexes are READY. All **29 mi Factotum function definitions/hashes remain unchanged**. All **507 Acme customer document versions match the pre-release fingerprint**. No memberships, existing invoices, service plans or chemical logs were migrated or rewritten. No unsolicited messages or live financial transactions were performed.

Firebase Android registration `1:1030013411579:android:5a32749da69638635c505e` now supports the unchanged `com.workside.routelogistics` package in the existing project; its checked-in Google Services file is public client configuration. iOS bundle `com.worksidesoftware.routelogisticsapp`, corporate team `AXCZ2G99P6`, Expo owner `sjroy5` and EAS project `a6b5d885-dd99-4435-bef0-b7ffe09a2890` are preserved. No Firebase iOS registration was needed for the existing JS SDK plus Expo APNs integration.

Remaining acceptance: signed native rebuild; iOS/Android foreground/background/cold-start push, account/role switching and opt-out; camera/gallery/cancellation/retry/offline service-report workflow; estimate photo capture/PDF share, actual authorized email inbox delivery/customer approval; Twilio sandbox/approved-recipient delivery and sender registration; QuickBooks sandbox OAuth/export/reconciliation. Live Stripe and production accounting need explicit operator approval. This release does not mark provider/device acceptance or the historical Acme invitation-acceptance migration complete.


**Subsequent ten-phase release:** See [accelerated production progress](accelerated-production-progress.md) for the new company/membership/customer fixes, payment/accounting integrations, routing, foreground location and offline queues. It supersedes the remaining-work and Storage-revocation statements in this earlier report; historical evidence below is preserved.

This report records the autonomous implementation run against the two existing plans. RouteLogistics was the only source tree edited; mifactotum was used as read-only reference. Work stayed on the existing `main` branch and shared Firebase project `mi-factotum-field-service`, without a staging environment.

Checked items in the plans mean implementation is present and locally verified. They do not imply every feature is enabled in production. Deployment results are recorded below. The complete roadmap is not finished.

## Acme staff reconciliation — November 13, 2026

**Status: approved staff repair applied; migration remains incomplete pending
member acceptance and access verification.** The owner approved all five proposed
`technician` assignments and preservation of the existing `manager` assignment.
The production verification at **9:50 AM Pacific on November 13** used the existing
`main` branch and project `mi-factotum-field-service`. No deployment, additional
branch, or staging environment was needed. This supersedes the older role-approval
statements below.

The original six-person candidate list and subsequent reconciliation agree with
production before repair. Seven legacy invitation records remain unchanged: the
six candidates and the accepted company-owner invitation. Before repair there were
only two pending team rows. After repair there are **six unique pending RL
memberships: five technicians and one manager**, with zero duplicate normalized
company/email groups and zero active staff memberships.

The owner retained the same company ownership and `owner` claims. The manager's
membership, role, invitation secret, and expiry were preserved exactly. That
existing invitation is valid through **November 19 at 10:53 PM Pacific**. It was
not reissued or emailed again. If the original link is unavailable, reissue it
through the owner's Company Settings instead of creating another member.

All five approved technician invitations were issued using the existing
`createInvitation` mechanism. Four new pending memberships were created; the
existing legacy membership ID was reused for the fifth. Its complete original is
backed up under both the migration run and the atomic membership audit. The five
new invitation identities point to their canonical team rows. Existing active
memberships are rejected by this mechanism rather than overwritten.

The production email worker was confirmed active, enabled, and bound to the
existing SMTP secret without accessing its payload. Exactly **five** invitation
emails were queued and recorded as **sent on their first SMTP attempt at 9:50 AM**.
This verifies SMTP acceptance, not recipient inbox arrival. New technician links
expire **November 20 at approximately 9:49 AM Pacific**. No bulk reminder, invoice,
or additional manager email was sent.

All six Firebase accounts exist, are enabled, and have verified email addresses.
None has accepted an RL invitation or has RL membership claims. Production
authorization checks deny staff access while pending and deny owner operations to
all six. No invitation was accepted on behalf of a user, email verification was not
bypassed, and no staff claims were manually assigned. Account holders must accept
using their own invited email addresses, then refresh their session. Accepted
production claims and access remain to be verified.

All **507 customers** exactly match the original migration backups plus the
previously approved normalization, with no missing records or additional changes.
All 507 pre-repair per-record fingerprints match after the repair. **62 existing
tests passed:** 11 claims/migration unit tests, 47 invitation/authorization
Firestore emulator tests, and four Auth/Functions end-to-end tests. These cover
duplicate reissue, invalidated links, verified-email acceptance, refreshed Firebase
membership claims, owner access, role limits, and tenant isolation.

The production audit is `rlMigrationRuns/acme-staff-approved-20261113`, with status
`awaiting-member-acceptance` and `migrationComplete: false`. Legacy MF invitations
and source/functions were preserved. Private evidence is in ignored `.migration/`:

- `acme-staff-applied-20261113.md`: current six-person table and acceptance steps.
- `acme-staff-owner-approval-20261113.json`: the approved mapping and owner response.
- `acme-staff-apply-result-20261113.json`: applied changes and preservation checks.
- `acme-staff-verification-1794592245627.json`: production delivery, authorization,
  backup, uniqueness, and customer verification.
- `acme-customers-before-staff-20261113.json`: unchanged 507-customer baseline.
- Earlier reconciliation and proposal files remain historical pre-approval evidence.

Remaining user steps: the five technician accounts accept their emailed invitations;
the manager accepts the preserved existing invitation. The read-only verifier
`.migration/acme-staff-verify.cjs` can check accepted membership IDs, roles, claims,
and authorized access afterward. Do not mark migration complete until every intended
account has accepted and its access is verified.

### Manager invitation delivery follow-up — November 13, 2026

The owner reported that `acme-manager@route-logistics.com` never received its
invitation. A production check at 2:32 PM Pacific confirmed one pending manager
membership, an enabled verified Firebase account, and no invitation email record.
The earlier migration had preserved this invitation without queuing an email.

Using the existing audited `createInvitation` mechanism, exactly one invitation
was reissued with the same membership ID and approved `manager` role. The original
membership was backed up; the old invitation link was invalidated. The email worker
recorded the new invitation as **sent on its first SMTP attempt at 2:33 PM Pacific**
(`2026-11-13T22:33:03.988Z`). SMTP acceptance is verified; inbox arrival is not.
The new link expires November 20 at 2:32 PM Pacific.

All 507 customers, other memberships and legacy MF invitation records were
fingerprint-checked and remain unchanged; there are still six RL membership rows.
No account was automatically accepted or granted claims. The manager must open the
new email link while signed in as the invited account and explicitly accept it.
Migration remains incomplete pending acceptance and access verification. Private
evidence is in ignored `.migration/acme-manager-reissue-*.json`.

### Sign-in follow-up

The operator confirmed receiving the invitation emails and reported that the first
owner sign-in showed an error while the second succeeded. Production Auth metadata
showed successful authentication with an enabled, verified password account and
unchanged owner claims. The browser console identified a Firestore permissions
error in the sign-in handler's redundant profile read, after authentication had
already succeeded.

Web commit `57ecd55` removes that early read and leaves profile loading to the
existing claims/session initialization. Login redirects from current auth state
so router remounts cannot leave a signed-in user on the login form. It also adds
the missing password-reset option and explains existing-account passwords on
invitation pages. No password, Auth account, or authorization rule was changed.
An isolated browser test reproduced the original permission error and verified
first-attempt navigation, invitation return paths, and generic password recovery
responses. The 20 web tests, changed-file lint, and production build passed.
Netlify production assets were verified at **9:59 AM Pacific** with the new login,
password recovery, and invitation guidance published. The existing Firebase and
Maps browser keys were unchanged. No real reset emails were sent during testing.

## Batch 1: tenancy and migration

| Phase | Result |
|---|---|
| 1. Review shared tenancy and authorization | Reviewed web/mobile authentication, Firestore and Storage rules, functions, collections, queries, and MF reference implementations. Found automatic invite activation, stale-member access, legacy claimless write paths, and mobile verification bypasses. |
| 2. Invitations | Added owner-authorized invitation creation/reissue, 256-bit links, hashed secrets, seven-day expiry, explicit verified-email acceptance, one-company membership locking, and role/deactivation controls. Signing in alone never activates an invitation. |
| 3. Account verification | Added web verification guidance/resend/refresh and preserved invitation return paths through login/signup. Mobile now trusts Firebase Auth verification and persisted sessions; removed password storage, debug verification bypass, and password-based auto-login. |
| 4. Authorization and rate limits | Company access checks live ownership/membership and role. Revoked Firestore access no longer waits for token expiry. Protected server-managed profile fields and claimless write paths; added transactional rate limits to RL callables and portal endpoints. |
| 5. Migration tooling and Acme data | Added dry-run-first additive migration with explicit project/company selection, schema review, explicit RL roles, and transactional original-record backups. Applied Acme customer normalization; see the audit below. |
| 6. Customer import/export | Added CSV preview, quoted-field parsing, validation, formula-safe export, 100-record import batches, concurrent/retry deduplication, customer email normalization, and paginated customer loading/export. Import preview is limited to 5,000 rows. Search currently covers loaded customers. |
| 7. Recurring visits | Added a daily scheduler and shared manual callable with deterministic job IDs and atomic plan advancement. Retry/concurrent requests create one job for the expected visit date. Existing MF `recurringJobs` are separate from RL `servicePlans`; the MF scheduler was not modified. |
| 8. Security/workflow regression tests | Added emulator coverage for tenancy, explicit invitations, stale claims, concurrent import/recurrence/rate limits, and protected server records. |

## Batch 2: customer and field workflows

| Phase | Result |
|---|---|
| 9. Customer portal | Added `/portal`, expiring single-use OTPs, five-attempt limits, generic email responses, and separate customer identities/browser sessions. Server responses expose only matching customer visits and non-draft invoices, without internal notes. Views cap results at 25 accounts and 50 visits/invoices per account and disclose the cap. |
| 10. Email delivery and reminders | Added a leased SMTP outbox, bounded retry/backoff, invoice emails, and weekly-deduplicated overdue reminders requiring company opt-in plus customer consent. Paid/void invoices cancel pending delivery. **Email remains disabled at the user's request.** Direct invitation links still work; portal sign-in, invoice email, and reminders are inactive. |
| 11. Ownership transfer | Added recent-login/verified-owner transfer to an active company administrator, with an audit record and continued admin access for the outgoing owner. Recovery when the owner cannot sign in still requires operator intervention. |
| 12. Mobile tenant access and job updates | Unified mobile sessions/claims, scoped reads and writes to the active company, standardized local job dates and time values, removed demo photo/route placeholders, and restricted technician management actions. |
| 13. Mobile photos | Added camera/library selection, compression, size checks, Firebase Storage upload, shared photo metadata, and galleries in job views. Native permission prompts and camera behavior need device/Xcode validation. Uploads currently require connectivity. |
| 14. Notifications and privacy | Persisted assignment/status notification history independently of device tokens, added `/notifications` and mark-read controls, retained FCM delivery with dead-token cleanup, and added `/privacy`. Native push registration/delivery still needs device work. |
| 15. Reliability and performance | Added an offline notice and transactional web job-edit conflict detection. Lazy-loaded web routes, optional Firebase Performance tracing, and Sentry payload/identity scrubbing. This is not full offline background reconciliation. |
| 16. Tooling and dependencies | Made lint blocking in CI; added emulator and both-platform mobile export jobs, Node 22/Java 21 configuration, mobile lockfile, SDK-compatible Expo packages, and compatible dependency security updates. |

## Live Acme migration audit

- Company: `z7DJMjeigjG64YfN4H5h`.
- Applied **507 customer updates** to add normalized email fields; **six** also received a missing owner attribution field. Existing MF fields were preserved.
- Every updated record has an original-record backup in `rlMigrationRuns/DmMODGpey4aFsQMuTg1C/originals`; verified 507 backups and a completed run.
- A second dry run reported **zero remaining updates**, zero unsupported records requiring review, and six legacy invite candidates needing explicit RL roles.
- No invitations were sent, no legacy roles were silently mapped, and no legacy source files were changed.
- Private reports and the six-entry role template are in ignored `.migration/`. They contain customer/team information and must not be committed. Choose `technician`, `manager`, or `admin` for each applicable invitee before reissuing RL invitations. Direct links can be created/reissued in Company Settings while email is disabled.
- The script preserves original fields and fails on unsupported job/invoice shapes. It does not migrate every MF-only collection, convert QuickBooks credentials, delete MF data, or retire MF Cloud Functions.

Example dry run, from the repository root:

```powershell
node scripts/migrate-mf-companies.js --project mi-factotum-field-service --company z7DJMjeigjG64YfN4H5h --report .migration/new-dry-run.json
```

`--apply --data-only` performs additive data changes without invitations. `--apply --roles <private-file.json>` requires an explicit role for every selected legacy invitee. With email disabled, the tool creates pending memberships; the owner must reissue/copy links through Company Settings. Reports use exclusive creation and will not overwrite an existing file. Restoring an original backup is a manual, record-by-record operation: compare any intervening edits first.

## Validation

- Backend unit tests: 15 passing.
- Web unit tests: 16 passing.
- Firestore rules and workflow integration tests: 43 passing.
- Auth/Firestore/Functions end-to-end tests: 4 passing.
- Total: **78 tests**. Tests use `demo-routelogistics` emulators; live customer data is not test data.
- Web production build succeeds; lint reports zero errors and six existing hook-dependency warnings. A separate source check found zero undefined identifiers, unreachable-code errors, or duplicate object keys across functions/scripts/mobile.
- Expo dependency compatibility check succeeds; iOS and Android Hermes bundles both export successfully. These are JavaScript bundle checks, not signed native builds or device tests.
- Initial web JavaScript decreased from about 3.14 MB (807 KB gzip) to 1.10 MB (352 KB gzip). Initial CSS decreased from about 1.70 MB to 35 KB. The calendar is now a separate large chunk; Vite still warns about large chunks. No claim is made that the roadmap's three-second page-load target has been measured or achieved.

Reproduce from the root with `npm ci`, `npm --prefix functions ci`, `npm test`, and `npm run test:e2e`. Install web dependencies with `npm ci --legacy-peer-deps`, then run `npm run lint` and `npm run build` in `routeLogisticsWeb`. In `routeLogisticsMobile`, run `npm ci`, `npx expo install --check`, and `npx expo export --platform ios --platform android --max-workers 2`.

## Dependency review

Audit snapshot after compatible updates:

| Package tree | Critical | High | Moderate | Low |
|---|---:|---:|---:|---:|
| Root test/deploy tooling | 0 | 0 | 14 | 0 |
| Functions | 0 | 0 | 8 | 0 |
| Web | 0 | 0 | 2 | 0 |
| Mobile | 0 | 1 | 11 | 1 |

The remaining high finding is Metro's transitive `image-size` dependency used during builds. A forced major override would change the API Metro imports; it was not applied. Remaining findings include Router/Firebase/Google dependency chains and Expo tooling. Major framework/SDK upgrades need their own compatibility work. Counts overlap between package trees and will change as advisories are updated; they are not a count of independently exploitable application vulnerabilities.

## Deployment and configuration

All 28 RL Cloud Functions deployed successfully and were verified `ACTIVE`. Firestore rules, Storage rules, and all 34 required composite indexes deployed successfully; all 68 project indexes are now `READY`. The 34 existing indexes outside this repository were retained, and no pre-existing MF/RL function disappeared from the live inventory. Live unauthenticated requests to `syncClaims`, `acceptTeamInvite`, and `bulkImportCustomers` return 401; the portal code endpoint returns the intended email-disabled response. The worker's live environment confirms `RL_EMAIL_ENABLED=false`. The existing Netlify/GitHub deployment path and mobile application identifiers are retained. The live web origin is `https://route-logistics.com`.

Implementation commits `a77ab38` and `3f3c843` were pushed to the existing `main` branch. The automatic web deployment is verified live: the main asset matches the final local build, `/accept-invite`, `/portal`, `/privacy`, and `/notifications` return the new SPA, and the invitation/portal/privacy JavaScript chunks load successfully. All three [GitHub CI jobs for the published source](https://github.com/suntan-superman/routeLogisticsWeb/actions/runs/43380664451)—web, mobile, and rules/functions—completed successfully. These public-route checks do not replace signed-in browser/device acceptance tests. The final documentation-only commit records this evidence without rebuilding unchanged application code.

- Email is explicitly off: `RL_EMAIL_ENABLED=false`. Disabled deployments require no SMTP secret binding. Invitation links are available for direct sharing. Firebase Auth verification emails are separate from this SMTP feature.
- To enable later, configure `RL_SMTP_URL` in Firebase Secret Manager and a verified `RL_EMAIL_FROM`, set `RL_EMAIL_ENABLED=true` in the Functions deployment environment, then redeploy the RL codebase. The deployed binding is selected from this environment value; changing a local file alone does not enable delivery. `RL_APP_URL` is now `https://route-logistics.com`, verified against authorized domains and the live site. The obsolete `.app` default did not resolve and was corrected. Copied invitation links also use the browser's current app origin. Never put SMTP passwords in Git or chat.
- Deploy only `functions:routelogistics` in this shared project. A bare `--only functions` deployment risks touching MF exports. Deploy the updated indexes and rules together with this version; old staff tokens need a claims refresh/sign-in to obtain `membershipId`.
- Portal token creation requires the runtime identity to be allowed to sign Firebase custom tokens. Emulator tests cannot verify production IAM or SMTP delivery.
- Firestore TTL policies for `rlRateLimits.expiresAt`, `rlPortalChallenges.expiresAt`, and `rlMail.expiresAt` have not been configured. Application expiry checks are enforced independently, but physical record retention needs an operator-selected policy. The protected mail outbox includes invitation links or OTPs until cleanup.
- SMTP delivery is at-least-once. Leases and stable Message-ID values reduce duplicates, but a crash after SMTP acceptance and before saving success can resend a message.
- Storage still authorizes company access using token claims, so revocation there can lag until token refresh/expiry. Firestore has the stronger live-member check. Photo metadata failures can leave orphaned Storage objects; cleanup/offline upload queues remain work.
- On the Mac, install from the mobile lockfile, apply Expo native config/plugins through the project's existing prebuild workflow, and build/sign with Xcode. Validate verification, company switching, photo permissions, camera/library upload, loss of connectivity, and notification delivery on devices before distributing a native build.

## Remaining prioritized work

1. Complete acceptance of Acme's six pending staff invitations and verify the intended accounts' refreshed claims and access. The five technician roles are approved, their invitations were issued, and the existing manager invitation was preserved; see the November 13 reconciliation above.
2. Complete staff TOTP MFA enrollment/recovery and native compatibility. Existing MFA-related web code is not sufficient to claim the roadmap's full MFA/backup-code requirement is complete.
3. Implement RL-owned Stripe payment intents/webhooks and reconciliation, then QuickBooks OAuth/sync. Existing MF endpoints/credentials were not reused as the RL implementation.
4. Complete native push delivery, photo retry/orphan cleanup, background offline queues, and conflict resolution across all editable records.
5. Build directory/provider search, route optimization and technician location workflows, with explicit tenant and visibility rules.
6. Finish invoice template customization/PDF email attachments, full-text search, bulk job operations, custom reporting, and support intake.
7. Address remaining dependency majors, TypeScript migration, shared Firebase Storage revocation, large calendar payload, and outstanding hook warnings.
8. Add operational retention/backup recovery drills, alerting, API/webhooks, advanced analytics, voice/barcode/offline-map features, and any requested single-session policy.

MF's default-codebase functions are still deployed. Their Admin SDK operations are outside Firestore client rules; retiring those endpoints and schedulers is a separate migration step after remaining MF dependencies have been replaced. This run does not establish that every legacy endpoint meets RL's new authorization guarantees.

Assumptions: preserve existing app identifiers and backend; retain separate MF and RL function codebases; keep original migration fields; do not infer staff privileges from MF role names; use UTC for new daily schedulers and existing local-date strings for visits; retain current USD invoice behavior. None of the historical roadmap dates represent a new delivery commitment.
