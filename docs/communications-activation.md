# SMS and native push activation

November 14, 2026. Existing `main`, Firebase project `mi-factotum-field-service`. iOS status-push delivery and tap navigation passed. Controlled RL SMS delivery and genuine provider STOP/START acceptance passed. The authorized test-customer-only pilot is active; broad customer automation remains disabled.

## Deployed changes

The initial activation updated three RL functions: `rlNativePush`, `rlDeliverNativePush`, and `rlSmsInbound`. Native registration and delivery use `RL_NATIVE_PUSH_ENABLED=true`. No QuickBooks function, Merxus service or native app build was changed. The subsequent direct-sender SMS configuration and its actual deployment result are recorded below. The latest readiness follow-up adds only RL SMS suppression/pilot handling and an independent Event Streams receiver; its provider acceptance is tracked separately from the completed outbound delivery test.

Customer-SMS outbound gates remain false:

```ini
RL_SMS_ENABLED=false
RL_SMS_LIVE_APPROVED=false
```

The callback-only secret configuration can be enabled independently of outbound delivery. The selected reuse path is `RL_TWILIO_SENDER_MODE=phone-number`, `RL_TWILIO_API_KEY_ENABLED=true`, and bound callback/sender secrets through `RL_SMS_SECRETS_CONFIGURED=true`. This does not activate scheduled customer messages.

The latest consent fix prevents START from restoring any stopped or independently revoked RL consent. Existing owner controls, tenant checks, five service-message purposes, disclosure/source/timestamps, opt-out suppression, rate limits, scheduled deduplication and signed status handling remain in place. See [SMS setup, provider findings and pilot controls](customer-sms-setup.md).

## SMS findings and actual delivery status

The first inspection checked account and Messaging Service metadata but did not trace successful SMS records or toll-free verification. Its sender-readiness conclusion was incomplete: the old rejected CUSTOMER_CARE 10DLC campaign is not the transport used by the proven direct toll-free paths.

Existing Merxus secret bindings authenticated read-only Twilio queries across the configured primary account and Workside Home Advisor subaccount. Actual recent outbound records were inspected without retaining message bodies or recipient numbers. The investigation sampled 100 records per account; counts are sample counts, not a complete historical census.

| Sender and account | Observed transport and delivery | Registered use case |
| --- | --- | --- |
| `+18889494776`, Workside Home Advisor | Direct `From`; Messaging Service SID is null. 84 carrier-delivered records in the sample, seven in the last seven days; latest November 11 Pacific | Toll-free `TWILIO_APPROVED`, Workside Software LLC; provider lead/service-request notifications |
| `+18882506769`, primary Workside account | Direct `From`; Messaging Service SID is null. 52 historic carrier-delivered records in the sample; latest August 25 Pacific | Toll-free `TWILIO_APPROVED`, Workside Software LLC; account notifications/customer care including service providers, appointment confirmations and service notifications |
| `+12134661363`, primary account | Direct `From`; five delivered records, including November 13 Pacific reply traffic | An approved associated Messaging Service was not established; not used for the RL test |

`delivered` above is final provider/carrier delivery status, not the initial API submission status. Merxus's normal and restaurant-verification flows can select different accounts/senders, and its implementation supports direct `From` delivery without a Messaging Service. The absence of a service therefore did not establish that SMS was unusable.

The approved primary toll-free sender `+18882506769` is selected for the one explicitly authorized RL test. Its registered summary includes service-provider appointment and service notifications; the legacy number's provider-lead scope is not assumed interchangeable. No account creation, number purchase, new Messaging Service or campaign submission is required for this controlled reuse.

RL is configured with its own message-create-only API key and Secret Manager entries `RL_TWILIO_ACCOUNT_SID`, `RL_TWILIO_FROM_NUMBER`, `RL_TWILIO_API_KEY_SID`, `RL_TWILIO_API_KEY_SECRET`, and callback-only `RL_TWILIO_AUTH_TOKEN`. All five have enabled version 1 and secret-scoped runtime Secret Accessor permission. No Messaging Service SID is required in direct-number mode. The account Auth Token retains account-wide authority, remains server-only, and is not described as credential-level account isolation. A new subaccount is not a prerequisite for this bounded test.

The shared sender's Merxus inbound URL remains unchanged. RL supplies a per-message delivery-status callback for its own private outbox record; Merxus credentials, sender configuration, voice routing and workflows are not retargeted. The initial one-message test established delivery; the subsequent independent Event Streams path and real STOP/START acceptance are described below. Broad customer automation remains disabled.

