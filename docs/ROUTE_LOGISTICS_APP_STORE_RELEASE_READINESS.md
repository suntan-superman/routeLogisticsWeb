# Route Logistics Mobile — App Store release readiness

**Local review:** November 22, 2026. **Status:** implementation and local checks complete; production release and Apple submission await approval. This report describes the local `main` working tree, including the earlier uncommitted onboarding implementation. It does not certify deployed production behavior. No production accounts, customer records, or settings were changed.

## Executive summary

The mobile login now offers a small **Don't have an account? Sign up** link leading to **Get started**. Personal registration stays in the existing Firebase flow; company registration opens the existing web onboarding route. Android Back returns through the signup flow. Existing password, email-code, recovery, legal, and account-deletion paths remain. The iOS location permission text and a public Support URL are prepared locally. Local unit tests, Expo Doctor, web build, and iOS/Android JavaScript exports pass. A production release, reviewer-safe demonstration account, App Store Connect declarations, and physical iPhone checks remain before submission.

## Files changed in this preparation

- Mobile: `routeLogisticsMobile/App.js`, `screens/LoginScreen.js`, new `screens/SignUpOptionsScreen.js`, `app.config.js`, and `scripts/screens.test.js`.
- Web: `routeLogisticsWeb/src/App.jsx`, `pages/LandingPage.jsx`, `pages/PrivacyPage.jsx`, and new `pages/SupportPage.jsx` for a public support/contact URL and accurate invitation-based privacy language.
- This report.

The separate, previously uncommitted onboarding implementation spans Functions, rules, web, mobile, and tests as listed in `docs/ROUTE_LOGISTICS_APP_STORE_ONBOARDING_IMPLEMENTATION.md`. It remains local. `debug.log` and unrelated working-tree changes were preserved.

## Implemented behavior and security evidence

| Area | Verified local behavior |
| --- | --- |
| Personal signup | Existing `SignUpScreen` calls Firebase Auth signup, requests email verification, and routes unverified users to the verification screen. Verified users without active membership reach the restricted workspace-access screen. |
| Company signup | The new option opens `https://route-logistics.com/onboarding` in the device browser. It creates no company in React Native and cannot bypass server authorization. |
| Invitations | Existing invitation acceptance requires the verified invited identity; an email match by itself grants no tenant access. |
| Registration policy | `rlCompanyRegistration/policy` supports `open`, `approval_required`, and `closed`. Missing or unsupported mode resolves to `closed`. Both `rlCreateCompany` and `rlActivateCompanyOnboarding` call the same check and redemption inside a Firestore transaction. |
| Approval codes | Random 256-bit codes are stored only as SHA-256 document IDs, expire after seven days, are email-bound and optionally UID-bound, and are redeemed once transactionally. Issue, revoke, redeem, and policy changes create audit entries. |
| Admin boundary | Policy and code management call the existing `rlPlatformAdmins` authorization, independent of company ownership. Owner/Manager roles do not grant platform administration. |
| Account deletion | Settings → Legal & account → Delete account is also available to verified unassociated users. The existing flow checks unsynced work, requires the full current email plus `DELETE`, and requires recent sign-in and ownership checks server-side. |
| Biometric login | No biometric-login implementation or `expo-local-authentication` dependency was found in the current mobile runtime. Existing password and email-code sign-in were preserved. Do not advertise biometric login in App Store metadata. |

The new Support page offers a contact email and directs service/invoice questions to the provider. The mobile login links to it. The page must be published before using its URL in App Store Connect.

## Automated validation

