# Field reliability and job exceptions

Implemented November 16, 2026 on the existing `main` branch and Firebase project `mi-factotum-field-service`.

## Offline arrival failure and repair

The visit editor explicitly rejected offline saves before calling `rlJobVisit`. The existing durable queue supported job updates, photos, applications and service forms, but had no visit-event operation. The completion draft dialog correctly retained unsaved input but could not persist that visit evidence.

Arrival (`arrived`), departure (`departed`) and unsuccessful access (`access-blocked`) now use the same scoped, serialized AsyncStorage queue. The save awaits durable persistence before reporting **Saved on device — waiting to sync**. A storage failure leaves the visit editor and notes intact. Application, note, photo and checklist drafts remain independent.

Each saved visit retains its original operation ID, occurrence time, job/company/user/membership attribution, expected job revision and assignment, event type and note. GPS is optional. Only a valid permitted sample is included, with its own capture time and accuracy; missing GPS never becomes invented coordinates. Access-blocked reports require an explanation.

### Local persistence and replay

1. Confirm the cached job belongs to the current verified workspace and assignment.
2. Persist the immutable visit payload in that user/company/role/membership queue.
3. Show its local state alongside the visit controls and saved-work queue.
4. Replay through the existing foreground/reconnection drain; restart recovers persisted pending operations.
5. The server rechecks current company, membership, assignment, job revision and event validity in the transaction.
6. Commit the event, operation identity and original-time evidence summary atomically. Return the acknowledged job revision.
7. Replaying an identical accepted operation returns the original acknowledgement without another event.

The UI distinguishes waiting to sync, synchronizing, saved to server, failed/retry and conflict/management attention. A locally queued event is not labelled server-confirmed. Server reception time is separate from the technician's original occurrence time.

New delayed evidence is bounded to 30 days old and two minutes ahead of server time. A supplied GPS sample must be within five minutes of the original event time, rather than the eventual synchronization time. Older or invalid evidence remains available locally for reconciliation instead of being silently erased. Existing online clients retain their compatible record/list contract.

### Conflict and completion behavior

Queue dependencies serialize related writes to one job. An acknowledged local predecessor can advance the next operation's expected revision. A fresh online read alone never authorizes rebasing old evidence. Reassignment, revocation or unrelated online edits retain the original operation and surface a reconciliation error. Visit conflicts cannot be silently rekeyed, discarded or force-replayed over a newer assignment.

Completion waits behind earlier visit evidence and existing completion prerequisites. It reports success only after the authorized operation succeeds or its supported completion operation is durably queued. Queued evidence and unrelated work drafts survive opening/cancelling completion. No role, assignment or tenant check is bypassed to complete work.

## Appointment exceptions

One shared JavaScript derivation is used by web Dispatch and mobile Management Mode. It reads job data and the clock; it never writes a canonical job status, assignment or appointment time.

| Indicator | Rule |
| --- | --- |
| Potentially late | Scheduled start plus the default 30-minute grace period has passed, with no confirmed arrival or work-start evidence |
| Overdue | Scheduled appointment end has passed and the job remains unresolved |
| Reassignment requested | The job has a pending technician request |
| Needs attention | One or more operational indicators, or an existing assignment-attention flag |

The grace period is a utility option for future company configuration; this release does not add another settings form. The company timezone is used, with the existing scheduling fallback `America/Los_Angeles`. Spring-forward nonexistent wall times are left unclassified; repeated fall-back times use the later occurrence to avoid an early accusation. Invalid or missing schedules do not produce fabricated late times.

The label is **No arrival confirmed**. A technician may be working offline. When delayed evidence synchronizes, the summary uses its original occurrence time and the indicator recalculates. Confirmed arrival/work-start suppresses potential lateness; an unfinished visit can still be overdue after its scheduled end. Completed and cancelled jobs are not late or overdue.

The existing selected-service-date filters remain in force. Dispatch has compact exception counts and filters, with request details in its existing job drawer. Mobile Management has the same indicators/count filters, request review and existing assignment actions. These views refresh their data; no whole-page reload is introduced.

## Technician reassignment request

In mobile Job Details, **Assignment support → Request Reassignment** offers:

- Unavailable / emergency.
- Schedule conflict.
- Vehicle problem.
- Equipment or materials unavailable.
- Customer/property access problem.
- Other.

The technician can add up to 2,000 characters of explanatory notes, review and explicitly confirm. Submission requires the server connection; an unsuccessful attempt retains its reason, notes and original operation ID for retry. The request does not unassign the technician, cancel the appointment, change its time or discard work.

