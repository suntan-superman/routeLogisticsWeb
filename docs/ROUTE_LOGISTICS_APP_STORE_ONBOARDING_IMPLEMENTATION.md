# Route Logistics: App Store onboarding implementation

## Scope and architecture

This is a local implementation. No production deployment, Git commit, push, native build, or App Store submission has been performed.

- Firebase Authentication remains the only staff identity provider. Mobile account creation uses the existing signup and email-verification flow. A verified personal account with no active company membership is `unassociated` and cannot access company data.
- Existing company invitations remain the route for joining a company. Invitation acceptance still requires the invited verified email; it is not inferred from an email or company name.
- Both company-creation entry points are server mediated: `rlCreateCompany` and `rlActivateCompanyOnboarding`. Each now checks the same registration policy and, when required, redeems a Workside authorization in the company-creation transaction.
- The existing explicit `rlPlatformAdmins` authorization controls the policy UI and callable. Tenant ownership does not grant platform administration.
- Existing solo/personal data is preserved, but zero-membership accounts no longer receive fallback company permissions. This also closes the legacy solo Firestore-rules path.

## Registration controls

`rlCompanyRegistration/policy` supports `open`, `approval_required`, and `closed`. Missing, invalid, or unreadable configuration fails closed. The intended release setting is `approval_required`; the operator must set it explicitly through Platform Admin when the backend is released. The code does not silently initialize it in production.

The platform admin can issue a seven-day, 256-bit, single-use authorization for a verified email, optionally bound to a UID, and revoke it. Firestore stores only its SHA-256 hash. Issuance, redemption, revocation, and policy changes are audited. The private link carries the code in a URL fragment; the web app moves it into tab-local session storage and removes the fragment before signup/login. The server verifies the current Firebase identity and policy at redemption. Closed mode denies new companies even with a valid link; open mode uses the same verified, transactional creation path without a code.

## App experience

- Mobile signup creates a personal login, not a company or a personal service catalog. Unverified, pending-invitation, unassociated, active, and revoked states remain distinct. The unassociated screen offers invitation acceptance, access refresh, sign-out, privacy, terms, and account deletion. Company queries, work operations, and shift/location controls require active company access.
- Web signup explains the current registration policy. The onboarding review step requires the private code only in approval-required mode. The existing owner onboarding draft and invitation flow remain available. Platform Admin includes a policy selector, outstanding authorizations, issuance, revocation, and recent audit history.
- The existing mobile deletion flow remains accessible without a company. Deletion still requires reauthentication and exact email confirmation. A current company owner must resolve ownership dependencies before deleting the account; no shared company records are silently deleted.

## Files changed

Backend and rules: `functions/companyRegistration.js`, `functions/companyOnboarding.js`, `functions/workData.js`, `functions/workspace.js`, `functions/security.js`, `functions/access.js`, `functions/index.js`, `firestore.rules`.

Web: `routeLogisticsWeb/src/App.jsx`, `src/components/CompanyRegistrationAdmin.jsx`, `src/components/ProtectedRoute.jsx`, `src/pages/CompanyOnboardingPage.jsx`, `src/pages/PlatformAdminPage.jsx`, `src/pages/SignupPage.jsx`, `src/services/tenancy.js`, `src/services/workspaceQueryPolicy.js`, `src/utils/companyRegistrationIntent.js` (paths after `routeLogisticsWeb/`).

Mobile: `routeLogisticsMobile/screens/LoginScreen.js`, `SignUpScreen.js`, `WorkspaceAccessScreen.js`, `contexts/WorkQueryProvider.js`, `services/workspacePolicy.js`.

Tests: `functions/workspace.test.js`, `routeLogisticsMobile/scripts/screens.test.js`, `workspace.test.js`, `routeLogisticsWeb/src/services/workspaceQueryPolicy.test.js`, `src/utils/companyRegistrationIntent.test.js`, `tests/company-registration.integration.test.js`, `company-onboarding.integration.test.js`, `firestore.rules.test.js`, selected existing solo-access integration tests, and `tests/browser/company-onboarding.spec.js` with its emulator fixture. `package.json` includes the new registration test in `test:rules`.

No schema migration or new index is required. The existing customer, membership, job, and financial records are not rewritten by this local work.

## Validation

| Check | Result |
| --- | --- |
| Functions unit suite | 231 passed, 1 skipped |
| Web unit suite | 549 passed |
| Mobile unit suite | 446 passed |
| Firestore and Storage emulator suite | Broad run: 618/619 passed; one test incorrectly called an internal scheduling helper without authorization context. Corrected the test to call the public handler; focused rerun: 78/78 passed. A later targeted registration rerun passed 4/4 after adding explicit expired-status coverage. The entire broad suite was not rerun after those test corrections. |
| Authentication emulator end-to-end suite | 7 passed |
| Onboarding browser acceptance | Chromium 2/2 passed: approval-required signup, email verification, draft resume, and activation; existing-owner setup review and manager denial |
| Web lint | 0 errors; 1 pre-existing Team Locations warning |
| Web production build | Passed (1,512 modules) |
| Expo public config | Valid; correct production Firebase project and EAS project |
| Expo iOS export | Passed (1,022 modules) |
| Expo package compatibility | Offline check passed; online check could not reach Expo |
| Expo Doctor | Pending; tool is not installed locally |
| Physical iOS / App Store Connect | Pending operator verification |

Tests run only against local Firebase emulators or local app builds. No production test identity, company, invitation, or customer was created.

## iOS release review

The checked-in iOS identifier is `com.worksidesoftware.routelogisticsapp`, owner `sjroy5`, EAS project `a6b5d885-dd99-4435-bef0-b7ffe09a2890`, and Apple Team `AXCZ2G99P6`. The source plan's `com.worksidesoftware.routelogistics` is an older unavailable identifier and must not replace the approved one. Expo version is `1.0.3`; local `buildNumber` is `1`, while production EAS uses remote versioning and auto-increment. Confirm the actual App Store Connect record and remote build number before submission.

The app has a branded icon and explicit camera, photos, foreground-location, and background-location permission text. Its location plugin requests background modes, consistent with the existing on-duty tracking feature. Privacy and terms open from login, signup, and authenticated settings; settings also exposes account deletion. Login has a support email link. Review the generated iOS privacy manifest, App Privacy answers, age rating, permission prompts, support URL, and TestFlight login on a real build. The App Store Connect record and Apple reviewer demo account cannot be verified from local code; arrange an existing non-sensitive demo account and hand credentials to Apple through App Store Connect, not this repository. No live payment CTA was added.

## Minimal production release plan after approval

1. Deploy the new registration callable and the two guarded company-creation functions together. Deploy the updated Firestore rules in the same controlled release. Set the policy to `approval_required` using the existing platform-admin account; until then, new company creation remains closed while existing tenants and invitations continue.
2. Publish the web changes and distribute a new mobile binary. Verify signup, email verification, unassociated denial, invitation acceptance, authorized company creation, and existing technician work on physical devices.
3. Keep a platform-admin path to switch the policy to `closed` if registration must be paused. Revoke outstanding authorizations if needed. Preserve existing company and customer records during any rollback.

No deployment is authorized by this report.
