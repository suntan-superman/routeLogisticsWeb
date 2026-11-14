# Mobile reliability and UX redesign

**Current iOS signing:** See [corporate signing migration](ios-corporate-signing.md). Its new bundle identifier installs a separate app; the old installation's local queues/photos do not migrate automatically. Earlier signing/install-over instructions below describe the previous identity.

November 13, 2026. Existing `main`, Firebase project `mi-factotum-field-service`.

## Confirmed cause of the false access alerts

Three client behaviors combined to turn normal refreshes into apparent revocation:

1. `syncTenancy` cleared the current claims/workspace snapshot before asynchronous token and membership refresh completed. Concurrent authorized work could then see an empty workspace.
2. Resource permission/not-found responses were treated as loss of company access. Concurrent queries could repeat the same validation/alert path.
3. Home inferred removal from absence in a date-filtered job list. Completion, rescheduling, or a changed filter is not proof that company membership was removed.

The new retained-tab shell also exposed a shared-query issue during integration: a hidden observer could overwrite cache-entry visibility metadata and suppress the visible observer's verified retry. Visibility is now registered per observer, with a regression proving recovery and no polling once every observer is hidden.

A read-only production check confirmed Luis (`tech3@route-logistics.com`) has an active technician membership and matching verified Firebase account/claims. His November 13, 3 PM job was completed and was returned by the mobile date-range query. No production writes were needed for this repair.

## Access and work-state changes

- `services/tenancy.js` now publishes claims and workspace atomically, deduplicates refreshes, checks the refreshed token against authoritative `syncClaims` output, and rejects stale results after sign-out/account changes.
- `contexts/SessionProvider.js` exposes separate ready, checking, offline, unavailable, pending and revoked states. A failed connection/token/profile read retains the mounted session and drafts while protected work reads pause. A successful server response must confirm membership loss before the removed-access screen appears.
- `WorkQueryProvider`, `workQueryClient` and `useWorkQueries` share bounded access validation. Concurrent stale-claims failures receive one membership check; persistent authorization errors stop automatic polling/retry and remain visible. Business preconditions remain operation errors.
- Query clients remain scoped by project, authenticated UID, company, role, membership, verification and workspace status. Actual scope changes replace the client and mounted workspace and remove previous-role read caches. Same-account validation does not remount work orders.
- `useWorkJob` reads the selected job independently from the schedule. List omission cannot dismiss it. Resource denial hides the private work order, retains drafts, and offers an explicit retry/return path. Offline detail uses existing role-scoped saved data; an online denial cannot fall back to a cache. Legacy object-form service addresses and safe customer contact/instructions are normalized for display without copying financial/customer documents into the job.
- Only the visible work screen polls. Mutation and synchronization outcomes refresh retained lists and details. Native picker interactions still suspend focus/poll refresh.
- Saved operations and local photos are never automatically deleted. Every synchronized write still uses existing server-side membership, tenant, role and assignment checks.

## Screens and interaction

| Screen | Result |
| --- | --- |
| Home | Technician's active/next work order, navigation handoff, today's status/counts, compact sync, explicit foreground location. No technician customer creation, administration, prices or finance. |
| Schedule | Day/Week/Month controls and chronological cards, including completed/cancelled work. The mounted scroll view and selected period survive opening/closing details. |
| Route | Own eligible assigned stops in saved order, open-work-order actions and external maps navigation. Independent businesses use their daily jobs. The screen explicitly states that an in-app route map is unavailable. |
| Settings | Device-local Light/Dark/System appearance, retained profile drafts, company information and full services catalogue. Company editing remains owner-only through the existing web flow. |
| Job Details | Appointment/customer/status, site/navigation/contact, work progress, notes, application history and drafts, photos with queue status, reviewed completion and completion summary. One inline workflow retains its photo/application owners. |

Owner/admin/manager Home retains existing customer, estimate and scheduling controls. New Schedule/Route work orders preserve access to the existing management edit/follow-up forms. These controls do not appear for technicians.

`components/MobileUI.js` centralizes headers, cards, status badges, buttons, fields, loading/error/empty states and confirmations. Existing green appearance palettes and dependencies are reused. Readable solid surfaces replace decorative transparency. Primary controls have 48-point minimum height; text keeps system scaling and wrapping. VoiceOver, large text and actual small-screen layout still require device verification.

Navigation uses four retained views in the existing app shell. Back/tab changes cannot interrupt a picker/save or silently discard a job draft. Explicit close/discard is required for unsaved input. Job-level access errors and temporary claims checks hide the work order without unmounting its draft owner. Actual account/company/role/membership changes invalidate that workspace.

Sync status expands into existing operation details and explicit retry/discard confirmation. Automatic draining waits for verified ready access. Errors/conflicts retain saved content for review.