`rlJobException` supports `request`, `list`, `resolve` and `dismiss`. Private request, operation and audit collections preserve history. The job carries a safe pending summary for the existing authorized job reads. Request metadata does not advance the work revision, so it does not invalidate an unrelated technician work draft. Separate request IDs/revisions protect concurrent management decisions.

There is at most one pending request for that job and assigned actor. Repeated submission/replay does not create another request or notification. A later request is allowed after resolution if the actor remains assigned and authorized.

### Management review

Authorized assignment managers can inspect the job, reason and notes, then:

- Reassign with the existing server availability, field-work eligibility and schedule conflict checks.
- Resolve without reassignment, with an optional explanation.
- Dismiss with an optional explanation.

Successful reassignment atomically resolves the associated request and preserves job history, notes, photos, visit evidence and service forms. In-progress reassignment requires explicit acknowledgement that the started work and outstanding offline work were reviewed. The server rechecks that acknowledgement. The previous technician's unacknowledged offline evidence remains subject to reconciliation rather than becoming authorized on the new assignment.

Polling cannot silently retarget an open management decision to a newer job/request. Refresh and reopen the review when its revisions change. Resolution or dismissal alone leaves the assignment and appointment unchanged.

## Notifications and synchronization

The existing native notification outbox handles request alerts for tenant-authorized management recipients. The stable request identity suppresses duplicate alerts, and resolved/stale requests are checked again before sending. Push text is generic; explanatory notes remain in the authorized job view.

Reassignment uses the existing new-assignee notification and adds a removal notification for the previous active assignee. Assignment/removal respects the assignment preference; request alerts respect the status preference. A removal tap refreshes the current schedule without trying to reopen a job that the old assignee may no longer read. A management-request tap performs the normal authorized job read.

No automatic late/overdue push schedule is introduced. In-app indicators recalculate without producing an alert every poll. No SMS, email, Stripe or QuickBooks behavior is enabled or changed.

Existing TanStack Query scope keys, foreground/background behavior and reconnect refresh are retained. Successful request/resolve/dismiss and visit writes invalidate affected jobs/resources. Offline queue acknowledgements refresh those same views. Unrelated forms, drafts and scroll positions remain mounted.

## Authorization

- A verified, current assigned company actor with `jobs.work` can request reassignment.
- Management decisions and reassignment require the existing `jobs.assign` capability; technician membership does not acquire it.
- Server checks re-read company ownership/member status and account deletion state, including inside mutation transactions.
- Tenant IDs from callers cannot select another company's request or job.
- Request IDs/revisions and job expected versions protect concurrent changes.
- Request records and visit summaries are server-managed. Direct client writes cannot forge them.
- Device records and notification recipients stay private and tenant-scoped.

## Automated validation and release

| Verification | Result |
| --- | --- |
| Full mobile regression | 367/367 passed |
| Full web regression | 412/412 passed |
| Functions/operator unit commands | 198 passed; one emulator-only case skipped here and covered by the emulator run |
| Full Firestore/Storage security and integration run | 492/492 passed in a clean final run |
| Focused visit/location emulator cases | 20/20 passed |
| Focused request/rules emulator cases | 19/19 passed |
| Request → Dispatch → resolution browser scenario PW-OPS-22 | 3/3 passed across Chromium, Firefox and WebKit |
| Existing Chromium browser smoke suite | 11/11 passed |
| Existing Chromium dispatch assignment/reopen scenario PW-OPS-07 | 1/1 passed |
| Expo Doctor | 18/18 passed |
| iOS and Android Hermes exports | Passed after the final queue compatibility change |
| Local Android ARM64 release build | Passed; APK built through the existing Gradle workflow |

The first broad integration run passed 489/492. Two existing dual-mode fixtures still completed against a notes revision from before newly acknowledged visit writes; they now track each returned visit revision. A pre-existing recurring-assignment assertion expected an older eligibility message; its assignment/attention/replacement assertions remain intact. The clean full rerun passed all 492. No tests or authorization guards were disabled.

Mobile harness adapters were updated for the shared CommonJS policy and native operation dependency. The final suite includes process restart, old unsent job queues, lost acknowledgements followed by unrelated server edits, hidden/cancelled request drafts, duplicate taps and tenant revocation. Earlier diagnostic failures remain in ignored local logs.

The three-browser request scenario used authenticated emulator accounts and actual UI/API round trips. It verified replay, tenant separation and preservation of appointment status, assignment, work revision, date and time. The existing smoke suite also checked live query refresh without reload/lost drafts, roles, customer operations, portal OTP/provider switching and CMS publication against emulators. Local validation made no provider sends or production accounting writes.

