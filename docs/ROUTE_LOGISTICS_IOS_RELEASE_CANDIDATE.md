# Route Logistics iOS release candidate

**Prepared:** November 22, 2026 (Pacific)

**Result:** PASS for signed build preparation; physical-device acceptance remains open.

**Source commit:** `9b3630460a7d0f9254367c81545ee1664d7a9184` on `main`

## Reviewer demonstration environment

- Created **Route Logistics Demo** in the existing production Firebase project. The company is separate from Acme and Bakersfield Lawncare Service.
- Created one verified, password-enabled reviewer account as the demo company's owner. A production password sign-in and authenticated workspace reads succeeded without email OTP or company registration.
- Added three clearly synthetic customers with non-deliverable email addresses and fictitious phone numbers. Added four nonbillable, scheduled demonstration jobs with sample addresses and descriptions. All four jobs are assigned to the reviewer.
- The production mobile workspace API returned the demo company, three customers, and four personal jobs. This verifies data needed for Home, Schedule, Job Details, and the visit workflow; screen behavior still requires physical-device testing.
- Reviewer credentials are stored only in Google Cloud Secret Manager, secret `RL_APP_STORE_REVIEWER_LOGIN`, enabled version 1. Retrieve them privately for App Store Connect reviewer instructions. Do not put the password in the repository, build notes, or a support ticket.
- The company registration policy was not changed. The reviewer uses the existing company membership; no duplicate authentication system or OTP-only dependency was introduced.

## iOS configuration review

- The sole pre-existing uncommitted `app.config.js` change added `NSLocationAlwaysUsageDescription` explaining background location sharing during an active shift. It was included because the app requests background location access. No bundle identifier, signing, or Firebase target changed.
- Expo owner: `sjroy5`; EAS project: `a6b5d885-dd99-4435-bef0-b7ffe09a2890`.
- iOS bundle identifier: `com.worksidesoftware.routelogisticsapp`; Apple team: `AXCZ2G99P6` (Workside Software LLC). Android package remains `com.workside.routelogistics`.
- Firebase client project: `mi-factotum-field-service`. No Firebase Admin credential is bundled with the mobile app.
- The resolved iOS configuration contains camera, photo-library, foreground-location, and background-location permission descriptions, plus background modes for location and fetch. The production EAS profile uses store distribution, remote Apple signing, and automatic build-number incrementing. `eas build` was used without `--auto-submit`.

## Validation and build

| Check | Result |
| --- | --- |
| Mobile automated tests | PASS: 447/447 |
| Expo Doctor | PASS: 18/18 |
| Local iOS JavaScript export | PASS: Hermes bundle exported |
| Reviewer password sign-in | PASS: Firebase Authentication and production workspace reads |
| Synthetic demo data | PASS: 3 customers, 4 assigned jobs, no billable jobs |
| EAS signed production build | PASS: `FINISHED`, store distribution |

- EAS build ID: `692b994c-a475-46c5-965e-5b8af91c14dc`.
- App version: **1.0.3**. iOS build number: **5** (remote EAS version, incremented from 4).
- [Build details](https://expo.dev/accounts/sjroy5/projects/route-logistics/builds/692b994c-a475-46c5-965e-5b8af91c14dc)
- [Signed IPA artifact](https://expo.dev/artifacts/eas/_6H_Ar5Rpjku2K4ppeA1vSfA2jOPph0C7AZJVR7NXNY.ipa)
- No binary was submitted to App Store Connect or Apple review.

## Physical-device acceptance checklist

Install this candidate through the approved Apple distribution path, then verify:

1. Reviewer password login opens the demo company without an email code or company creation.
2. Email-code login works with a separate inbox you control.
3. Personal account signup, email verification, and denial of company data before an invitation work.
4. Register a Company opens the production browser flow; an unauthorized new company remains blocked by `approval_required`.
5. An existing invitation can be accepted with the intended role.
6. Home, Schedule, an assigned Job Details screen, and all five visit-workflow stages work for the reviewer.
7. Camera capture and photo-library selection prompt correctly, and a demo photo upload is visible only in the demo company.
8. Starting a shift shares location only with permission; ending the shift stops sharing. Check foreground and background behavior.
9. Offline notes, photos, visit evidence, and queued completion survive a restart and reconcile after reconnecting without duplicate records.
10. Privacy Policy and Terms open; account deletion works on a separate disposable account after full-email confirmation. Do not delete the reviewer account.

## Remaining App Store Connect actions

- Privately enter the reviewer account credentials from Secret Manager in App Review Information. Explain that the account is already verified and has four sample jobs; no OTP is required for password login.
- Complete the physical-device checklist and resolve any failures before submission.
- Upload this signed build to App Store Connect when authorized, complete screenshots, privacy disclosures, age rating, support/contact details, and review notes, then submit for Apple review separately.

**Limitations:** EAS completed the cloud build and local automated checks passed. A physical iPhone has not yet been used to validate this exact candidate. Email-code delivery and account deletion were not exercised in this release because they require separate controlled accounts or inbox access.
