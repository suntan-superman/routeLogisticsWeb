# Commercial readiness — November 13, 2026

This release extends the existing production application in Firebase project `mi-factotum-field-service`. It preserves the existing main branch, Expo project, company memberships, customer data, legacy estimates and pest-control chemical application records. No mi Factotum functions or credentials are adopted or redeployed.

## Delivery and approval gates

The server configuration in `functions/.env.mi-factotum-field-service` must retain:

```ini
RL_STRIPE_ENABLED=true
RL_STRIPE_MODE=test
RL_STRIPE_LIVE_APPROVED=false
RL_QB_ENABLED=false
RL_QB_ENV=sandbox
RL_QB_WRITES_ENABLED=false
RL_QB_PRODUCTION_APPROVED=false
RL_NATIVE_PUSH_ENABLED=false
RL_EXPO_ACCESS_TOKEN_ENABLED=false
RL_SMS_ENABLED=false
RL_SMS_LIVE_APPROVED=false
RL_SMS_SECRETS_CONFIGURED=false
RL_SERVICE_FORMS_ENABLED=true
RL_ESTIMATES_ENABLED=true
RL_ESTIMATE_EMAIL_ENABLED=true
```

Existing SendGrid email delivery and the existing Stripe test configuration remain intact. Estimate email requires the explicit Send action and confirmation; creating or revising an estimate does not send it. Before enabling this path, the production queue was checked and contained no pending estimate messages. All new provider tests use stubs or emulators. No actual charges, refunds, SMS or estimate emails are part of release validation.

## Native push

The app uses Expo Notifications with native APNs/FCM delivery, independent of the existing web FCM implementation. Device registration is scoped to the signed-in user, active company membership and installation. Assignment/schedule/status events create deduplicated work notifications; worker delivery and notification taps recheck current membership and job access. Preferences are managed in mobile Settings. Background and terminated-app taps wait for an authorized workspace; an unsaved work dialog is not replaced.

Identifiers remain:

| Setting | Value |
| --- | --- |
| Expo owner | `sjroy5` |
| EAS project | `a6b5d885-dd99-4435-bef0-b7ffe09a2890` |
| iOS bundle | `com.worksidesoftware.routelogisticsapp` |
| Apple team | `AXCZ2G99P6` |
| Android package | `com.workside.routelogistics` |
| Firebase Android app | `1:1030013411579:android:5a32749da69638635c505e` |

The new Android registration is within the existing Firebase project. Its `google-services.json` is public client configuration, not an Admin/service-account credential. The iOS Firebase JS SDK continues to use the existing validated public web registration; Expo APNs delivery does not require adding an unrelated native Firebase iOS SDK.

Before enabling `RL_NATIVE_PUSH_ENABLED`, use `npx eas-cli credentials --platform ios` to configure APNs under the corporate team and `npx eas-cli credentials --platform android` to configure FCM v1 for this Firebase project. Keep the private FCM service-account JSON in EAS credential storage, never the app/repository. If Expo enhanced push security is enabled, create `RL_EXPO_ACCESS_TOKEN` in Secret Manager and set `RL_EXPO_ACCESS_TOKEN_ENABLED=true` before redeploying the worker. No token values belong in application environment variables.

Rebuild native binaries after installing dependencies. Push, camera, background location and share-sheet behavior need physical devices; bundle exports cannot verify delivery.

## Customer SMS

Owner settings under Company integrations prepare company templates, purpose selection, reminder timing and time zone. Customer Details records separate explicit consent with disclosure, timestamp, source and purpose scope. Existing customer rows are not silently enrolled. STOP suppression is rechecked immediately before delivery; START can restore only previously consented purposes and fails closed for ambiguous shared numbers. HELP and opt-out acknowledgments use Twilio Advanced Opt-Out without a duplicate application reply.

Configure these Firebase Secret Manager secrets, grant the deployed runtime accessor permission, then set `RL_SMS_SECRETS_CONFIGURED=true` and redeploy RL:

- `RL_TWILIO_ACCOUNT_SID`
- `RL_TWILIO_AUTH_TOKEN`
- `RL_TWILIO_MESSAGING_SERVICE_SID`

Configure the approved Route Logistics Messaging Service callbacks:

| Callback | Exact URL |
| --- | --- |
| Incoming message, POST | `https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlSmsInbound` |
| Delivery status, POST | `https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlSmsStatus` |

The worker appends its outbox `id` query parameter to status URLs. Both callbacks validate Twilio signatures against the exact configured URL and account/service. Enable Advanced Opt-Out and complete applicable sender/campaign registration before approving delivery. An existing Merxus sender/campaign is not assumed suitable. No reusable MF Twilio implementation or existing sender authorization was established in this run.

Operator approval is separate from owner UI settings: the private `rlSmsSenderApprovals/{companyId}` record must identify an approved Messaging Service (`status: approved`, `messagingServiceSid`), and automation additionally requires `automationApproved: true`. Global `RL_SMS_ENABLED` and `RL_SMS_LIVE_APPROVED` stay false until explicit approval. An ambiguous provider response is retained for signed callback/operator review rather than blindly resending a potentially accepted message. There is no bulk-send UI.

## Stripe and accounting