Location sharing remains voluntary and foreground-only. It shows the selected active job and last accepted fix/accuracy, stops on background/unmount or confirmed access/assignment loss, and requires an explicit start. A job missing from a filtered list receives a bounded authorized single-job check; transient read errors retain sharing with feedback. No background tracking or on-duty shift system is introduced.

Uploaded private photos are fetched on demand through the authenticated photo callable. Local queued/selected photos have previews. Failed uploads and denied reads expose retry actions without an automatic authorization retry loop.

## Validation

Final validation passed. Tests use local mocks or the `demo-routelogistics` emulators; no test modifies production customers, invoices, memberships or mi Factotum functions.

| Check | Result |
| --- | --- |
| Complete mobile suite | 113 passed, 0 failed |
| Firestore/Storage authorization and field-work suites | 53 passed, 0 failed |
| Auth/Functions claims and staff code-login E2E | 6 passed, 0 failed |
| Expo dependency compatibility | Up to date |
| Expo Doctor | 18/18 passed |
| iOS Hermes export | Passed |
| Android Hermes export | Passed |
| Screen/access CSV | 67 unique inventory identifiers |

Mobile coverage includes atomic/stale claims, real revocation, cache isolation, shared visible/hidden observers, offline replay/preservation, completion/refetch, picker return/failures, draft retention, repeated navigation, manager handoff, appearance persistence, accessible actions and foreground location. Local evidence is in ignored `.migration/mobile-redesign-*-final.log` files and the exported bundles in `.migration/mobile-redesign-export-final`.

- Mobile regression suite: `cd routeLogisticsMobile && npm test`.
- Authorization: Firestore/Storage emulator suites `fieldwork.integration`, `access.integration`, `firestore.rules`, `storage.rules`.
- Authoritative session and code login: `npm run test:e2e` (Auth/Firestore/Route Logistics Functions emulators).
- Package compatibility: `npx expo install --check`.
- Expo Doctor: `npx expo-doctor`.
- JavaScript bundles: `npx expo export --platform ios --platform android --output-dir ../.migration/mobile-redesign-export-final`.

There are no dependency or lockfile changes in this release. Expo SDK 54, React Native 0.81.5, existing native modules, `com.workside.routelogistics`, Android application ID, EAS project ID and Firebase client configuration are preserved. No Cloud Functions or rules deployment is needed for these client changes. No staging or additional branch was created.

## Exact Mac rebuild

Stop the installed app in Xcode and stop the old Metro process. In the existing Mac checkout, from the repository root:

```bash
git switch main
git pull --ff-only origin main
cd routeLogisticsMobile
npm ci
npm test
npx expo install --check
npx expo-doctor
npm run ios:prepare
open ios/*.xcworkspace
```

Use the existing [mobile Firebase client configuration](../routeLogisticsMobile/README.md#firebase-configuration). Do not add Admin/service-account credentials. `ios:prepare` updates the existing native project without `--clean` and installs CocoaPods; stop and resolve any failure before continuing.

In Xcode, choose the Route Logistics scheme, existing signing team and physical iPhone. Use **Product > Clean Build Folder**, then **Run**. Install over the existing app so local queues/photos are retained. Do not uninstall the app or clear its application data to troubleshoot this release.

For the development build, start Metro in a second terminal from `routeLogisticsMobile`:

```bash
npx expo start --dev-client --clear
```

For Android, the same `npm ci` installs the unchanged dependencies; `npm run android -- --device` builds and installs on a connected development device with the existing Android toolchain. JavaScript exports are not a native Xcode/Gradle compilation or store submission.

## Required physical-device acceptance

1. Sign in as an accepted technician. Confirm company identity/services in Settings and absence of customer/admin/financial controls.
2. Exercise Light, Dark and System, relaunch, and verify persisted appearance; check VoiceOver, large Dynamic Type and all four tabs.
3. Open/close the same and different jobs repeatedly from Home, Schedule and Route. Preserve Week/Month selection and schedule scroll position.
4. Create a notes/application/completion draft, background/return, cancel or select from camera/gallery, and verify the draft remains. Check camera permission denial and upload failure/retry on the physical iPhone.
5. Start/complete authorized work online, then repeat offline with a photo/application. Reconnect and confirm pending/synced/failure states and correct schedule status without false membership alerts or duplicate operations.
6. Test a genuine reassignment and membership revocation with dedicated test work/accounts. Verify private detail is blocked, company revocation is shown only after authoritative confirmation, and saved work remains available for authorized review. Check account/role switches never show previous-role data.
7. Explicitly start location sharing, verify the last accepted fix, change tabs, background/return, and confirm there is no implied background tracking. Verify rescheduling/date rollover alone does not falsely imply revocation.
8. With an authorized management test account, open a job from Schedule/Route and verify edit/follow-up still use the existing forms and permissions.

Physical iPhone camera, rendering and end-to-end UX acceptance remain pending. This release is not declared device-certified.