### Production backend verification

The scoped deployment completed November 16. All eight affected functions are ACTIVE:

- `rlJobException` (new callable).
- `rlJobVisit`.
- `rlUpdateWorkLocation`.
- `rlReadWorkspace`.
- `rlManageJob`.
- `rlQueueNativeJobCreated`.
- `rlQueueNativeJobUpdated`.
- `rlDeliverNativePush`.

The narrow Firestore job-rule protection was published with the deployment. Runtime probes of `rlJobException`, `rlJobVisit` and `rlManageJob` returned HTTP 401 / `UNAUTHENTICATED` without credentials or mutations.

The 8:47 AM Pacific production audit confirmed exactly the eight expected function changes; every unrelated function was unchanged. All **509 customers, 11 existing jobs and two invoices** matched the pre-deployment document IDs and full-precision update versions. Existing integration safety flags were unchanged: sandbox accounting writes and production approval remain off, Stripe remains test-only and broad SMS remains disabled. No new provider test was sent. A read-only legacy-evidence check found no active Acme job with a pre-existing arrival record omitted from its arrival summary; historical visits were not rewritten.

Web publication is verified after pushing the implementation to the existing `main` branch. Installed native applications still require the rebuilt app.

## Physical Android and iOS acceptance — not yet executed

### Scope limits

- Visit evidence is durable offline work; reassignment requests currently require a connection. Closing an unconfirmed request editor does not cancel a submitted request. During the same work-order session, reopening retries the immutable attempt; reopening the job later reads its current server request status.
- Local queues remain bound to their original account/company/role/membership. Changing accounts does not authorize replay of the previous scope's saved work.
- A device that has lost assignment or membership cannot force old evidence onto the current job. Management reconciliation remains necessary; the device retains the original evidence.
- Arrival records and optional GPS corroborate the technician's report. They do not prove access to a property or that service was performed.
- Exception filters inspect the selected service date. No unattended overdue notification schedule or automatic appointment change is included.

### Device procedure

Use a dedicated synthetic job assigned to the test account. Do not repeat the earlier Android push test or send messages to customers as part of this procedure without a fresh explicit test budget.

1. Install the rebuilt app over the existing app; do not uninstall or clear app data containing pending work.
2. Open the synthetic assigned job online once, then enable airplane mode.
3. Record arrival without GPS, add an offline work note and select a photo. Verify separate **Saved on device** states.
4. Record departure and an access-blocked report with a test explanation. Verify their original times and optional GPS labels.
5. Background/terminate/reopen the app while still offline. Confirm all saved operations and the photo remain.
6. Reconnect. Confirm each operation reaches the server exactly once, keeps its original occurrence time and does not create duplicate visit records.
7. In a separate synthetic conflict case, queue evidence, reassign or change the job online, then reconnect the original device. Confirm the evidence remains with a conflict and no unauthorized replay.
8. Request reassignment, confirm the reason/notes and verify the appointment remains assigned and scheduled.
9. In web Dispatch and mobile Management, review the same request. With a separately authorized push test, check the generic manager alert and correct-job tap.
10. Check availability and reassign. Confirm the request resolves, both schedules update, prior work remains, and separately authorized old/new-assignee push taps behave correctly.
11. For an in-progress case, confirm management must explicitly review started work before reassignment.
12. Exercise potential-late/overdue filters with synthetic past appointments. Confirm no automatic status/time/assignment changes or repeated alerts.

Drawer/banner/sound, background OS scheduling, GPS/camera hardware and real handset restart behavior remain physical acceptance items. Emulator and bundle checks do not certify them.

## Rebuild procedure

Native JavaScript source changed. Pushing to GitHub does not update an already installed native app. Both Android and iOS require an updated build. Dependencies, package identifiers, EAS project, corporate team and signing configuration are preserved.

Android local release build in PowerShell, using the existing SDK/JDK/signing setup:

```powershell
Set-Location C:\Users\sjroy\Source\routeLogistics
git pull --ff-only origin main
Set-Location routeLogisticsMobile
npm ci
npx expo prebuild --platform android --no-install
Set-Location android
.\gradlew.bat :app:assembleRelease --no-daemon --max-workers=2 --console=plain "-PreactNativeArchitectures=arm64-v8a"
```

APK: `routeLogisticsMobile/android/app/build/outputs/apk/release/app-release.apk`. Use the established local install workflow, preserving app data. No paid EAS cloud build is needed.