| Check | Result |
| --- | --- |
| Mobile `npm test` | **447 passed, 0 failed**, including signup navigation, email code, deletion, and technician regression cases. After the small Back-listener refinement, 3 focused cases passed. |
| Web `npm run test:web` | **549 passed, 0 failed**, rerun after the support route was added. |
| Functions `npm run test:functions` | **231 passed, 0 failed, 1 skipped**. |
| Firestore/Storage emulator `npm run test:rules` | **619 passed, 0 failed**. Firebase emulator emitted transaction-lock warnings during negative/concurrency cases, but the suite exited successfully. |
| Authentication emulator `npm run test:e2e` | **7 passed, 0 failed**. |
| Web lint | **0 errors, 1 pre-existing Team Locations hook-dependency warning**. |
| Web production build | Passed after the Support page addition; Vite transformed **1,513 modules**. A sandbox-only esbuild file-access error required a local unsandboxed build. No deployment occurred. |
| Expo Doctor | **18/18 checks passed**. |
| Expo public config | Valid: owner `sjroy5`, project `a6b5d885-dd99-4435-bef0-b7ffe09a2890`, Firebase `mi-factotum-field-service`, iOS bundle `com.worksidesoftware.routelogisticsapp`. |
| iOS JavaScript export | Passed: 1,023 modules. |
| Android JavaScript export | Passed: 1,031 modules. |
| iOS config introspection | Passed: foreground and both Always location strings explain on-duty/background sharing; camera and photos strings are specific. |

The web build reports large JavaScript chunks, a performance warning rather than a release failure. JavaScript export is not a signed native build or physical-device test.

## Apple compliance findings