Current RL test status: **passed** on November 14, 2026 at 10:30 AM Pacific. One provider create used the restricted RL key and the existing template renderer/transport. Twilio's final status was `delivered`, with no error and no Messaging Service. Genuine signed `sent` and `delivered` callbacks updated the private operator certification outbox to `delivered` with the matching provider ID. The authorized recipient confirmed receipt. No customer/job fixture or permanent consent was created. Both global SMS gates remain false; automated delivery was not exercised or enabled.

The seven affected RL SMS functions deployed successfully and report `ACTIVE`: manual queue, inbound/status callbacks, scheduled queue/delivery, and job-created/job-updated producers. Runtime configuration confirms `RL_TWILIO_SENDER_MODE=phone-number`, restricted-key mode and configured secret bindings; `RL_SMS_ENABLED=false` and `RL_SMS_LIVE_APPROVED=false`. Callbacks bind Account SID, From number and signature Auth Token; delivery binds Account SID, From number and the send-only API key pair. Producers have no provider secrets. Merxus was not deployed or reconfigured.

## SMS automation readiness follow-up

Initial owner consent to the four service-message purposes was explicitly received on November 14, 2026: appointment confirmation, pre-visit reminder, technician en-route and service completed. Optional `service-follow-up` remains excluded. Dedicated test customer `rl-sms-pilot-20261114` was activated only after provider acceptance and fresh independent consent; the existing 508 customer records remain unchanged. Its purpose-specific consent is separate from the carrier suppression state. No consent from another customer, migration, Merxus preference or mere possession of a number is reused.

The independent receiver is `https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlSmsProviderEvents`, with a dedicated RL Event Streams sink/subscription for `com.twilio.messaging.inbound-message.received`, schema **8**. It validates Twilio's signature and raw JSON/body hash using existing callback secret bindings. It accepts only matching account/sender events for known RL recipients, stores no raw message body, deduplicates provider message IDs and orders by provider timestamps with STOP winning ties. Unrelated Merxus traffic is ignored; the existing Merxus number webhook is preserved. A signed sink test establishes reachability only, not actual handset opt-out acceptance.

STOP suppresses the shared-sender recipient, suspends an existing RL grant and immediately cancels pending messages. START/UNSTOP can clear only provider suppression; they never restore RL consent. YES/SUBSCRIBE cannot clear the toll-free carrier gate. A fresh RL consent grant requires the exact disclosure, selected purposes, source, evidence and server timestamp. Both immediate and genuine signed asynchronous `21610` failures save provider suppression and cancel remaining queued messages. Duplicate/stale events cannot revive a cancelled schedule or erase tenant history.

Pilot evaluation uses `RL_SMS_PILOT_ENABLED=true` and `RL_SMS_PILOT_ID=operator-sms-pilot-20261114`, while `RL_SMS_ENABLED=false` and `RL_SMS_LIVE_APPROVED=false` remain unchanged. The private pilot is active only for the exact tenant, dedicated test customer and authorized phone hash. It requires synthetic-test flags, separately approved sender, independently recorded RL consent and genuine fresh Event Streams START. It expires **November 15, 2026 at 11:07 AM Pacific**, and reserves at most **four RL messages total** transactionally; the setup SMS consumed one reservation, leaving three. Queue and dispatch recheck the same constraints. Company owners cannot edit the private pilot approval or expand its recipient scope through settings. Company SMS settings remain disabled and sender `automationApproved` remains false; only `pilotApproved` is true.

**Actual provider acceptance: PASS.** At 11:16 AM Pacific the authorized handset sent STOP and confirmed its acknowledgement. Twilio's genuine signed schema-8 STOP event saved provider suppression, changed RL consent to `stopped` and immediately cancelled the queued test with **zero provider attempts**. The handset then sent START and confirmed acknowledgement; its signed event cleared provider suppression while RL consent remained `stopped` and the cancelled row stayed cancelled. Both requests returned HTTP 200 without a retry/error. At 11:17 AM the operator's separate written renewal of the four purposes was recorded, and an atomic update activated only this test-customer pilot. START itself granted no consent. Broad/company-wide customer automation remains off.

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

