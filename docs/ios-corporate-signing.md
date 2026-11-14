# Corporate iOS signing and first TestFlight build

November 13, 2026. Existing `main`; Firebase `mi-factotum-field-service`.

Apple-approved corporate identifier: `com.worksidesoftware.routelogisticsapp`.
Use this exact identifier for new Apple App ID, provisioning and App Store Connect
setup; the previous corporate proposal was unavailable. The corporate team and
existing Expo/Firebase projects are unchanged.

## Release identity

| Setting | Value |
| --- | --- |
| App name | Route Logistics |
| Corporate Apple account | Workside Software LLC |
| Apple Team ID | `AXCZ2G99P6` |
| New iOS bundle ID | `com.worksidesoftware.routelogisticsapp` |
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
| Entitlements | No manually configured application identifier, keychain access group, associated domain or Sign in with Apple entitlement exists. Expo Notifications supplies its APNs capability; signing supplies application/team identity. |
| Background work | Existing location/background modes, permission descriptions and TaskManager registration are retained. Fresh device permission is required for the new app identity. |
| URL schemes | No explicit custom scheme or incoming-link handler is implemented. Expo introspection generates `com.worksidesoftware.routelogisticsapp`. No current auth/invitation flow relies on the old scheme. |
| Authentication | Password, email OTP and browser email verification retain the existing Firebase accounts and company authorization. No native Google/Apple OAuth client or bundle-dependent redirect is configured. |
| Push | Expo native push is configured by the commercial-readiness release. Delivery remains gated pending credentials/device verification. Existing notification configuration is preserved by this cleanup; no personal-team APNs key is copied. |
| Maps/payments | Mobile navigation hands off to Maps; no iOS Maps-key restriction, Apple Pay merchant identifier or native Stripe entitlement is configured. Existing web/provider configuration remains unchanged. |
| Backend/web | No backend, rules, customer records, web code, or mi Factotum changes are required or deployed. |

Firebase's JS setup is documented in [Expo's Firebase guide](https://docs.expo.dev/guides/using-firebase/). See [commercial readiness](commercial-readiness.md) for the existing native push credential requirements.

## Normal EAS workflow

Run EAS directly from `routeLogisticsMobile`, where `eas.json` and the Expo config live. EAS discovers the parent Git repository and includes the required `functions/shared` helpers automatically. No `EAS_PROJECT_ROOT` or `EAS_NO_VCS` override is needed. This follows [Expo's normal monorepo workflow](https://docs.expo.dev/build-reference/build-with-monorepos/).

The old Windows workaround was caused by an accidental nested `routeLogisticsMobile/.git`. Its complete metadata/history is now preserved under ignored `.migration/eas-mobile-git-backup-*`, outside the app's Git discovery path. No history was deleted and no branch was created. Fresh clones of the parent repository do not contain that untracked nested metadata.

If another existing checkout has the same nested metadata, preserve it outside the mobile directory once before building. From the parent checkout on the Mac:

```sh
git branch --show-current
mkdir -p .migration
if [ -d routeLogisticsMobile/.git ]; then
  mv routeLogisticsMobile/.git ".migration/mobile-git-backup-$(date +%Y%m%d%H%M%S)"
fi
cd routeLogisticsMobile
git rev-parse --show-toplevel
unset EAS_PROJECT_ROOT EAS_NO_VCS
```

The detected root must be the parent Route Logistics repository on `main`. Remove any old exports of these overrides from the shell profile as well. This one-time repair is unnecessary in a normal fresh clone.

Repository-root `.easignore` keeps the mobile app and all required shared helpers while excluding unrelated web/backend code and documentation, generated native projects, environment files, local audits, signing keys, service-account credentials and build/cache output. Both Git ignore files remain intact; no npm workspace manager or build wrapper is needed. [Expo archive rules](https://docs.expo.dev/build-reference/easignore/)

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

# Clear old workaround overrides once if they are still set.
Remove-Item Env:EAS_PROJECT_ROOT, Env:EAS_NO_VCS -ErrorAction SilentlyContinue
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue

Set-Location -LiteralPath '.\routeLogisticsMobile'
npm ci
eas login
eas project:info
eas config --platform ios --profile production
eas build --platform ios --auto-submit
```

Log into Expo as `sjroy5`. Project info must show `@sjroy5/route-logistics` and the existing EAS UUID above. Complete Apple authentication locally with a user authorized for **Workside Software LLC / AXCZ2G99P6**. The first corporate build needs the explicit new Apple App ID and a matching corporate distribution certificate/App Store provisioning profile. EAS can guide this setup. Retain existing personal/other-app credentials; use the corporate credentials for this new app.

The omitted profile defaults to `production`; `--auto-submit` uses the matching `submit.production` profile and submits this exact new build. No separate build UUID or submit command is required. Native configuration retains Team `AXCZ2G99P6`, and the submission profile explicitly selects the same team and approved bundle ID.

On first Apple authentication, choose **Workside Software LLC / AXCZ2G99P6** if prompted; a cached Apple login can select a team independently of native configuration. First-time App Store Connect app/API-key setup remains interactive. The real numeric `ascAppId` can be added later for unattended submission; it is not needed for this interactive command. Do not add `--non-interactive` before that setup is complete, or store passwords/signing keys in Git or chat.

Successful auto-submission uploads to App Store Connect/TestFlight; Apple processing and test-group setup remain. It does not publish an App Store release. See [Expo automated submission](https://docs.expo.dev/build/automate-submissions/).

## Existing Mac native project

If continuing local Xcode development, preserve intentional native customizations before regeneration. Pull parent `main`, run `npm ci` and `npm run ios:prepare`, then open the generated workspace. Verify the app target's bundle ID is `com.worksidesoftware.routelogisticsapp` and every target uses Team `AXCZ2G99P6`. Existing personal provisioning profiles do not sign this new identity. This also installs a separate app; the old install-over/data-preservation instructions apply only within the same bundle identifier.

## Verification and remaining operator steps

The simplified workflow was validated using EAS 27.10 without either root/no-VCS override: normal Git discovery from the mobile directory, authenticated production configuration, and default build/submission profiles both resolving to `production`. Expo Doctor passed **18/18** checks. The resolved configuration preserves `@sjroy5/route-logistics`, the existing EAS UUID, corporate iOS team/bundle, Android package, store distribution, Release/device profile, remote credentials, auto-increment and pinned Xcode 26.0 image. No application code or infrastructure was changed.

The actual default-Git local upload archive passed checks for nine required app/shared files and twelve excluded private/generated/unrelated paths. The nested Git backup is excluded; root Git commit metadata is retained by the normal EAS workflow. Local validation evidence is under ignored `.migration/eas-simple-*` paths. No cloud build, Apple credential setup or TestFlight submission was triggered.

Remaining external steps are corporate Apple authentication/membership, registration of the new explicit App ID when prompted, corporate signing/provisioning, the new corporate App Store Connect record/optional numeric `ascAppId`, the actual signed cloud build, and TestFlight processing/device testing. No new Firebase registration or backend deployment is a prerequisite.