On the Mac, pull `main`, enter `routeLogisticsMobile`, run `npm ci` and `npm run ios:prepare`, then open the generated `.xcworkspace` in Xcode. Use bundle `com.worksidesoftware.routelogisticsapp` and Workside Software LLC team `AXCZ2G99P6`; build/run or archive through the existing signing workflow. Preserve pending work on the installed app.

## Changed implementation areas

- Backend visit validation, evidence summaries and replay: `functions/workTracking.js`.
- Request mutations/history and assignment integration: `functions/jobExceptions.js`, `functions/workData.js`, `functions/scheduling.js`, `functions/index.js`.
- Shared exception derivation: `functions/shared/jobExceptions.js` and its web wrapper.
- Native queue, visit/completion UI and saved-work states: `routeLogisticsMobile/services/offline.js`, `offlineQueueCore.js`, `components/FieldWorkTools.js`, `JobWorkflow.js`, `OfflineStatus.js`.
- Native request/review UI: `components/JobReassignmentRequest.js`, `screens/ManagementScreen.js`, `services/jobExceptionOperations.js`, `managementOperations.js`.
- Existing native notification producer/client and scoped query-write invalidation.
- Web Dispatch, its targeted mutation invalidation and the minimal shared CommonJS build adapter.
- Firestore protected operational fields, regression tests, browser acceptance fixture and npm test integration.

No marketplace, new environment, new Firebase project, accounting integration, background exception scheduler or additional application framework was introduced.

## Changed files

- `docs/FIELD_RELIABILITY_AND_JOB_EXCEPTIONS.md`
- `docs/README.md`
- `docs/ROUTE_LOGISTICS_MASTER_ACCEPTANCE_TEST_PLAN.md`
- `firestore.rules`
- `functions/index.js`
- `functions/jobExceptions.js`
- `functions/nativePush.js`
- `functions/nativePush.test.js`
- `functions/scheduling.js`
- `functions/shared/jobExceptions.js`
- `functions/shared/jobExceptions.test.js`
- `functions/workData.js`
- `functions/workData.test.js`
- `functions/workTracking.js`
- `package.json`
- `routeLogisticsMobile/components/FieldWorkTools.js`
- `routeLogisticsMobile/components/JobReassignmentRequest.js`
- `routeLogisticsMobile/components/JobWorkflow.js`
- `routeLogisticsMobile/components/OfflineStatus.js`
- `routeLogisticsMobile/screens/ManagementScreen.js`
- `routeLogisticsMobile/scripts/fieldWorkTools.test.js`
- `routeLogisticsMobile/scripts/jobCompletion.test.js`
- `routeLogisticsMobile/scripts/jobExceptionRequests.test.js`
- `routeLogisticsMobile/scripts/jobWorkflow.test.js`
- `routeLogisticsMobile/scripts/managementScreens.test.js`
- `routeLogisticsMobile/scripts/nativePush.test.js`
- `routeLogisticsMobile/scripts/screens.test.js`
- `routeLogisticsMobile/scripts/syncLocation.test.js`
- `routeLogisticsMobile/scripts/workQueries.test.js`
- `routeLogisticsMobile/scripts/workspace.test.js`
- `routeLogisticsMobile/services/jobExceptionOperations.js`
- `routeLogisticsMobile/services/managementOperations.js`
- `routeLogisticsMobile/services/nativePush.js`
- `routeLogisticsMobile/services/offline.js`
- `routeLogisticsMobile/services/offlineQueueCore.js`
- `routeLogisticsMobile/services/workQueryEvents.js`
- `routeLogisticsMobile/services/workspacePolicy.js`
- `routeLogisticsWeb/src/pages/DispatchPage.jsx`
- `routeLogisticsWeb/src/services/workspaceQueryPolicy.js`
- `routeLogisticsWeb/src/services/workspaceQueryPolicy.test.js`
- `routeLogisticsWeb/src/utils/dispatchMap.ui.test.js`
- `routeLogisticsWeb/src/utils/jobExceptions.js`
- `routeLogisticsWeb/vite.config.js`
- `tests/browser/operations.spec.js`
- `tests/dispatch-exceptions.ui.test.js`
- `tests/job-save-navigation.ui.test.js`
- `tests/jobExceptions.integration.test.js`
- `tests/mobileDualMode.integration.test.js`
- `tests/recurringCalendar.integration.test.js`
- `tests/scheduling.rules.test.js`
- `tests/visitOffline.integration.test.js`
