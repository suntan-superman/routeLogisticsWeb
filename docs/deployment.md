# RouteLogistics deployment

Updated November 12, 2026. Use the existing main branch, Netlify/GitHub web deployment, Firebase project, and Mac/Xcode mobile workflow. No staging environment or additional branch is required. See [migration progress](migration-progress.md) for the actual deployment record and unfinished work.

## Validate the source

Use Node 22 and Java 21. From the repository root:

```powershell
npm ci
npm --prefix functions ci
npm test
npm run test:e2e
```

In `routeLogisticsWeb`, run `npm ci --legacy-peer-deps`, `npm run lint`, and `npm run build`. In `routeLogisticsMobile`, run `npm ci`, `npx expo install --check`, and `npx expo export --platform ios --platform android --max-workers 2`.

The emulator script creates ignored local configuration when absent. It uses the demo project, not production. Do not commit `.env.*`, `.secret.local`, migration reports, or deployment logs. `.env.example` files contain only placeholders.

## Firebase backend

The shared project is `mi-factotum-field-service`. MF uses the default function codebase; RL uses `routelogistics`. Always scope function deployment to RL:

```powershell
npx firebase deploy --only functions:routelogistics --project mi-factotum-field-service --non-interactive
npx firebase deploy --only firestore:rules,firestore:indexes,storage --project mi-factotum-field-service --non-interactive
```

Do not use an unscoped `--only functions` or force removal of legacy indexes. Rules are shared project-wide; the rules in this repository implement RL tenancy. Existing staff sessions should sign in/refresh claims after deployment to obtain the new `membershipId` claim. Wait for required composite indexes to become ready before considering query-dependent workflows verified.

Configure non-secret values in ignored `functions/.env.mi-factotum-field-service`:

```dotenv
RL_APP_URL=https://route-logistics.com
RL_EMAIL_FROM=
RL_EMAIL_ENABLED=false
```

The origin above was verified against Firebase's authorized domains and the live RouteLogistics site. The obsolete `.app` homepage did not resolve and was corrected. Copied invitation links use the owner's current browser origin. Email is intentionally disabled; OTP portal sign-in and invoice emails return an unavailable message. Firebase Auth verification emails use Firebase's separate configuration.

To enable SMTP later, configure `RL_SMTP_URL` in Firebase Secret Manager, use a verified sender for `RL_EMAIL_FROM`, set `RL_EMAIL_ENABLED=true`, and redeploy the RL codebase. The worker binds the secret only for enabled deployments. Use an authenticated TLS-capable SMTP connection URL and keep credentials out of source control/chat. Verify delivery with a controlled recipient and check portal custom-token signing permissions before enabling customer use. The runtime identity may need permission to sign tokens through IAM.

The new server-owned collections are `rlInviteSecrets`, `rlMail`, `rlRateLimits`, `rlPortalChallenges`, `rlNotifications`, `rlOwnershipAudit`, and `rlMigrationRuns`. Clients cannot read secrets/outbox/challenges/audits; notification access is restricted to the recipient. TTL cleanup policies are not automatically provisioned by this deployment; see the retention notes in the progress report.

## Web publication

`netlify.toml` preserves the existing build configuration: Node 22, base directory `routeLogisticsWeb`, `npm run build`, output `dist`, and SPA redirects. Pushing the existing branch to GitHub triggers the user's configured web deployment. Deploy compatible backend/rules/index changes before publishing a frontend that calls them.

Keep the existing `VITE_FIREBASE_*` values in the hosting environment. Sentry and Firebase Performance are optional; `VITE_FIREBASE_PERFORMANCE_ENABLED=true` opts into Performance collection. Verify sign-in, invitation routing, customer list/import, jobs, photos, and public privacy/portal routes on the published build. Build success alone does not establish a successful hosting deployment.

## Mobile on the Mac

The accelerated release additionally uses Expo Location (foreground only), FileSystem/Crypto and NetInfo for explicit work sharing and durable offline queues. Follow the [configuration and device acceptance checklist](accelerated-production-progress.md) before enabling provider integrations or distributing native builds. Public Maps and test Stripe keys belong in Netlify; backend SMTP/Stripe/QuickBooks secrets belong in Firebase Secret Manager. The release keeps those provider switches disabled pending verification.

