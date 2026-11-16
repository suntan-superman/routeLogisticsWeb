# Android push notifications — diagnosis and activation

**Diagnostic date:** November 16, 2026, Pacific time.

## Confirmed initial findings

This is a notification configuration/opt-in problem, not a job synchronization failure. No production application-code defect was confirmed during the initial audit.

| Check | Observed result |
| --- | --- |
| Delivery architecture | Expo Push Service; Android delivery uses FCM v1 through Expo, not a separate direct-FCM backend sender |
| Existing Firebase project | `mi-factotum-field-service` |
| Expo application | Owner `sjroy5`, EAS project `a6b5d885-dd99-4435-bef0-b7ffe09a2890` |
| Android package | `com.workside.routelogistics` |
| Connected installed app | Version 1.0.1, versionCode 1, target SDK 36 |
| Initial Android OS notification permission | `POST_NOTIFICATIONS` not granted; notification app-op was `ignore` |
| Initial Acme registrations | One active, unexpired iOS registration; no Android registration |
| Existing iOS delivery history | Recent assignment/status rows reached `receipt-ok`, with one send attempt each |
| Initial EAS Android credentials | No Android application credential row or FCM v1 association for this package; no uploaded matching-project account key in the audited metadata |
| Required Google APIs | FCM, Firebase Installations and FCM Registration APIs enabled |
| Runtime activation | `rlNativePush`, assignment triggers and `rlDeliverNativePush` ACTIVE; native push enabled |
| Expo enhanced push security | Disabled for this application/account; no additional Expo access token is currently required |

The EAS findings came from a fresh authenticated November 16 metadata query, not the earlier November 14 configuration snapshot. Private key payloads and full device tokens were not printed.

Two prerequisites were missing: explicit Android notification opt-in/registration, and Expo's server-side FCM v1 credential association. Without an Android registration the assignment trigger had no Android target, so it created no Android delivery row. The operator corrected both prerequisites, and the controlled delivery below passed. No application runtime change was necessary.

## Resolved configuration and physical acceptance

On November 16 the operator associated the existing project's authorized FCM v1 credential with EAS and enabled notifications on Android. Fresh read-only checks confirmed:

- The FCM v1 association matches `com.workside.routelogistics`, the existing EAS project and `mi-factotum-field-service`.
- Android notification permission is granted. The `work-updates` channel has HIGH importance; Do Not Disturb was off and the notification had no suppression or hidden state.
- `acme-manager@route-logistics.com` has exactly one active, unexpired Android registration in the authorized Acme manager scope. Its Expo token type, EAS project, verified account, current membership and assignment preferences are valid.
- The existing iOS registration remains separate and active. The test targeted only the Android manager installation.

Exactly one synthetic job assignment was created at **7:41 AM Pacific**. The normal production trigger and worker generated one Android assignment delivery and sent it once, around **7:42 AM**. Expo accepted the ticket; a read-only receipt lookup returned **`ok`**, without a provider error.

The Android notification service showed the high-importance notification while Route Logistics was in the background. The operator initially did not notice an alert, then found **New job assigned** in the notification drawer and confirmed that tapping that same notification opened **Android notification test — no real visit**. Drawer display and navigation passed; a heads-up banner or audible sound was not independently verified. No repeat notification was sent.

At 7:47 AM Pacific the worker row was still `receipt`, awaiting its normal scheduled receipt check; the direct provider receipt was already `ok`. Provider receipt and handset confirmation were verified separately. The receipt check was not accelerated and no second send was requested.

## Existing notification flow

1. Explicit device opt-in creates the Android `work-updates` channel at high importance before requesting permission/token.
2. The app obtains an **Expo push token** under the existing EAS project ID. A raw native FCM token is not stored as the backend's delivery target.
3. `rlNativePush` registers the installation with the authenticated user, company, role, membership, platform and monotonic registration sequence.
4. Assignment creation/update triggers create deduplicated per-device records in `rlPushDeliveries` for currently authorized recipients.
5. The scheduled Expo worker rechecks membership, assignment, preferences, expiry and device scope before sending. Android payloads select `channelId: work-updates`, high priority and a bounded TTL.
6. An accepted Expo ticket enters `receipt`; a successful provider receipt becomes `receipt-ok`. These states do not prove handset presentation.
7. Tapping the notification loads the current authorized job and respects existing draft/shift navigation guards. Receiving a push does not create another job.

