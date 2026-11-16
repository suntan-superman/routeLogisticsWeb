# Android push notifications — diagnosis and activation

**Diagnostic date:** November 16, 2026, Pacific time.

## Confirmed findings

This is a notification configuration/opt-in problem, not a job synchronization failure. No production application-code defect was confirmed during the initial audit.

| Check | Observed result |
| --- | --- |
| Delivery architecture | Expo Push Service; Android delivery uses FCM v1 through Expo, not a separate direct-FCM backend sender |
| Existing Firebase project | `mi-factotum-field-service` |
| Expo application | Owner `sjroy5`, EAS project `a6b5d885-dd99-4435-bef0-b7ffe09a2890` |
| Android package | `com.workside.routelogistics` |
| Connected installed app | Version 1.0.1, versionCode 1, target SDK 36 |
| Android OS notification permission | `POST_NOTIFICATIONS` not granted; notification app-op was `ignore` |
| Current Acme registrations | One active, unexpired iOS registration; no Android registration |
| Existing iOS delivery history | Recent assignment/status rows reached `receipt-ok`, with one send attempt each |
| Current EAS Android credentials | No Android application credential row or FCM v1 association for this package; no uploaded matching-project account key in the audited metadata |
| Required Google APIs | FCM, Firebase Installations and FCM Registration APIs enabled |
| Runtime activation | `rlNativePush`, assignment triggers and `rlDeliverNativePush` ACTIVE; native push enabled |
| Expo enhanced push security | Disabled for this application/account; no additional Expo access token is currently required |

The EAS findings came from a fresh authenticated November 16 metadata query, not the earlier November 14 configuration snapshot. Private key payloads and full device tokens were not printed.

Two prerequisites are missing: explicit Android notification opt-in/registration, and Expo's server-side FCM v1 credential association. Without an Android registration the assignment trigger has no Android target, so it creates no Android delivery row. No Android provider rejection or accepted-but-hidden delivery has been observed yet.

## Existing notification flow

1. Explicit device opt-in creates the Android `work-updates` channel at high importance before requesting permission/token.
2. The app obtains an **Expo push token** under the existing EAS project ID. A raw native FCM token is not stored as the backend's delivery target.
3. `rlNativePush` registers the installation with the authenticated user, company, role, membership, platform and monotonic registration sequence.
4. Assignment creation/update triggers create deduplicated per-device records in `rlPushDeliveries` for currently authorized recipients.
5. The scheduled Expo worker rechecks membership, assignment, preferences, expiry and device scope before sending. Android payloads select `channelId: work-updates`, high priority and a bounded TTL.
6. An accepted Expo ticket enters `receipt`; a successful provider receipt becomes `receipt-ok`. These states do not prove handset presentation.
7. Tapping the notification loads the current authorized job and respects existing draft/shift navigation guards. Receiving a push does not create another job.

Android and iOS registrations coexist per installation. Revocation/rotation and test coverage preserve the other installation and unrelated tenants.

## Required operator steps

### Associate Android FCM v1 credentials with Expo

Use an authorized service-account JSON for the **existing** Firebase project. An existing account needs the **Firebase Cloud Messaging API Admin** role. If no suitable key is available, an authorized Google Cloud operator must obtain one. Keep its private JSON outside the repository and never paste it into chat.

In the [existing Expo project's credentials page](https://expo.dev/accounts/sjroy5/projects/route-logistics/credentials):

1. Select Android and add/select application identifier `com.workside.routelogistics`.
2. Under Service credentials, select **FCM V1 service account key**.
3. Upload/select the authorized JSON for `mi-factotum-field-service` and save the association.

Alternatively, from `routeLogisticsMobile` run:

```powershell
npx eas-cli credentials --platform android
```

Choose **production → Google Service Account → Manage your Google Service Account Key for Push Notifications (FCM V1) → Set up → Upload a new service account key**. This manages credentials; it does not start a paid cloud build. See [Expo's FCM v1 instructions](https://docs.expo.dev/push-notifications/fcm-credentials/).

The checked-in `google-services.json` is public native-client configuration, already matches the existing project/package and must remain intact. It is distinct from the private FCM service-account credential. Do not put the private JSON in the app, `.env`, source control or another application's credential configuration.

### Enable and register the Android device

1. Sign in to the authorized technician account.
2. Open Settings → Native work notifications → Enable native notifications.
3. Allow Android's notification prompt. If Android blocks the prompt, enable notifications under Android Settings → Apps → Route Logistics → Notifications, then return to the app.
4. Ensure the **Work updates** channel is allowed. Refresh notification status and complete registration.
5. The app should show **Turn off native notifications**, with job-assignment notifications enabled.

Do not grant permission through ADB or overwrite an intentional user preference. The diagnostic checked OS state read-only.

The existing native manifest, merged Firebase resources, Google Services integration and notification plugin are configured. No native rebuild or backend redeployment is currently required for the credential/permission correction alone. No iOS credential change is required.

## One controlled acceptance test

The operator authorized one assignment notification using the existing test technician and a dedicated synthetic job. No test notification has been sent during the initial diagnostic.

Before sending, recheck the FCM association, Android permission/channel, current registration and account scope. Establish the exact target account/device and avoid an unintended fan-out to additional installations. Do not change real appointments or notification preferences to force a test.

Record each stage independently:

| Stage | Initial status |
| --- | --- |
| Correct Android registration | Pending explicit opt-in |
| Matching FCM v1 association | Pending operator configuration |
| One assignment event/delivery record | Not triggered |
| Worker/provider ticket | Not attempted |
| Provider receipt | Not available |
| Physical Android display | Not verified |
| Tap opens the correct synthetic work order | Not verified |

If a send has ambiguous acceptance, do not automatically repeat the test. Inspect the existing delivery and receipt instead. Do not use email/SMS as a substitute.

## Regression verification

- Mobile native-push suite: **17/17 passed**.
- Complete mobile suite: **336/336 passed**.
- Backend native-push suite: **17/17 passed**.
- Complete Functions unit commands: **186 passed**, with one emulator-only case skipped in the unit invocation.
- That Firestore emulator case ran separately: **1/1 passed**.

New coverage checks Android channel/permission/token/registration ordering, denial without registration, Android-specific registration, rotation/invalidation, foreground preference/scope filtering, cold-start and blocked-draft navigation, mixed-platform fan-out, duplicate suppression, tenant isolation and Android credential errors that preserve iOS delivery. Provider transports are mocked in these tests; they are not physical Android acceptance.

Only regression tests and this operational record changed. No notification runtime, assignment, synchronization, offline-work, iOS credential, Stripe, QuickBooks, SMS or email behavior was modified. Sanitized current-state evidence is retained in ignored `.migration/android-push-*` and `.migration/android-fcm-current-audit.json`; credentials and raw tokens are excluded.