Use `com.worksidesoftware.routelogisticsapp` and corporate Team `AXCZ2G99P6` for iOS; Android remains `com.workside.routelogistics`. Preserve the existing Expo project. Follow the [corporate signing and TestFlight guide](ios-corporate-signing.md), including its separate-app/local-data precautions. Install from `routeLogisticsMobile/package-lock.json`.

If native folders are generated through Expo, apply the current config with the existing prebuild workflow before opening the generated iOS workspace in Xcode. Do not use `--clean` on a native project with uncommitted manual changes. Select the existing signing team, build, and run on a device; manage App Store submission through the existing workflow.

Validate real email verification, company claims, role restrictions, camera/library permissions, compressed uploads, airplane-mode behavior, and notification delivery. Both platform JavaScript bundles are checked in CI, but this run does not produce a signed native binary. Expo SDK major upgrades and remaining mobile dependency findings are tracked in the progress report.

## Stripe test configuration (2026-11-13)

Use the existing Workside Software Stripe account in **test mode**. The web app uses
React Stripe.js **Elements with the Payment Element** and only accepts `pk_test_`
keys. It does not use Stripe Checkout. No additional Firebase project, staging
site, Stripe account, or Git branch is needed.

Create an account webhook with **Snapshot** payloads, API version
`2026-10-28.endive`, at this existing deployed endpoint:

```text
https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlStripeWebhook
```

Choose **Your account** and exactly these event types:

```text
payment_intent.succeeded
payment_intent.payment_failed
payment_intent.processing
payment_intent.canceled
charge.refunded
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
```