Android and iOS registrations coexist per installation. Revocation/rotation and test coverage preserve the other installation and unrelated tenants.

## Setup reference — completed

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

1. Sign in to the authorized field-work account. This acceptance used the Acme manager account above.
2. Open Settings → Native work notifications → Enable native notifications.
3. Allow Android's notification prompt. If Android blocks the prompt, enable notifications under Android Settings → Apps → Route Logistics → Notifications, then return to the app.
4. Ensure the **Work updates** channel is allowed. Refresh notification status and complete registration.
5. The app should show **Turn off native notifications**, with job-assignment notifications enabled.

Do not grant permission through ADB or overwrite an intentional user preference. The diagnostic checked OS state read-only.

The existing native manifest, merged Firebase resources, Google Services integration and notification plugin are configured. No native rebuild or backend redeployment is currently required for the credential/permission correction alone. No iOS credential change is required.

## One controlled acceptance test

The operator authorized one assignment notification using the signed-in Android account and a dedicated synthetic job. That one test is complete; no further send is required.

The preflight checked the FCM association, Android permission/channel, current registration, account scope and absence of additional target installations/web-push tokens. Existing appointments and notification preferences were preserved.

Record each stage independently:

| Stage | November 16 result |
| --- | --- |
| Correct Android registration | PASS — current manager, company, membership, platform and Expo project |
| Matching FCM v1 association | PASS — matching Firebase project and Android package |
| One assignment event/delivery record | PASS — one synthetic job, one Android delivery |
| Worker/provider ticket | PASS — accepted on attempt 1, no provider error |
| Provider receipt | PASS — direct Expo receipt lookup returned `ok` |
| Physical Android display | PASS — operator found the same notification in the drawer |
| Tap opens the correct synthetic work order | PASS — operator confirmed the correct test job opened |

The dedicated job is clearly synthetic, has no customer association, no real property visit and zero cost. No SMS, email or accounting operation was requested. Comparisons with the preflight snapshot confirmed all **509 existing customer records, nine existing jobs and two invoices** unchanged, along with the target membership and notification preferences. The only added job was the authorized synthetic fixture; it remains available for navigation evidence and was not started or completed. Delivery and operator audit records are retained.

If a send has ambiguous acceptance, do not automatically repeat the test. Inspect the existing delivery and receipt instead. Do not use email/SMS as a substitute.

## Regression verification

- Mobile native-push suite: **17/17 passed**.
- Complete mobile suite: **336/336 passed**.
- Backend native-push suite: **17/17 passed**.
- Complete Functions unit commands: **186 passed**, with one emulator-only case skipped in the unit invocation.
- That Firestore emulator case ran separately: **1/1 passed**.

New coverage checks Android channel/permission/token/registration ordering, denial without registration, Android-specific registration, rotation/invalidation, foreground preference/scope filtering, cold-start and blocked-draft navigation, mixed-platform fan-out, duplicate suppression, tenant isolation and Android credential errors that preserve iOS delivery. Provider transports are mocked in these tests; they are not physical Android acceptance.

Only regression tests and operational documentation changed in Git. No notification runtime, assignment, synchronization, offline-work, iOS credential, Stripe, QuickBooks, SMS or email behavior was modified. No native rebuild, backend deployment or paid EAS build was needed. Existing iOS delivery code and credentials are unchanged; a new iOS notification was not sent during this Android acceptance.

Sanitized current-state evidence is retained in ignored `.migration/android-push-*` and `.migration/android-fcm-current-audit.json`, including the single-test guard, provider receipt and operator's drawer/tap confirmation; credentials and raw tokens are excluded. Android background assignment delivery and tap acceptance are complete. Other OS states and hardware workflows remain separate acceptance cases.