The web Payment Element supports explicit matching test/live environments. Netlify remains configured with `VITE_STRIPE_MODE=test`, `VITE_STRIPE_LIVE_APPROVED=false` and the existing matching `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_…`. Neither this release nor saving settings activates live collection. Backend secret names remain `RL_STRIPE_SECRET_KEY` and `RL_STRIPE_WEBHOOK_SECRET`.

Stripe endpoint: `https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlStripeWebhook`.

Subscribe to `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.processing`, `payment_intent.canceled`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`. Server eligibility uses the stored invoice total, USD, tenant and payer authorization. Signed webhook reconciliation is idempotent and fetches current provider state; test events update test status without changing the actual invoice balance. Invoice Payment history displays settlement, failure, refund and dispute events. Company integrations reports payment review flags. Customer confirmation mail is queued only for an approved, reconciled live capture and rechecks invoice/customer ownership at delivery; test payments never generate that confirmation.

QuickBooks uses RL-owned OAuth sessions, private access/rotating refresh tokens, environment/company-specific mappings, reviewed export fingerprints, stable request IDs and conflict handling. Legacy MF mapping IDs require explicit owner review; credentials are never adopted automatically. Company integrations displays connection health, refresh expiry, operations and webhook errors. Owner-controlled settings and disconnect/reconnect preserve external records. Sandbox reconciliation affects only `qbTestPaymentStatus`. Production OAuth/sync/reconciliation additionally require `RL_QB_PRODUCTION_APPROVED=true`, which remains false.

QuickBooks requires `RL_QB_CLIENT_ID`, `RL_QB_CLIENT_SECRET`, and `RL_QB_WEBHOOK_VERIFIER` in Secret Manager. Register `https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlQuickBooksOAuthCallback` as redirect and `https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlQuickBooksWebhook` as webhook. Validate a sandbox company, account/item defaults and reviewed mappings before any production approval.

The MF reference documents supplied in `docs/QuickBooks` describe a different integration. Do not copy their `handleQuickBooksOAuthCallback`, `QUICKBOOKS_*` secret names or client-writable OAuth/connection rules into RL. RL uses confidential server OAuth with single-use hashed state and private server-only token records protected by Google encryption at rest; it does not claim the MF plan's application-level token encryption or PKCE. Exports are explicitly reviewed, not an automatic two-way customer/item or outbound Stripe-payment sync. Service/item mappings use RL `estimateTemplates` and require explicit review of legacy company services. Taxed invoice export remains blocked until a deliberate QuickBooks tax mapping is implemented and validated; invalid or non-finite totals are rejected before export.

## Service reports and estimates

Managers explicitly attach versioned company/built-in checklists to jobs. Starter templates cover pest and pool service, with HVAC, lawn, gutter, window, house-cleaning and security-inspection foundations. Text, notes, dropdowns, checklists, photos and numeric readings with units support required values and bounded validation. Drafts may be partial; final reports are immutable, retain their template version/service date/revision, and validate each photo against the authorized job. Templates do not automatically replace chemical application logs or silently change legacy job-completion requirements. Mobile drafts use the existing durable offline queue and conflict review.

Photo estimates are available only to roles with `estimates.manage`. New records use server-calculated totals, immutable versions, private JPEG photos/PDFs and an expiring version-bound approval token. Legacy estimates remain read-only in the new flow. Direct client writes cannot forge managed totals or approval. Approved versions convert idempotently to scheduled jobs, with explicit customer creation/reuse for prospects. Email delivery uses existing SendGrid through an explicit confirmed action and rechecks the version, recipient and sender at dispatch. Delivery history distinguishes queued/failed/SMTP-accepted states; SMTP acceptance is not proof of inbox arrival. An online connection is required for estimate server operations; existing job/photo offline queues remain unchanged. Actual customer review, inbox arrival and device capture/share remain acceptance tests.

## Windows PowerShell rebuild

Run from the existing main checkout after pulling this release:

```powershell
Set-Location C:\Users\sjroy\Source\routeLogistics
git pull --ff-only origin main
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
Set-Location routeLogisticsMobile
npm ci
npx expo-doctor
eas build --platform ios --auto-submit
# Android, after configuring its FCM v1 credential:
npx eas-cli build --platform android --profile production
```

Normal EAS Git discovery includes the parent repository and shared helpers; no root/no-VCS environment overrides are required. If an older checkout still contains a nested mobile `.git`, use the one-time preservation/cleanup instructions in [corporate signing](ios-corporate-signing.md). Choose Workside Software LLC / `AXCZ2G99P6` during first-time Apple authentication if prompted. For a Mac local Xcode build, pull main, run `npm ci` in `routeLogisticsMobile`, run `npm run ios:prepare`, open the generated `.xcworkspace`, select Workside Software LLC and the approved bundle ID, and build/archive. Do not restore an old generated native project or old signing profile. A different iOS bundle ID is a separate app container; existing offline files/preferences are not automatically migrated.

## Validation and release evidence

Release counts, production verification and outstanding device checks are recorded in the accompanying migration-progress entry. Provider credential setup and signed-build/device delivery remain operational acceptance steps, not proof of an enabled commercial integration.

Implementation references: [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), [FCM v1 credentials](https://docs.expo.dev/push-notifications/fcm-credentials/), [Twilio signature validation](https://www.twilio.com/docs/usage/security), [Twilio Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out), [Stripe webhook handling](https://docs.stripe.com/webhooks), [Intuit request IDs](https://static.developer.intuit.com/output_html/qbo/docs/learn/learn-basic-field-definitions.html).