- Automation-readiness validation: 75 Functions tests passed with one unrelated native-push emulator skip; all 31 SMS/pilot emulator tests passed (21 consent/delivery plus 10 pilot security/workflow tests). The eight Event Streams signature/security tests are included in the Functions count. All nine SMS/settings UI tests and the web build passed. Normal `test:rules` now includes the new pilot suite. Emulator coverage includes duplicate/stale events, tenant isolation, caps and expiry; actual handset/provider acceptance is recorded separately above.
- All ten affected RL SMS functions deployed and report `ACTIVE`. Runtime metadata confirms both broad outbound gates remain false. The private pilot and its one dedicated test customer became active only after the genuine provider checks and separately renewed consent passed.
- Actual provider transport verification passed at 11:12 AM Pacific: Twilio generated a sink test for the new active RL Event Streams subscription. The signed JSON request returned HTTP 200, with one event safely ignored and no retry/error. This establishes the genuine transport/signature path, separately from physical STOP/START acceptance. The shared-number subscription uses inbound schema 8 and does not change Merxus' incoming-message URL.
- One newly consented setup SMS was submitted at 11:13 AM Pacific using the restricted RL send key; Twilio reported `delivered` with no error. STOP immediately cancelled the dedicated queued cancellation fixture with zero attempts. No real job was created or changed. Initial/fresh purpose-specific consent, real STOP/START state and pilot activation are recorded in ignored `.migration/sms-readiness-control.json`; runtime, provider transport and original-record preservation evidence is in `.migration/sms-readiness-evidence.json`. All 508 pre-existing customer, six job and six membership document versions remain unchanged; the only new customer is the explicitly marked pilot fixture.
- Working-sender follow-up: Functions unit invocation passed 67 tests with no failures; one unrelated native-push emulator test was skipped in that unit-only invocation. The targeted 13-test SMS Firestore integration run passed without skips. The SMS unit subset passed eight tests. New coverage includes direct sender approval/snapshot validation, restricted-key authentication, exact sender/account callback checks, valid signed delivery and STOP suppression behavior. The seven-function deployment succeeded. The genuine test's two callback requests returned HTTP 200 with INFO severity and reconciled `sent`/`delivered` without an error.
- Post-SMS read-only comparison confirmed all 508 customer, six job and six membership document versions unchanged. SMS tenant settings, sender-approval and customer-consent collections remain empty; only the controlled operator outbox and delivery audit/event records were added. Evidence is retained privately in ignored `.migration/rl-working-sms-test.json`, `.migration/rl-working-sms-preservation.json` and `.migration/rl-working-twilio-configuration.json`; no secret values are included in these reports.
- Merxus isolation audit at 10:32 AM Pacific confirmed its original `merxus-ai-backend-00822-lis` revision and November 11 configuration timestamp unchanged. The selected sender retains `POST https://api.merxus.ai/twilio/sms/inbound`; its Twilio configuration timestamp remains August 14, predating this work. Account ownership and Merxus account-selection settings are unchanged.

Initial activation checks, before the working-sender follow-up:

- Functions: 65 passed; the one push emulator test skipped in the unit-only invocation was run separately with its emulator.
- SMS and native-push Firestore integration: 11 passed, no skips.
- Mobile: 168 passed, including 13 native-push tests. Two stale test-fixture imports were mocked; no mobile application behavior changed.
- SMS/settings web tests: 8 passed.
- Existing operator/sandbox safety tests in the Functions command: 21 passed.

Read-only initial activation metadata confirmed native registration/delivery enabled, SMS still disabled, one active iOS registration, one push delivery, and zero SMS outbox records. The separately authorized tap test added only one further push-delivery record. All Acme customer, job and membership document versions matched the preflight snapshot: 508 customers including the existing certification fixture, six jobs and six memberships. The original 507 customers remain intact. No accounting integration, Auth account, Firebase project, Merxus configuration or sender was altered.

Sanitized operational evidence is retained in ignored `.migration/communications-final.json`, `.migration/communications-push-test.json`, `.migration/twilio-working-delivery-diagnostic.json` and the native-push build/config audits. Sender business numbers are retained for this investigation; provider credentials, message bodies, recipient phone values, private keys and device tokens are excluded.

SMS delivery, genuine shared-sender STOP/START synchronization, independently renewed four-purpose consent and the scoped pilot activation are complete. The test-customer pilot expires November 15 at 11:07 AM Pacific and cannot exceed four total RL messages. Company-wide messaging requires explicit operator approval and each customer's own purpose-specific consent; it remains disabled. Android FCM v1 setup is a separate previously identified item. The iOS visible-push delivery and notification-tap checks are complete. No new account, sender purchase, campaign or iOS rebuild was required.