**MANUAL — App Privacy.** The app handles account name/email, company and customer contact details, service/job content, work photos, precise on-duty location and visit GPS evidence, device push registration, and locally cached/offline work. Complete App Store Connect’s data-type, purpose, linking, and tracking answers against actual production SDK/provider behavior. Confirm whether diagnostics/performance collection is enabled before selecting those categories. Do not mark this as “no data collected.” See [Apple App Privacy details](https://developer.apple.com/app-store/app-privacy-details/).

**MANUAL — Privacy manifest.** Expo Doctor passed, but inspect the generated signed iOS archive and dependency manifests for Apple required-reason API declarations before upload. No `PrivacyInfo.xcprivacy` is checked into this Expo source tree. The final native build, not the JavaScript export, is the conclusive artifact. See [Apple’s required-reason API guidance](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api).

**MANUAL — Permissions.** The generated iOS configuration contains explicit camera, photo-library, foreground-location, and background-location descriptions. Background location is intended only for an explicitly started shift with consent; verify actual prompt sequencing, background indicator, and end-shift behavior on iPhone. Notifications are opt-in in-app. The branded iOS icon is an opaque 1024×1024 PNG; splash asset exists. Confirm rendered icon, splash, appearance, and permission wording on a signed build.

**MANUAL — Encryption/export.** The iOS config sets `ITSAppUsesNonExemptEncryption=false`. Confirm the app uses only exempt standard OS/SDK transport encryption and complete App Store Connect export-compliance questions accordingly; this setting does not mean traffic is unencrypted.

**MANUAL — Payments.** The mobile signup path has no subscription checkout or payment request. In-person field services generally follow Apple’s physical-services payment rule, while future paid digital/SaaS purchase flows need a fresh App Review assessment. Do not advertise live Stripe or subscription capability from this release. See [App Review Guidelines §3.1.3(e)](https://developer.apple.com/app-store/review/guidelines/).

**BLOCKER before submission — reviewer access.** No reviewer-safe company/account was created. Do not give Apple access to Acme or BLS if their records include real customer information. An existing authorized owner must approve a dedicated synthetic demo tenant and login, or designate an already safe synthetic tenant. Upload credentials only into App Store Connect review information, never Git or this report.

**BLOCKER before submission — production release.** The guarded onboarding backend/rules/web code and this mobile UI are local. Publish and verify them together after approval; then explicitly set the production policy. The new Support URL also needs web publication. App Store Connect metadata and physical-device acceptance remain pending.

## Production registration configuration — prepared, not applied

The target policy is `approval_required`. It cannot safely be set through the **new** Platform Admin UI until its guarded callable and web page are deployed. After an approved release of `rlCompanyRegistration`, `rlCreateCompany`, `rlActivateCompanyOnboarding`, the associated Firestore rules, and the web/mobile changes:

1. Sign in to `https://route-logistics.com/platform-admin` with the existing authorized platform-admin identity. Open **Company registration**.
2. Refresh its current policy/revision. Select **Approval required**, click **Save policy**, and confirm. The UI sends `action: 'policy'`, `mode: 'approval_required'`, `confirm: 'approval_required'`, and the observed `expectedRevision` to `rlCompanyRegistration`; no secret is needed.
3. Refresh and verify the displayed mode is **approval required**. From a verified unassociated test account, confirm company creation without a code is denied; confirm the platform admin can issue one seven-day single-use authorization bound to the intended email, and that a redeemed/revoked code cannot be reused.
4. Verify existing companies, membership access, and ordinary employee invitations still work. The admin can select **Closed** if new-company registration must be paused.

The policy document is `rlCompanyRegistration/policy`. Do not manually create or edit authorization documents; the callable handles hashing, auditing, and atomic redemption. Missing configuration remains closed. No production setting was changed during this preparation.

### Native build environment

`app.config.js` obtains Firebase **public client** settings from `EXPO_PUBLIC_FIREBASE_*` overrides or checked-in validated public fallbacks. The build must resolve to `mi-factotum-field-service`; the config rejects another project or placeholder values. No Firebase Admin key or service-account JSON belongs in the app. For Android maps, `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` (or the existing fallback `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`) must be available to the native build and restricted to the Android package and signing certificate. It is embedded in the Android binary. The current iOS configuration has no separate Maps API key setting. Confirm the production EAS environment and signed artifact use the intended public Firebase client, Apple team, and native push credentials; do not paste key values into this report.

## App Store Connect draft metadata

| Field | Draft |
| --- | --- |
| Name | Route Logistics Mobile (matches the existing App Store Connect record; confirm availability/length there) |
| Subtitle | Field service, organized |
| Primary category | Business |
| Support URL | `https://route-logistics.com/support` **after the page is published** |
| Privacy Policy URL | `https://route-logistics.com/privacy` |
| Terms URL | `https://route-logistics.com/terms` (in-app and public) |
| Keywords | field service,dispatch,work orders,technicians,job scheduling,service visits,offline |

**Promotional text draft:** Keep schedules, field work, visit evidence, and office updates connected in one Route Logistics workspace.

**Description draft:** Route Logistics helps field-service teams coordinate jobs from the office and the field. Authorized staff can view assigned work, follow a guided visit workflow, record notes and photos, and see what has saved on device or synchronized. Owners and managers use the connected web workspace for scheduling, dispatch, and review. Work-location sharing starts only when a staff member chooses an on-duty shift and grants permission. A company invitation is required to access a team workspace. New-company registration is available through the web during controlled early access.

Review these drafts in App Store Connect against the final binary and [Apple metadata limits](https://developer.apple.com/help/app-store-connect/reference/app-information/app-and-compliance-information/). Avoid claims of biometric login, live accounting sync, live Stripe payments, or general self-service company registration.

## Reviewer access plan and App Review Notes draft

**MANUAL:** After approval, the owner should designate or create a dedicated demonstration company using only synthetic names, addresses, jobs, and photos; create an authorized verified reviewer staff account with at least one assigned demonstration job; confirm the account can sign in without creating a company. Keep the account active throughout review. If email OTP is chosen, a mailbox/reviewer-access procedure must be provided; a dedicated password login is simpler. Never copy real customer records into reviewer data. No such account/company was created here.

**Review Notes draft (replace placeholders only in App Store Connect):** “Sign in with the dedicated demo account supplied in the Review Information fields. It already belongs to a synthetic Route Logistics company; company registration is not required to review the app. Open Home or Schedule to view assigned demonstration work. Open a job to see the five-stage Visit Workflow. Settings → Legal & account contains Privacy policy, Terms of service, and Delete account. To inspect location sharing, open the on-duty control, grant the requested permission, and end the shift to stop sharing. Some features require camera/photo permission when used. Please do not complete or delete the demonstration records. Contact the supplied support address if access fails.”

Do not place live credentials, one-time codes, or invitation links in source control. Account deletion should be tested with a **separate empty test account** so the reviewer account remains usable.

## Screenshot and physical iPhone checklist

**MANUAL:** Capture current, truthful screenshots from the signed production candidate: Login (with signup link), Get started, synthetic company Home/Schedule, assigned job and guided workflow, a saved/queued/synchronized state, Settings with legal/account controls, and optional manager view only if the reviewer account is authorized for it. Avoid real customer data, fabricated screens, and unpublished features. Supply the iPhone screenshot sizes accepted by the current App Store Connect record; because `supportsTablet: true`, prepare corresponding iPad screenshots or confirm App Store Connect’s current requirements. See [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).

On a physical iPhone production/TestFlight build verify: password sign-in, email-code sign-in, password recovery, signup → personal and web-company paths, email verification, unassociated denial, invitation acceptance, Android-independent iOS Back behavior, Privacy/Terms/Support links, empty-account deletion, camera/photo permissions, shift location permission and end-shift, native push opt-in/deep link, offline notes/photos and restart recovery, keyboard visibility, safe areas, dark/light appearance, icon and splash, and the version/build shown in About. Confirm App Store Connect App Privacy, age rating, support/privacy URLs, demo credentials, and export compliance before submission.

## EAS build and submission commands (Windows PowerShell; **do not run yet**)

The checked-in production profile uses App Store distribution, remote signing, Release configuration, remote app-version source, and auto-increment. It specifies Apple Team `AXCZ2G99P6`, owner `sjroy5`, EAS project `a6b5d885-dd99-4435-bef0-b7ffe09a2890`, and iOS bundle `com.worksidesoftware.routelogisticsapp`. Local Expo version is `1.0.3`, local build number `1`; confirm the remote EAS build number and the App Store Connect version before building. The Android package remains `com.workside.routelogistics`.

```powershell
Set-Location 'C:\Users\sjroy\Source\routeLogistics\routeLogisticsMobile'
eas whoami
eas build --platform ios --profile production
eas submit --platform ios --profile production --latest
```

After production configuration and TestFlight acceptance, the established one-step alternative is `eas build --platform ios --profile production --auto-submit`. Auto-submit uploads to App Store Connect/TestFlight; it does **not** submit the app for App Review. Review the uploaded build and submit it from App Store Connect only after the checklist passes. See [Expo production build and submission guidance](https://docs.expo.dev/tutorial/eas/ios-production-build/) and [Expo iOS submission documentation](https://docs.expo.dev/submit/ios/).

## Remaining findings and recommended release order

1. **BLOCKER:** Approve and release the local onboarding backend, rules, web, and mobile changes as one controlled production rollout, then set `approval_required` and verify its denial/approval paths. Preserve all current customer and technician data.
2. **BLOCKER:** Prepare a reviewer-safe synthetic company and verified account; add credentials and clear steps to App Store Connect only.
3. **MANUAL:** Publish and check the Support page plus existing Privacy/Terms pages on real devices; finish App Privacy, privacy-manifest, export-compliance, age-rating, metadata, and screenshot entries.
4. **MANUAL:** Build the signed iOS candidate after approval, verify remote build/version and corporate signing, run the physical iPhone/iPad checks above, then TestFlight and App Review.
5. **OPTIONAL:** Later evaluate biometric login and JavaScript bundle size. Neither is represented as a current release feature.

No Git commit, push, Firebase deployment, Netlify publication, EAS build, production configuration, or App Store submission was performed for this preparation.
