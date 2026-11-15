# Mobile Settings, legal links, and account deletion

Implemented November 15, 2026 on the existing `main` branch for Firebase project
`mi-factotum-field-service`.

## Settings

- The inactive English/Spanish selector is hidden. Full application translation
  remains future work; existing stored language preferences are not rewritten.
- Services starts collapsed and shows its count. Expanding displays the existing
  company services or independent-business service editor.
- Notification preferences starts collapsed. Expanding shows native push status,
  email preferences, and SMS preferences. Collapsing preserves edits and an
  already-mounted native notification component.
- Appearance still persists locally, independently of the account.
- **Legal & account → About Route Logistics** opens a native About dialog with
  Workside Software LLC, the installed app version, native build number, and OS
  details for support. Version/build values come from `expo-application`, so EAS
  remote build increments are reported correctly. Expo Go is labeled as a
  preview and does not report its host build as a Route Logistics release.
  Missing build information is shown as unavailable, without using configured
  build-number placeholders. Close dismisses the system dialog without changing
  Settings drafts.
- Legal links open `https://route-logistics.com/privacy` and
  `https://route-logistics.com/terms`. The terms route is a real public page;
  it previously fell through to the application router.
- The same legal and account controls are available to verified users awaiting
  an invitation or whose company access was removed. Deletion does not require
  reactivating a company membership.

## Account deletion

Open **Settings → Legal & account → Delete my account**. Review the scope and
unsynced-work counts, continue, re-enter the full signed-in email address, type
`DELETE`, and confirm. The email field starts empty with autofill disabled.
Deletion remains disabled until the complete email matches the current account
(ignoring letter case and surrounding whitespace). Pending edits/photos
require an additional explicit discard choice. Cancel does not delete anything.

The app requires connectivity, a verified account, and a sign-in within the last
five minutes. Sign out and sign back in using the existing password or email-code
flow if the sign-in is too old. A company owner with other active staff must first
transfer ownership to an explicitly selected active administrator using web
Company Setup. Ownership is never silently assigned to someone else. A sole
owner may delete their account, retaining historical company records without
assigning a new owner.

`rlDeleteAccount` accepts only `{confirmation: 'DELETE', emailConfirmation}` and
derives the UID from the verified caller. Before any deletion marker or cleanup,
the server compares the full entered email with both the verified token and
current Firebase Authentication account. Missing, partial and mismatched values
are rejected. The app resets confirmation fields when the signed-in account or
email changes, and rechecks identity before submitting. A server-only
`rlAccountDeletions/{uid}` record immediately
blocks old sessions in workspace authorization, Firestore, Storage, and claim
synchronization. `rlCompleteAccountDeletion` retries interrupted cleanup. Neither
endpoint is a general-purpose user deletion API.

Deletion removes the Firebase sign-in account, personal Route Logistics profile,
platform-admin grant if present, memberships/invitations for that identity,
notification registrations, credential mail, and current location/shift state.
Company-owned customers, jobs, invoices, service photos, and historical business
events remain intact. Company QuickBooks, Stripe, email, SMS and push integration
configuration is not changed. Customer-portal identities are separate; deleting
a staff login does not delete another same-email identity or customer record.
Legacy custom claims do not prevent deletion of the caller's own account.

On the initiating device, deletion pauses pending synchronization, stops tracking
and native push registration, then removes the deleted UID's local caches, queued
operations and app-owned queued photos after an authoritative server receipt.
Other accounts' cached work and the local appearance preference are preserved.
Company data is not recursively deleted from Firebase Storage. Previously cached
copies on other devices are not remotely erased; deleted-account authorization
prevents further synchronization.

If cleanup is pending after the server accepted deletion, access remains revoked
and the server worker retries. The app reports this state explicitly. An unknown
network outcome must not be mistaken for confirmed deletion or silently discard
local work.

Already accepted deletion receipts still permit local-cleanup retries after
sign-out; that retry does not initiate another deletion or require access to a
now-deleted account. The typed-email update passed the complete **229-test mobile
suite** and requires a new native build for physical acceptance. No real account
was deleted during development.

## Validation and release

Account deletion is tested with synthetic emulator data and injected native
dependencies. No production account is deleted during development acceptance.
Physical-device checks must still cover expanding/collapsing sections, opening
both legal links, cancelling deletion, and deletion of a dedicated disposable
test account with independently authorized data loss.

Local validation completed:

- Mobile: **201 passed**, including installed/preview version handling and the
  About dialog's preservation of Settings drafts.
- Web unit/UI tests: **241 passed**.
- Functions unit tests: **138 passed, 1 existing emulator-only skip**.
- Focused Firestore/Storage/invitation/deletion regression suite: **69 passed**.
- Auth/Functions emulator tests: **7 passed**, including deletion of a real
  synthetic Auth emulator account and verification that its credentials revoke.
- Chromium browser smoke suite: **9 passed**. The sign-in helper waits for the
  first callable emulator cold start; it does not resubmit sign-in credentials.
- Expo compatibility: dependencies up to date; Expo Doctor **18/18**.
- iOS bundle export: passed. Web build and lint: passed, with the two existing
  React hook dependency warnings in Calendar and Reports.

The broad rules run and subsequent focused run caught an invalid invitation
write and two test setup issues. These were corrected and the affected suites
passed in the final 69-test run. The initial broad run is not represented as a
full pass.

After pulling `main`, rebuild the TestFlight binary to receive these Settings
changes. From Windows PowerShell:

```powershell
Set-Location C:\Users\sjroy\Source\routeLogistics
git pull --ff-only origin main
Set-Location routeLogisticsMobile
npm ci
eas build --platform ios --auto-submit
```

The existing production EAS profile, owner `sjroy5`, project ID
`a6b5d885-dd99-4435-bef0-b7ffe09a2890`, iOS identifier
`com.worksidesoftware.routelogisticsapp`, Apple team `AXCZ2G99P6`, Android identifier
`com.workside.routelogistics`, and Firebase project remain unchanged. No EAS build
or store submission is triggered by this development task.

App Store Connect's Privacy Policy URL should use
`https://route-logistics.com/privacy`. App review acceptance remains subject to
physical testing and Apple's review; automated tests alone do not certify it.
Apple's [account deletion guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
requires an in-app deletion path and allows identity verification and clear
confirmation steps.
