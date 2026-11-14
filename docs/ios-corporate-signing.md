# Corporate iOS signing and first TestFlight build

November 13, 2026. Existing `main`; Firebase `mi-factotum-field-service`.

## Release identity

| Setting | Value |
| --- | --- |
| App name | Route Logistics |
| Corporate Apple account | Workside Software LLC |
| Apple Team ID | `AXCZ2G99P6` |
| New iOS bundle ID | `com.worksidesoftware.routelogistics` |
| Previous personal iOS bundle ID | `com.workside.routelogistics` |
| Android package, unchanged | `com.workside.routelogistics` |
| Expo owner, unchanged | `sjroy5` |
| Existing EAS project | `a6b5d885-dd99-4435-bef0-b7ffe09a2890` |
| Existing Firebase project | `mi-factotum-field-service` |

Both `app.config.js` and the static `app.json` set the new iOS identifier and corporate `ios.appleTeamId`. The production EAS profile explicitly uses store distribution, Release configuration, a physical-device build, remote signing credentials and the production environment. Remote version management and automatic build-number increment are preserved.

Production uses `macos-sequoia-15.6-xcode-26.0`, which Expo lists for SDK 54. This avoids selecting a newer, incompatible image accidentally and meets Apple's current Xcode 26 / iOS 26 SDK upload minimum. The final signed cloud build still needs to succeed. See [Expo build images](https://docs.expo.dev/build-reference/infrastructure/) and [Apple's upload requirement](https://developer.apple.com/news/upcoming-requirements/?id=04282026a).

The submit profile specifies the corporate team, company name and new bundle identifier. There is deliberately no invented `ascAppId`: that field must be the numeric Apple ID of the new corporate App Store Connect app, not the team ID or Expo UUID. Interactive first submission can select/create that record. Configure its real numeric ID later if unattended submission is required.

## Audit results

| Area | Result |
| --- | --- |
| Firebase | Modular Firebase JavaScript SDK with the existing registered web-app client configuration and AsyncStorage Auth persistence. No native Firebase module/plist is used. No new Firebase iOS registration or project is required. |
| Native targets | Native directories are generated and untracked. EAS regenerates them from the current config; corporate team selection applies to native target build configurations. |
| Entitlements | No manually configured application identifier, keychain access group, associated domain, Sign in with Apple or APNs entitlement exists. Signing supplies its own application/team identity. |
| Background work | Existing location/background modes, permission descriptions and TaskManager registration are retained. Fresh device permission is required for the new app identity. |
| URL schemes | No explicit custom scheme or incoming-link handler is implemented. Expo introspection generates `com.worksidesoftware.routelogistics`. No current auth/invitation flow relies on the old scheme. |
| Authentication | Password, email OTP and browser email verification retain the existing Firebase accounts and company authorization. No native Google/Apple OAuth client or bundle-dependent redirect is configured. |
| Push | Native APNs/FCM/Expo push registration is not implemented. Settings saves a notification preference only. Existing web FCM/backend notifications are unchanged. No personal-team APNs key is copied. |
| Maps/payments | Mobile navigation hands off to Maps; no iOS Maps-key restriction, Apple Pay merchant identifier or native Stripe entitlement is configured. Existing web/provider configuration remains unchanged. |
| Backend/web | No backend, rules, customer records, web code, or mi Factotum changes are required or deployed. |

Firebase's JS-only setup is documented in [Expo's Firebase guide](https://docs.expo.dev/guides/using-firebase/). Native push, if introduced later, will require separate corporate Apple/Firebase configuration.

## Upload-root handling

This Windows checkout contains an existing nested `routeLogisticsMobile/.git` in addition to the parent repository. Building from that nested Git root would omit `functions/shared/capabilities.json`, which mobile imports. Neither repository is deleted, moved, initialized or rewritten.

The commands below explicitly use the absolute parent directory as `EAS_PROJECT_ROOT` with supported `EAS_NO_VCS=1` packaging. The builder application directory remains `routeLogisticsMobile`. Verify and update parent `main` first; no-VCS upload does not attach Git branch/commit metadata to the build. See [Expo's no-VCS upload workflow](https://docs.expo.dev/build-reference/project-upload/#no-vcs-workflow).

Repository-root `.easignore` preserves required source/shared policy and excludes both `.git` directories, generated native projects, environment files, local audits, signing keys, service-account credentials and build/cache output. A `.easignore` replaces Git ignore rules, so its exclusions are explicit. [Expo archive rules](https://docs.expo.dev/build-reference/easignore/)

## Before switching apps

**The new identifier installs a separate iOS app with a separate data container.** Existing login sessions, local appearance/preferences, offline jobs/application queues, GPS consent and locally stored photos do not migrate automatically.

In the old installation, synchronize saved work and photos while still authorized, review failed/conflicted items, and end any active shift. Keep the old installation available until its saved work is accounted for. Do not treat installing the corporate app as an in-place upgrade. Existing server-side Firebase accounts and company records remain available after signing into the new app; reselect device preferences and grant permissions as needed.

If the expired personal build cannot run, its unsynchronized local data needs a separate recovery decision before deleting the installation. No automatic data-copy or destructive migration is performed here.

## Windows PowerShell commands

Use Node.js 22 LTS and the existing checkout. These commands use cloud iOS builds; local Xcode compilation is not available on Windows.

```powershell
Set-Location -LiteralPath 'C:\Users\sjroy\Source\routeLogistics'
git switch main
git pull --ff-only origin main

# Use the parent source tree even if this checkout has a nested mobile .git.
$env:EAS_PROJECT_ROOT = (Get-Location).Path
$env:EAS_NO_VCS = '1'

# These are public team metadata, not passwords or signing keys.
$env:EXPO_APPLE_TEAM_ID = 'AXCZ2G99P6'
$env:EXPO_APPLE_TEAM_TYPE = 'COMPANY_OR_ORGANIZATION'
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue

Set-Location -LiteralPath '.\routeLogisticsMobile'
npm ci
npx --yes eas-cli@27.10.0 login
npx --yes eas-cli@27.10.0 project:info
npx --yes eas-cli@27.10.0 config --platform ios --profile production
npx --yes eas-cli@27.10.0 build --platform ios --profile production --wait
```

Log into Expo as `sjroy5`. Project info must show `@sjroy5/route-logistics` and the existing EAS UUID above. Complete Apple authentication locally with a user authorized for **Workside Software LLC / AXCZ2G99P6**. The first corporate build needs the explicit new Apple App ID and a matching corporate distribution certificate/App Store provisioning profile. EAS can guide this setup. Retain existing personal/other-app credentials; use the corporate credentials for this new app.

The shell team variables matter: EAS CLI's Apple credential authentication can otherwise use a cached team independently of the native `ios.appleTeamId`. [Expo Apple authentication settings](https://docs.expo.dev/build/building-on-ci/#optional-provide-an-asc-api-token-for-your-apple-team)

After the build succeeds, copy the UUID from **that new corporate build** and submit it explicitly:

```powershell
$iosBuildId = Read-Host 'Paste the UUID of the new corporate iOS production build'
npx --yes eas-cli@27.10.0 build:view $iosBuildId
npx --yes eas-cli@27.10.0 submit --platform ios --profile production --id $iosBuildId --wait
```

Verify the selected build uses `com.worksidesoftware.routelogistics`, then choose/create its corporate App Store Connect record. Avoid `--latest` during this migration because the preserved EAS project also contains older app identities. First-time Apple/app/API-key setup is interactive; do not add `--non-interactive` before it is configured. No passwords, `.p8` keys, certificates or provisioning files belong in Git or chat.

Successful submission uploads to App Store Connect/TestFlight; Apple processing and test-group setup remain. It does not publish an App Store release. See [Expo iOS submission](https://docs.expo.dev/submit/ios/). Once configured, a future build and submission can be coupled with `npx --yes eas-cli@27.10.0 build --platform ios --profile production --auto-submit-with-profile production --wait` using the same corporate/root shell settings.

## Existing Mac native project

If continuing local Xcode development, preserve intentional native customizations before regeneration. Pull parent `main`, run `npm ci` and `npm run ios:prepare`, then open the generated workspace. Verify the app target's bundle ID is `com.worksidesoftware.routelogistics` and every target uses Team `AXCZ2G99P6`. Existing personal provisioning profiles do not sign this new identity. This also installs a separate app; the old install-over/data-preservation instructions apply only within the same bundle identifier.

## Verification and remaining operator steps

Validation passed: **132 mobile tests**, **Expo Doctor 18/18**, and the iOS Hermes export. Authenticated EAS project metadata confirms `@sjroy5/route-logistics` and the unchanged project UUID. EAS 27.10 resolved the corporate iOS team/bundle, store distribution, Release/device profile, remote credentials, auto-increment and the pinned Xcode 26.0 image. Expo introspection confirms the new URL scheme, preserved background modes and empty custom entitlements.

The actual local EAS upload archive includes `functions/shared/capabilities.json` and the mobile config, and excludes both Git directories, generated iOS files, server environment files, credential files and local audit output. Local evidence is retained under ignored `.migration/corporate-*` paths. A local Windows iOS prebuild is intentionally unsupported by Expo; no signed native build or TestFlight submission is claimed.

Remaining external steps are corporate Apple authentication/membership, registration of the new explicit App ID when prompted, corporate signing/provisioning, the new corporate App Store Connect record/optional numeric `ascAppId`, the actual signed cloud build, and TestFlight processing/device testing. No new Firebase registration or backend deployment is a prerequisite.
