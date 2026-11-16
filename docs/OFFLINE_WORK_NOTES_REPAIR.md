# Offline work-note persistence repair

November 16, 2026. Existing `main`, Firebase project `mi-factotum-field-service`, and existing Android/iOS application identities.

## Confirmed defect and recovery inspection

Physical Android testing of `91c544c` confirmed that arrival and a captured photo survived an offline restart, while typed work notes did not.

The old work-note editor kept typing in React state until **Save work notes** was selected. Its job-mount effect initialized from the cached/server job. It had no durable unsent note-draft key, so terminating the process lost unsubmitted text. Close/mode guards could not protect against process termination.

A second display defect affected already submitted notes: successful queue replay wrote the legacy `notes` field to a cache instead of canonical `workNotes`; synchronized rows were then excluded from pending overlays. An older detail cache could consequently hide acknowledged notes on an offline reopening.

Before changing the device or installing the APK, read-only inspection found:

- 17 Route Logistics offline storage keys and one exact-scope queue.
- One pending job operation, one pending visit and one pending photo.
- One retained local photo file.
- No queued `patch.notes`, cached canonical `workNotes`, or saved note-draft key containing the missing work-note text.

The missing unsaved work-note text was not recoverable from the inspected storage. The other pending work was intact. A filtered recovery copy is retained in ignored `.migration/work-notes-recovery-1794854786505/`; its `summary.json` contains metadata only. Firebase Authentication storage rows were excluded. No note bodies were printed, original device records were not edited, and no application storage was cleared.

## Corrected lifecycle

1. Every work-note text-change handler immediately starts the existing AsyncStorage write path. There is no debounce, preliminary native read or dependency on component cleanup.
2. A scoped snapshot records text, original edit time, immutable revision/operation ID, job identity/assignment and the pinned work revision.
3. The editor shows **Saving on device** until the storage promise succeeds, then **Saved on device — draft retained**. Typing alone does not submit a server mutation.
4. Reopening or restarting restores the current company/user/job draft. Intentional empty text is preserved; it does not fall back to old server text or dispatcher instructions.
5. **Save work notes** or **Save drafts and close** explicitly queues that snapshot through the existing authorized job-operation service. Repeated Save uses its stable operation ID.
6. Pending/failed/conflicting work remains local. A server acknowledgement marks only the matching submitted revision synchronized; later typing survives an older acknowledgement.
7. The retained acknowledged snapshot and canonical base/detail caches support subsequent offline reopening. A genuinely newer server revision supersedes a clean acknowledged snapshot, while an unfinished local draft remains protected.

The exact key extends the existing namespace:

```text
rl-offline-v1:<firebase-project>:<uid>:<company>:<role>:<membership>:draft:work-notes:<jobId>
```

Queued submissions still use the existing `:queue` and `rlApplyJobOperation` contract. No database migration, new dependency, server field, Cloud Function or security-rule change is required.

## Data and concurrency protection

- Job/user/company/membership/role scopes are pinned before asynchronous Save/Discard handoffs and checked again after awaits.
- Original edit time survives retries; synchronization time is not substituted for edit time.
- Immutable submissions and compare-and-set acknowledgements cannot clear a newer local revision.
- Delayed hydration, polling and old discard callbacks cannot overwrite another job's draft or release its draft guard.
- Explicit discard retains an archived local copy and a tombstone instead of physically deleting text. It cannot discard already submitted operations.
- Unsaved retained notes are included in the existing account-deletion work summary without double-counting queued notes. Existing explicit account-deletion controls remain intact.
- Failed device writes retain current editor text and offer a visible retry. They never display successful persistence.
- An unsent draft is distinct from a queued submission and a server acknowledgement. Closing the app does not turn a draft into a server-confirmed note.

The first native write is scheduled immediately; no asynchronous storage system can acknowledge a write if the OS kills the process before committing it. The UI therefore distinguishes **Saving on device** from a completed device save. Rapid termination and restart remain explicit physical acceptance cases.

## Dispatcher instructions and web verification

Work notes remain separate from gate codes and other dispatcher instructions. Mobile ACK updates use canonical `workNotes`; manager `notes`/`dispatchNotes` are preserved. Technician legacy aliases retain their existing compatibility.

The Dispatch drawer previously rendered `workNotes || notes`, incorrectly showing dispatcher instructions as work notes after an intentional clear. It now displays canonical work notes and a separate **Job instructions** section. This is the only related web runtime correction.

