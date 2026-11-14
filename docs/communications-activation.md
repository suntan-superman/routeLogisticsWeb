# SMS and native push activation

November 14, 2026. Existing `main`, Firebase project `mi-factotum-field-service`. iOS status-push delivery passed; SMS provider acceptance is blocked by sender readiness.

## Deployed changes

Only three RL functions were updated: `rlNativePush`, `rlDeliverNativePush`, and `rlSmsInbound`. Native registration and delivery now use `RL_NATIVE_PUSH_ENABLED=true`. No web asset, QuickBooks function, Merxus service or native app build was deployed.

All customer-SMS flags remain false:

```ini
RL_SMS_ENABLED=false
RL_SMS_LIVE_APPROVED=false
RL_SMS_SECRETS_CONFIGURED=false
```

The inbound consent fix prevents STOP/START from restoring an independently revoked consent. Existing owner controls, tenant checks, five service-message purposes, disclosure/source/timestamps, opt-out suppression, rate limits, scheduled deduplication and signed status handling remain in place. See [SMS setup and provider findings](customer-sms-setup.md).

## SMS findings and actual delivery status

Existing Merxus secret bindings successfully authenticated read-only Workside Twilio account/service lookups. Credentials were held only in operator memory; none was printed, committed, copied into RL client code, or permanently granted to RL. No Merxus messages or customer data were queried, and no provider configuration was changed.

The legacy SMS account has no Messaging Service. The primary **Customer Care A2P Messaging Service** campaign is `FAILED`; **Merxus-AI-SMS** has no sender attached. Existing registration has not established coverage for RL/Acme service messages. No approved RL service, sender or credential boundary exists yet.

The operator authorized one test recipient, but no SMS was attempted while registration was unverified. Therefore Twilio message acceptance, carrier delivery, genuine status callbacks and recipient receipt are **not certified**. No bulk, scheduled, invitation or other customer messaging was enabled, and no SMS consent was silently assigned to existing customers. The production SMS collections and outbox remain empty.

Required provider work: an isolated RL credential scope within the existing Workside infrastructure, an approved sender and Messaging Service covering the actual business/use case, Advanced Opt-Out and RL callbacks, then the three existing `RL_TWILIO_*` secrets with runtime access and a reviewed tenant sender approval. No new Firebase project or SMS architecture is needed. Existing shared account Auth Tokens cannot provide cross-application credential isolation.

## iOS native push result

- Existing submitted TestFlight build **1.0.0 (2)** has bundle `com.worksidesoftware.routelogisticsapp`, corporate team `AXCZ2G99P6`, owner `sjroy5`, and EAS project `a6b5d885-dd99-4435-bef0-b7ffe09a2890`.
- The IPA was inspected in memory: Expo Notifications, compiled RL push registration/navigation, the production APNs entitlement, and the corporate provisioning profile are present. No private key, provisioning payload or download credential was stored in this report.
- The corporate APNs key is associated with this app. Expo enhanced push security is disabled at both account and app level; `RL_EXPO_ACCESS_TOKEN` is not required and its binding flag remains false.
- The operator enabled notifications on the physical iPhone as `tech3@route-logistics.com`. Production registration is active, unexpired, iOS-specific, and bound to the current Acme technician UID, membership, role and EAS project. No device token was printed or read by the operator tools.
- Exactly one status notification, **Important job update**, was queued for that device using an existing assigned completed work order. The deployed worker submitted it once. Expo accepted it, a read-only receipt lookup returned `ok` from APNs, and the operator confirmed seeing it on the iPhone.
- No job was created, reassigned or edited. The active job queue was expected to remain unchanged. Actual new-assignment and schedule-change triggers were covered by automated tests, not by changing production jobs during this delivery test.
- Tap navigation **passed on the physical iPhone** in a separately authorized follow-up test. The operator requested one additional push after the initial notification was no longer available. A new scoped delivery was submitted once, and the operator confirmed that tapping it opened the existing assigned work order. Two explicitly authorized status pushes were sent in total; no job was created or reassigned. The physical test's foreground/background app state was not identified, so both states are not independently certified by this result.

Both delivery rows retain their normal receipt-check schedules. The initial activation snapshot showed the first delivery as `receipt` with one attempt and no error; a separate read-only lookup confirmed its APNs receipt. The follow-up tap-test delivery also had one accepted submission and no error. Automatic approval review rejected an optional attempt to advance the initial receipt check over duplicate-send risk; that record was left unchanged and read-only verification used instead. The later, additional push was explicitly requested by the operator and used a new delivery record.

No new TestFlight build is required for this activation. Silent/headless background work is outside this visible-alert test and was not enabled.

## Android readiness

The Android package remains `com.workside.routelogistics`, with its existing public Firebase client registration. EAS has no Android FCM v1 service credential configured. Configure the existing project's FCM v1 credential through EAS **Android → production → Google Service Account → Push Notifications (FCM V1)**. Keep service credentials out of the app and Git. See [Expo FCM credentials](https://docs.expo.dev/push-notifications/fcm-credentials/). Android provider/device delivery was not tested.

## Validation and preservation

- Functions: 65 passed; the one push emulator test skipped in the unit-only invocation was run separately with its emulator.
- SMS and native-push Firestore integration: 11 passed, no skips.
- Mobile: 168 passed, including 13 native-push tests. Two stale test-fixture imports were mocked; no mobile application behavior changed.
- SMS/settings web tests: 8 passed.
- Existing operator/sandbox safety tests in the Functions command: 21 passed.

Read-only initial activation metadata confirmed native registration/delivery enabled, SMS still disabled, one active iOS registration, one push delivery, and zero SMS outbox records. The separately authorized tap test added only one further push-delivery record. All Acme customer, job and membership document versions matched the preflight snapshot: 508 customers including the existing certification fixture, six jobs and six memberships. The original 507 customers remain intact. No accounting integration, Auth account, Firebase project, Merxus configuration or sender was altered.

Sanitized operational evidence is retained in ignored `.migration/communications-final.json`, `.migration/communications-push-test.json`, `.migration/merxus-twilio-sender-readiness.json` and the native-push build/config audits. Provider credentials, private keys, phone values and device tokens are excluded.

Remaining actions are provider sender/credential setup for the single SMS test and Android FCM v1 setup. The iOS visible-push delivery and notification-tap acceptance checks are complete. No current iOS rebuild or broad SMS automation is required.
