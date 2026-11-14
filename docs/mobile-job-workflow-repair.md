# Mobile job workflow repair

**Current iOS signing:** See [corporate signing migration](ios-corporate-signing.md). Its new bundle identifier installs a separate app; the old installation's local queues/photos do not migrate automatically. Earlier signing/install-over instructions below describe the previous identity.

Implemented on the existing `main` branch for Expo SDK 54 / React Native 0.81.5.
Physical iPhone verification is still required. No production job, customer,
membership, mi Factotum function or security rule was modified by this repair.

## Findings and changes

The old Details, Completion and Confirmation native modals could all be visible
at once. Each details/completion/edit branch mounted its own photo component.
Opening Details and date/time pickers also depended on 100 ms timeouts. A job-read
error could clear the selected job while the native camera/gallery was active.
Completion had no submission lock or visible loading state and discarded useful
error details.

The job list, Details, completion/review, scheduling/editing and date/time panels
now use ordinary views. One JobWorkflow owns a selected job and exclusive child
pages; one JobPhotos instance stays mounted across those pages. Closing Details
returns to the job list, and another tap opens the same or a different job without
waiting for a native modal dismissal. Unrelated administration modals remain.

Native picker/permission interactions suspend automatic focus/poll refresh until
their owner releases them. Temporary read errors retain job context. Confirmed
assignment removal or permission denial still closes private job details with an
explanation; all server assignment/tenant checks remain enforced.

Camera and library flows use the installed Expo ImagePicker 17 image-only options,
without editing or a lens-mode override. Camera permission denial produces Settings
instructions. Selection/cancellation returns to Details. A selected photo and its
metadata remain available until a durable, scoped local copy and queue row exist.
Compression/storage failures retain a retryable draft; queued/uploading/failed
states are visible, and failed uploads can be retried. Closing or starting another
step requires saving or explicitly discarding an unsaved selected photo.

Completion validates the current job, verified workspace, assignment, work
description and optional hours, then preserves one durable operation identity.
Duplicate taps share the same submission. Online completion reports synchronized
or queued status; offline completion reports queued status. Failed/conflicting
operations keep their details and actual reason for review/retry, and do not mark
the displayed server job completed. Polls and offline sync refresh the list; it
shows job status and pending/error sync state. A later server reopen/cancellation
supersedes an earlier local completion result.

The installed iOS picker implementation resolves its result before native
dismissal finishes. This supports removing competing native presentations; it
does not prove that BackDual/BackAuto, FigCaptureSourceRemote -17281 or constituent
device messages are the cause of the reported camera issue. No Swift/native-code
or dependency workaround was introduced for those messages.

## Validation

- 53 mobile tests pass: camera/gallery selection and cancellation, retained photo
  drafts, queue/upload outcomes, retry, duplicate taps, completion success/failure,
  authorization rejection, modal restoration/reopening, late callbacks, scoped
  polling and offline behavior.
- 53 Firestore/Storage/fieldwork/access emulator tests pass, including current
  membership/assignment checks, tenant isolation and authenticated photo access.
- Expo Doctor: 18/18 checks pass.
- iOS Hermes export passes. This is a JavaScript bundle check, not an Xcode build
  or physical-camera test.

## Exact Mac rebuild procedure

From the existing repository checkout, stop the old Metro process, then run:

```bash
git switch main
git pull --ff-only origin main
cd routeLogisticsMobile
npm ci
npm test
npx expo install --check
npx expo-doctor
npx expo export --platform ios --output-dir ../.migration/ios-workflow-check
npm run ios:prepare
open ios/*.xcworkspace
```

Use the existing Xcode signing team, scheme and bundle identifier
`com.workside.routelogistics`. Keep the existing EAS project and Firebase client
configuration. In Xcode, select **Product → Clean Build Folder**, select the
connected iPhone and **Product → Run**. Install over the existing app to preserve
its queued work and photos. `ios:prepare` regenerates/updates iOS configuration and
runs CocoaPods without `--clean`.

For a development build that loads JavaScript from Metro, restart it from the
mobile folder with `npx expo start --dev-client --clear` and reload that development
client. An installed release must be rebuilt in Xcode to embed these JavaScript
changes. No new environment variables or Firebase deployment are needed.

## Required iPhone acceptance check

Use an authorized technician and assigned test job. Open/close/reopen Details,
capture a camera photo, cancel the camera, select/cancel a gallery photo, and
verify saved/uploaded or queued status. In airplane mode, queue a photo and
completion, reconnect, and verify authorized synchronization. Enter completion
details, review, double-tap confirmation, and verify one completion operation and
the updated list status. Exercise a visible upload/completion failure and retry
without losing job context. Close Details, reopen that job and then another job.
Verify an unassigned/cross-company job still cannot be modified.

Do not declare the physical camera or dismissal defects resolved until this
sequence succeeds on the affected iPhone and iOS version.