Create a dedicated test restricted key with **Payment Intents: Write**,
**Charges and Refunds: Read**, and **Payment Disputes: Read**. Leave all other
resource and Connect permissions at **None**. These permissions follow the
backend's create/retrieve/cancel PaymentIntent, retrieve Charge, and retrieve
Dispute calls; webhook signature verification is local and requires no Events
or Webhook Endpoints API permission. See Stripe's
[restricted-key permissions](https://docs.stripe.com/keys/restricted-api-keys)
and [webhook configuration](https://docs.stripe.com/webhooks).

Configure these values privately, all from the same Workside Software test account:

| Location | Name | Value to supply |
| --- | --- | --- |
| Secret Manager, `mi-factotum-field-service` | `RL_STRIPE_SECRET_KEY` | Restricted test key beginning `rk_test_` |
| Secret Manager, `mi-factotum-field-service` | `RL_STRIPE_WEBHOOK_SECRET` | `whsec_` signing secret for the deployed test webhook above |
| Netlify production build environment | `VITE_STRIPE_PUBLISHABLE_KEY` | Matching `pk_test_` publishable key |

The deployed frontend's test publishable key successfully retrieved and confirmed
the backend-created test PaymentIntent, verifying account and test-environment
compatibility. Never put the private key or webhook
secret in a frontend variable, Git, logs, or chat. The deployed endpoint uses its
Dashboard signing secret, not a Stripe CLI forwarding secret.

Both secrets have enabled version 1, verified on 2026-11-13. On each Stripe secret, the runtime service account
`1030013411579-compute@developer.gserviceaccount.com` needs
`roles/secretmanager.secretAccessor` (verified for both), and the deployment identity needs metadata
access (`roles/secretmanager.viewer`).

After both secrets and their access are configured, apply only these non-secret
values to the existing ignored `functions/.env.mi-factotum-field-service` file,
preserving its email and other settings:

```dotenv
RL_STRIPE_ENABLED=true
RL_STRIPE_MODE=test
RL_STRIPE_LIVE_APPROVED=false
```

Deploy the prepared backend changes from `main`:

```powershell
npx firebase deploy --only functions:routelogistics --project mi-factotum-field-service --non-interactive
```

Rebuild the existing Netlify production site if the publishable key changes.
Test-mode activation completed on 2026-11-13: all 51 RL functions are active,
and all 29 non-RL functions retained their deployment timestamps. The deployed
flags are `true` / `test` / `false`, respectively. Create/cancel payment functions
bind `RL_STRIPE_SECRET_KEY`; the webhook binds that key and
`RL_STRIPE_WEBHOOK_SECRET`. The status callable does not need either secret.

Duplicate dotenv entries were removed. The API secret contained surrounding
whitespace; secret loading now trims it before enforcing strict test/live key
validation. All 19 function tests passed; the payment and Firestore-rule suite
previously passed all 49 checks. Stripe's API confirmed the exact enabled test
webhook URL, API version, and all eight subscriptions above.

One $1 USD simulated payment succeeded using `pm_card_visa` and the deployed
frontend key. The dedicated invoice `rl-stripe-test-1794588808085-f6da66ba89`
received a genuine signed Stripe callback: `testPaymentStatus=succeeded`,
`status=sent`, no `paidAt`, and its payment lock cleared. No real customer invoice
was modified. The isolated test identity was disabled and its refresh tokens
revoked; the test invoice and audit remain available for verification.

A tampered webhook body was rejected, and two signed replays of the accepted
event ID left the event count, payment record, and invoice unchanged. No live
charges were issued and no credential values were displayed or stored in source.
Keep `RL_STRIPE_LIVE_APPROVED=false`; live activation is a separate decision.

## Google Maps configuration (2026-11-13)

The existing architecture calculates routes in the **browser**. No RL Cloud
Function calls Google Maps, holds a backend routing key, or binds a Maps secret.
`rlGetRoutingTeam` and `rlGetDailyRoute` return authorized team/job data;
`rlSaveDailyRoute` stores the selected job order with tenant, assignment, date,
and revision checks. They do not return API-key values.

The web variable is `VITE_GOOGLE_MAPS_API_KEY`. `loadMaps()` loads
`maps.googleapis.com/maps/api/js`, then the `maps`, `marker`, and `routes`
libraries. Routes use `Route.computeRoutes()` with explicit calculation,
`TRAFFIC_UNAWARE`, optional waypoint optimization, a field mask, and a ten-minute
in-memory cache. The map/marker renderers also request Google map tiles and map
configuration. Navigation links use `https://www.google.com/maps/dir/` without
an API key. Team maps load only after the user selects the map action.

The native application uses Expo foreground location and RL callables. It does
not embed a Google Maps SDK or call Maps/Places/Geocoding web services.
`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is unused; its presence in the web dotenv file
does not configure a native Maps integration. `VITE_GOOGLE_MAPS_MAP_ID` is optional;
the existing renderer uses Google's `DEMO_MAP_ID` fallback.

The required APIs are **Maps JavaScript API** (`maps-backend.googleapis.com`) and
**Routes API** (`routes.googleapis.com`). **Places API (New)** and **Geocoding API**
are not required by current code: it has no autocomplete, Place lookup, or
Geocoder calls. Routes accepts coordinates and address strings itself. The
separate Route Optimization API, Geolocation API, and Navigation SDK are also
unused. Existing shared-project service enablement was preserved for MF.

The project `mi-factotum-field-service` has billing enabled and both required
APIs enabled, verified using the existing Firebase deployment identity. The
dedicated key **RouteLogistics-Browser** is
`projects/1030013411579/locations/global/keys/b63f3099-7dc6-4b88-807e-cbefccb943a0`.
Its allowed APIs were corrected to the two services above, with website restrictions:

```text
https://route-logistics.com/*
https://www.route-logistics.com/*
```

The Firebase-generated browser key and `VITE_FIREBASE_API_KEY` were preserved.
The previously published Maps key belongs to project `335825379717`; that key
and its project were not changed. The local ignored web `.env` now selects the
dedicated RL key. The operator updated Netlify's production build variable
`VITE_GOOGLE_MAPS_API_KEY` and rebuilt the existing site. A fresh inspection of
all 38 linked production JavaScript assets at **2026-11-13 17:30:37 UTC** confirmed
the dedicated RL Maps key is published and `VITE_FIREBASE_API_KEY` is unchanged.
This inspection made no Maps API requests. No backend deployment is required
for this key change. No further credentials, IAM grants, or API activation are
needed for the existing integration. Keep key values out of chat and source control.

Backend API/IP restrictions are not applicable to the present implementation.
If server routing is introduced later, use a separate server credential with a
Routes API restriction; browser referrer restrictions do not authenticate
Cloud Functions. The current functions have no VPC connector/static egress
configuration. IP restrictions require an explicitly configured static outbound
IP, for example VPC egress through Cloud NAT. Keep server keys out of all
`VITE_*` and `EXPO_PUBLIC_*` variables.

Validation: one map load and one optimized route request ran from the production
origin in a fresh headless browser using public city coordinates. The corrected
key returned intermediate order `[1, 0, 2]`, four legs, a polyline, and five
markers without a Maps authentication error. No customer locations were used.
All 41 fieldwork/security-rule checks, 20 web tests, and the production web build
passed. Tests cover
cross-tenant routes, forged role claims, manager-only location viewing, revoked
memberships, explicit sharing sessions, expired sessions, and completed jobs.
Direct client reads/writes of `rlRoutes` and `rlLocations` are denied.

Native sharing begins only after the user confirms sharing and grants OS
foreground-location permission; backgrounding, stopping, or leaving the view
stops the watcher. Server sessions expire after five minutes without a heartbeat,
and retention is company-controlled. No real technician location was collected
during verification. Physical-device permission dialogs were reviewed in source,
not exercised on an actual iOS/Android device.

References: [Routes JavaScript setup](https://developers.google.com/maps/documentation/javascript/routes/start),
[waypoint optimization](https://developers.google.com/maps/documentation/javascript/routes/optimize-stops),
[key restrictions](https://developers.google.com/maps/api-security-best-practices),
[static outbound IP](https://docs.cloud.google.com/run/docs/configuring/static-outbound-ip).

## Staff login options (2026-11-13)

Commit `9cd4eab` adds a password visibility toggle, password/email-code sign-in
choices, and an opt-in **Remember me** checkbox that stores only the normalized
email in local browser storage. Unchecking removes the saved email; passwords and
OTP codes are never saved by this setting. The existing password-reset flow and
invitation return path are preserved. The responsive production page and all three
controls were verified at **10:11 AM Pacific**.

Only `rlRequestStaffOTP`, `rlVerifyStaffOTP`, and `rlDeliverEmail` were deployed.
The two new callables use `RL_EMAIL_ENABLED=true` and the existing runtime identity;
only the worker binds `RL_SMTP_URL`. No new secrets or credentials were required.
Metadata comparison confirmed zero changes to MF functions or other RL functions.
The Netlify production build contains the new UI and unchanged Firebase/Maps keys.

Staff codes are six digits, expire in ten minutes, and allow at most five guesses.
Requests are limited per email and IP; verification is also IP-limited. Resending
invalidates previous challenges, and the mail worker cancels stale queued codes.
Challenges and resend state are inaccessible to clients under the existing rules.
Code redemption is transactional and single-use, including concurrent requests.

Only an existing, enabled, verified Firebase account without enrolled MFA can use
this option. Portal identities are excluded. Account status, email, MFA enrollment,
and token revocation time are checked again at redemption. The server signs a token
for the existing UID without adding role/company claims, creating an account,
verifying an email, or accepting an invitation. Normal session claim synchronization
and tenant authorization still apply. Unknown/ineligible accounts receive the same
request response and no code. Email-code sign-in is an alternative first factor;
accounts with MFA must use their existing authentication flow.

Validation passed: 55 workflow/security/OTP emulator checks, 22 web tests, two real
Auth-emulator token-exchange checks, changed-file lint, the production web build,
and isolated browser checks for eye controls, saved-email removal, recovery,
incorrect codes, and invitation return paths. Live endpoint checks used a
nonexistent test address and invalid code; no real OTP emails were sent by these
tests. The existing SMTP delivery implementation remains in use.

Private verification artifacts are under `.migration/login-options-*.json`.
The existing application checks expiry; physical Firestore retention/TTL policy
remains the operational item already documented for authentication/outbox records.

## Recovery and verification

Migration originals are recorded transactionally under the migration run listed in the progress report. Review later edits before restoring a document. Source rollback should deploy a compatible combination of frontend, functions, and rules; reverting only the web app may restore obsolete invitation behavior. No automated production data restore is included.

Check the Functions deployment exit status, all function states, scheduled-job states, index readiness, and the GitHub/hosting deployment result. Perform read-only or controlled-account smoke checks; do not use customer records as disposable test data.
