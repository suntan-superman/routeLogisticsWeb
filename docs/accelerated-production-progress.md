# Accelerated production implementation — November 12, 2026

This report covers the ten-phase directive supplied after the original migration batches. Work remains on `main` in the existing shared Firebase project. It supersedes the older reports' statements that Stripe, QuickBooks, routing, work location and persistent native offline queues have no RL implementation. External-service acceptance and physical-device acceptance remain separate from completed code.

## Phase results

| Phase | Implemented and validated | Remaining acceptance/configuration |
|---|---|---|
| 1. Company identity | Authorized company name/logo in responsive web/native headers; session-generation guards and scoped cache reset; existing sidebar preserved | Signed-in visual checks on desktop and physical phones |
| 2. Membership lifecycle | Atomic normalized company/email identity; reissue retains canonical ID, rotates secrets and archives duplicate pending rows with originals/audit; accepted roles protected; confirmed soft removal and accurate counts/status | Five ambiguous Acme role assignments require owner choices |
| 3. Legacy customers | Valid name/phone/address variants; ISO/Timestamp/known legacy dates; neutral missing values; stable ID pagination, export and statistics | Two records lack a usable source name; no name invented |
| 4. Email/portal | SMTP verification script, OTP/invitation/reminder infrastructure, stale invitation cancellation and consent gates | Private SMTP configuration, verified sender, controlled inbox receipt and runtime custom-token signing verification; delivery disabled |
| 5. Stripe | Server amounts/ownership, durable intent identity, invoice locks, signed and idempotent callbacks, refund/dispute audit, test Elements UI and cancellation | Test secret key/webhook secret and provider acceptance. No charge/refund executed; test success cannot settle production invoices |
| 6. QuickBooks | RL OAuth single-use owner state, server-only rotating tokens/refresh lease, company/environment mappings, explicit legacy adoption, Customer/Service Item/Invoice previews and guarded export, request IDs/retries, SyncToken conflict checks, signed webhook queue, payment reconciliation and disconnect | RL credentials/verifier, owner connection and provider acceptance. External writes disabled; taxed invoice mappings and arbitrary bidirectional merges deferred |
| 7. Daily routing | Authorized daily jobs, valid locations, current Google Routes JavaScript API, explicit calculation, time/distance, intermediate-stop optimization, appointment warnings, manual reorder, revision-checked save and navigation for all selected stops | Maps API enablement/restrictions and live route acceptance; no paid route request used for testing |
| 8. Work location | Explicit foreground consent, active assigned-job check, stop/background/logout cleanup, manager-only latest position/accuracy/staleness, owner retention 1–168 hours, hourly cleanup | Physical iOS/Android permissions, connectivity, lifecycle and battery checks; no background tracking |
| 9. Native offline | Persistent account/company/role caches; job notes/status/completion and compressed photo queues; stable IDs/files, retry/backoff/restart recovery, conflict review/retry/discard, foreground reconnect processing | Airplane-mode/relaunch/account-switch testing on phones; background execution, offline maps and all-record editing deferred |
| 10. Release | Expanded tests, additive indexes, scoped Firebase deployment, existing GitHub/Netlify workflow and recovery notes | Publication verification recorded below; signed native builds remain on the Mac |

## Live data review

Acme still has **507 customers**, verified read-only across six pages. All existing creation dates parse correctly; two records have no usable name. No customer fields were rewritten. The earlier migration's 507 originals remain under `rlMigrationRuns/DmMODGpey4aFsQMuTg1C/originals`.

The current membership inventory has two distinct pending email identities and **zero duplicate groups**. The dedicated reconciliation dry run revisits all six original candidates and identifies five ambiguous roles. One pending membership already has an explicit RL manager role. No migration apply, additional invitation delivery or inferred administrator grant was performed. Private reports are ignored under `.migration/`.

`scripts/reconcile-mf-memberships.js` supports dry runs, duplicate-only archival with backups and owner-approved role input. Accepted active records are preserved; multiple active duplicates require review. Invitation apply requires a reviewed role file and approving owner UID.

## Validation and deployment

- **102 checks passed:** 16 Functions/unit queue, 20 web utility/service, 62 Firestore/Storage/workflow/payment/accounting/fieldwork emulator, and 4 Auth/Firestore/Functions end-to-end checks.
- Coverage includes concurrent invite reissue, removed-member Storage denial with stale claims, invoice locks, payment authorization/callback replay, OAuth replay/token rotation, uncertain accounting response retries, sandbox settlement isolation, route revisions, location expiry and conflicting/idempotent offline operations.
- Web lint has no errors; existing hook warnings remain. The production build passes. Existing large Calendar/Firebase bundles remain a performance limitation.
- Expo SDK 54 dependency compatibility and both iOS/Android production JavaScript/Hermes exports pass. This does not certify a signed native binary or physical-device behavior.
- Undefined-identifier, duplicate-key and unreachable-code checks pass across Functions, native JavaScript and scripts.
- No production charge/refund, external accounting write, customer deletion, role promotion or customer data mutation was used for testing.
- Scoped deployment of all **51 RL functions** succeeded and all are verified `ACTIVE`. All 80 project functions remain present, including every pre-existing MF function. Firestore/Storage rules and 38 repository indexes deployed; all 34 external legacy indexes were retained. Four additive indexes are still building; readiness and web publication verification will be recorded below.
- New route, location, offline-operation and accounting status callables reject unauthenticated live requests with HTTP 401. Deployed provider flags are verified disabled.
- Dependency audit counts remain unchanged: root 14 moderate; Functions 8 moderate; web 2 moderate; mobile 1 high, 11 moderate, 1 low. No critical findings. The existing mobile high advisory is Metro’s transitive build-time `image-size`; no forced incompatible upgrade was applied.