## Validation

| Check | Result |
| --- | --- |
| Full mobile suite, including arrival/photo/checklist/completion regressions | 398/398 passed |
| Full web suite | 414/414 passed |
| Focused Dispatch display regressions | 8/8 passed |
| Real-store note UI lifecycle/race regressions | 9/9 passed |
| Real Firestore note/replay + existing note/core cases | 9/9 passed |
| Targeted backend unit/projection cases | 6/6 passed |
| PW-NOTES-01 Chromium | Passed |
| Expo Doctor | 18/18 passed |
| iOS and Android Hermes exports | Passed |
| Local Android ARM64 release build | Passed |

The browser test submits/replays the same authenticated technician operation, verifies exactly one operation record, and checks the note in manager Dispatch after reopening. Dispatcher instructions, assignment, job status, appointment time, private fields and another tenant's job remain unchanged. The real backend tests also reject stale, reassigned, revoked and cross-company operations.

The original missing-draft behavior was reproduced before the fix. Tests use local emulators and native/storage boundaries; no acceptance email/SMS/push or financial transaction was sent.

## Build and installation

Android APK:

```text
routeLogisticsMobile/android/app/build/outputs/apk/release/app-release.apk
```

Built using the existing local Gradle release/signing workflow. No paid EAS build was started. At **10:50 AM Pacific on November 16**, `adb install -r` completed successfully on the connected Android device. Android enforced signature compatibility; the application UID and airplane-mode setting were unchanged. No uninstall, `pm clear`, credential reset or connectivity-setting change was performed. The app was not reconnected to flush existing queued work.

APK SHA-256: `F0E7EA08E62115C7370A1CFEE38EB71197F1698D5633010A6BB2B9618C6E09A4`. Ignored installation evidence is retained in `.migration/work-notes-install-result.json`. A fresh filtered offline backup was taken immediately before installation. Installation success does not verify note retention or synchronization on the handset.

The related web display correction publishes through the existing GitHub/Netlify workflow. Backend runtime and security rules do not require deployment for this repair.

For iOS, pull `main` on the Mac, enter `routeLogisticsMobile`, run `npm ci` and `npm run ios:prepare`, then rebuild the existing Xcode workspace with corporate team `AXCZ2G99P6` and bundle `com.worksidesoftware.routelogisticsapp`. Existing installations need the new binary; pushing source alone does not update them.

## Physical retesting — not complete

Use a dedicated authorized test job and its assigned account:

1. Keep airplane mode enabled. Enter a unique multiline work note and observe the device-save state.
2. Terminate/restart offline without selecting Save; reopen the same job and compare the full draft, including its last characters.
3. Repeat with rapid typing followed immediately by termination.
4. Select **Save work notes**, close/reopen, terminate/restart offline, and verify the queued text remains.
5. Switch field/management modes where allowed. Verify notes remain associated with the same job/account, and another job does not inherit them.
6. Confirm the previously queued arrival and captured photo still appear. Check checklist and completion drafts independently.
7. Reconnect when authorized. Confirm synchronization reaches **Saved to server** once and the exact note appears in web Dispatch under Work notes; job instructions remain separate.
8. Confirm restart after acknowledgement still shows the note while offline.
9. Exercise a safe synthetic sync failure/conflict; verify text remains and retry does not create a duplicate operation.

Physical acceptance remains pending until the actual device survives the offline restart and completes synchronization successfully. Installation, automated tests and bundle export do not satisfy that acceptance.

## Changed areas

- `routeLogisticsMobile/components/FieldWorkTools.js`: immediate draft persistence, scoped restoration, state/error feedback and explicit save/discard.
- `routeLogisticsMobile/components/JobWorkflow.js`: visible save-before-close dialog and awaited child draft actions.
- `routeLogisticsMobile/services/offline.js`: scoped draft APIs, stable queue integration, canonical cache reconciliation and deletion-summary safeguards.
- `routeLogisticsMobile/services/workNoteDraftCore.js`: ordered immediate writes and compare-and-set/archive mechanics.
- Mobile service/core/UI/close-workflow regressions.
- `routeLogisticsWeb/src/pages/DispatchPage.jsx` and related UI/browser regressions: distinguish instructions from canonical work notes.
- `tests/offlineNotes.integration.test.js` and root test-script integration.

Backend runtime, arrival/photo/checklist/completion authorization, Firebase infrastructure, signing identities and unrelated integrations were preserved.