## Configuration still needed

The user selected option 2 (“already configured”) for Netlify `VITE_GOOGLE_MAPS_API_KEY` and test `VITE_STRIPE_PUBLISHABLE_KEY`. These are browser build inputs and require a new Netlify build. Optional `VITE_GOOGLE_MAPS_MAP_ID` supplies a production map style. Restrict the Maps key to intended browser origins and enable Maps JavaScript/Routes APIs.

`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` currently appears in the web `.env`. Native GPS and external navigation do not use an embedded Maps SDK in this release, so no unused key is copied into the native bundle.

Secret Manager inventory access returned **403**. No secret values were accessed or copied. Public keys do not replace server credentials. The deployed configuration keeps:

```dotenv
RL_EMAIL_ENABLED=false
RL_STRIPE_ENABLED=false
RL_STRIPE_MODE=test
RL_STRIPE_LIVE_APPROVED=false
RL_QB_ENABLED=false
RL_QB_ENV=sandbox
RL_QB_WRITES_ENABLED=false
```

| Service | Secret Manager values | Required verification |
|---|---|---|
| Email | `RL_SMTP_URL` | Verified `RL_EMAIL_FROM`, `RL_APP_URL=https://route-logistics.com`, SMTP TLS/authentication, controlled inbox receipt and sender authentication, portal custom-token signing IAM |
| Stripe | Test `RL_STRIPE_SECRET_KEY`, `RL_STRIPE_WEBHOOK_SECRET` | Matching `pk_test_` account, signed test callbacks, authorized invoice test; keep live approval false |
| QuickBooks | `RL_QB_CLIENT_ID`, `RL_QB_CLIENT_SECRET`, `RL_QB_WEBHOOK_VERIFIER` | Sandbox OAuth connection as owner, reviewed mappings/defaults and preview; keep external writes disabled until explicitly authorized |

Endpoints:

- Stripe webhook: `https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlStripeWebhook`.
- QuickBooks OAuth redirect: `https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlQuickBooksOAuthCallback` (the configured redirect must match exactly).
- QuickBooks webhook: `https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlQuickBooksWebhook`.

Enable flags select secret bindings at deployment time; changing them requires redeployment. Server secrets never belong in public `VITE_*`/`EXPO_PUBLIC_*` variables, Git or chat. MF OAuth credentials/tokens were not reused.

Supply SMTP credentials privately in the process environment and run `node scripts/verify-email.js` to verify authentication/TLS without sending. Add `--send-to CONTROLLED_ADDRESS` to send one verification email, then confirm inbox receipt before enabling general delivery. SMTP is at-least-once: leases and stable Message-ID reduce but cannot eliminate duplicates after uncertain acceptance.

QuickBooks uses authoritative mapped invoice balances to reconcile Invoice/Payment changes. Sandbox updates only test status. Production reconciliation checks tenant/currency/amount/state/payment lock before recording a paid balance; partial balances, reversals and mismatches need review. Customer/Item webhook changes are marked for review. Exports compare SyncToken; a lost response reuses the original payload/request ID instead of generating a second write. Tax mapping, changing accounting realms and older uncertain exports require reviewed follow-up work.

## Mac and phone acceptance

Install the mobile lockfile, apply the existing Expo prebuild workflow without deleting manual native changes, and use the existing Xcode signing identity and application IDs.

1. Verify owner/technician sign-in, company name/logo and cache isolation after sign-out/account change.
2. Open assigned jobs online, enable airplane mode, save notes/completion/photos, close/reopen and confirm pending work remains.
3. Reconnect with the app open. Verify exactly one job operation/photo and visible success. Edit the same job on web before reconnecting and exercise conflict review/retry/discard.
4. Reassign or revoke a technician before sync; confirm rejected work remains visible and never moves into another tenant.
5. Deny/allow foreground location permission; start sharing on an active job; background/return/stop/sign out; verify manager timestamps, stale status, expiry and battery behavior.
6. Test camera/library permissions, persistent local photos and upload retry. Uninstalling or clearing app data can remove unsynced work. Pending work is retained for the same account on sign-out to avoid loss.

Location reads hide expired records immediately; physical cleanup runs hourly and can lag during infrastructure failure. Removal now blocks new Storage requests immediately, but previously issued download URLs remain bearer links until their tokens are revoked. Existing MF Admin SDK functions remain outside RL client-rule enforcement and have not been retired.

## Recovery and deferred roadmap

Disable integration flags and redeploy only the RL codebase to stop provider traffic. Users can stop location sharing and server sessions expire. Roll back compatible frontend/functions/rules together. Preserve operation, payment/accounting audit and idempotency records and pending mobile work; deleting them can cause replay or data loss. Membership originals are stored in server-only audit/migration collections. Review later edits before restoring originals.

Remaining broader work includes full MFA/recovery, native push acceptance, background/offline-map support, full directory/search, invoice/PDF customization, bulk jobs, advanced reporting, major dependency upgrades, monitoring/alerts and backup restore drills. Historical roadmap dates are not new commitments.

Primary references: [Google Routes JavaScript](https://developers.google.com/maps/documentation/javascript/routes/get-a-route), [Stripe PaymentIntents](https://docs.stripe.com/payments/payment-intents), [Stripe webhooks](https://docs.stripe.com/webhooks), [Intuit OAuth](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0), [Intuit request IDs](https://static.developer.intuit.com/output_html/qbo/docs/learn/learn-basic-field-definitions.html).
