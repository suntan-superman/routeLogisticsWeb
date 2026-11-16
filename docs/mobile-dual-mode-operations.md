# Mobile field and management operations

Route Logistics uses one Firebase identity and the existing company membership.
Field/Management is local presentation state, never a role, custom claim or new
account. New eligible users start in Field Mode. The last choice is saved in
AsyncStorage by user UID and company ID; another identity cannot inherit it.
Current permissions are checked before restoring the preference or rendering
Management Mode. The shared capability policy is unchanged.

| Existing role | Field Mode | Management Mode | Temporary staff availability |
| --- | --- | --- | --- |
| Owner | Own assigned jobs, schedule and route | Existing company operations | Any active staff member, including self |
| Manager | Own assigned jobs, schedule and route | Existing permitted operations | Any active staff member, including owner/self |
| Admin | Own fieldwork | Existing dispatch/location capabilities only | No new override permission |
| Technician | Own assigned work only | Denied | Denied |
| Independent account | Existing independent workspace | No company dashboard | Not applicable |

## Field Mode and work preservation

Field-work eligibility is an independent company/UID flag. Owners/managers use
Management → Team → staff details → Field work settings to set **Can be assigned
field work** with an explicit confirmation. Existing staff default to enabled;
office-only staff retain their company permissions, existing appointments and
history, but are excluded from new assignment choices. The flag does not alter
shift/GPS consent or override temporary leave and schedule checks. It does not
remove access to completing work already assigned. Its editor captures the
opening revision and warns on unsaved changes; a stale save requires refresh.

Company staff all use TechnicianHomeScreen, ScheduleScreen, RouteScreen and the
same JobWorkflow. Owners/managers can be assigned without a second technician
membership. Personal reads use server `assignedTo: 'self'`, with separate query
and offline cache keys plus defensive client filtering. Owner route requests use
the owner UID; staff use their membership identity. Company-wide work belongs in
Management Mode.

Existing job details, customer contact/navigation, photos, service checklists,
notes, chemical records, visit evidence and completion are reused. The existing
durable offline queue, file copies, operation IDs, retries and authorization
checks are preserved. Mode changes do not synchronize or discard the queue.
Camera/save activity blocks switching. An unsaved work-order draft must be saved
or closed through its existing discard guard before changing modes. Work details
opened from Management Mode return to that management view when closed.

One WorkLocation controller stays mounted in the workspace; its compact duty
button sits at the right of the field Home header. OfflineStatus remains in the
retained field Home. Start/End Shift and app-open/background permission remain explicit.
Opening Management Mode or its map never activates GPS. Tap the header duty button for
Start/End Shift, location details and optional background sharing. Personal notifications/settings remain in the
Field Mode Settings tab.

## Management Mode

Use the header **Field | Management** selector. Management tabs are **Overview,
Team, Map, Schedule**. Overview shows selected-day scheduled/completed/in-progress/
unassigned work and current duty counts. Unknown or failed reads show unloaded
counts rather than zero; truncated data is identified as partial.

Team rows show staff identity, duty, assigned/completed/remaining jobs, manual
availability and GPS freshness. Details expose selected-day work, accuracy/update
time and a daily route. Saved route ordering includes newly assigned unsaved
stops and excludes removed stops. Schedule supports Today, previous/next day,
native date selection, all staff, individual staff and unassigned jobs. ISO
date-only values remain calendar dates in Pacific, Eastern and UTC zones.

Assignment/reassignment uses active eligible staff, including owners/managers.
Choose a job, choose staff, **Check assignment availability**, then **Confirm job
assignment**. The existing server scheduler rechecks membership, tenant, manual
availability, overlaps and saved job version. It preserves the service property,
time and audit history. Errors retain the draft and support retry. Same-tap
duplicates are blocked. The latest deployed scheduling engine is authoritative;
the older attachment's statement that overlaps are unimplemented is superseded.

Native new-job/estimate creation and full job editing continue on the existing
web workflow, with a visible link. This avoids presenting incomplete native
geographic-validation forms as functional (`GAP-MOB-GEO`). Geographic enforcement
is unchanged. Accounting, integrations, ownership and platform CMS are not added
to mobile Management Mode.

## Temporary staff availability

Mobile: **Management → Team → Technician details → Change staff availability**.
Web: **Dispatch** or **Team Locations → Change availability**.

Owners/managers can record sick leave, vacation, off-duty or other unavailable
periods, or a temporary emergency-available window. Times are quarter-hour device
local values sent as exact ISO instants. Each period is bounded (maximum 180
days); at most 32 active/future windows are retained. Changes use a captured
revision, tenant/actor rechecks, UID schedule locks and audit history.

Newer overlapping windows take precedence: an emergency window can temporarily
override vacation, then vacation resumes. Expired windows do not imply continued
unavailability. Restore normal availability clears all manual periods after
explicit review. It does not start a shift or restore access.

An unavailable period blocks new/reassigned appointments and suggested
alternatives. Repeated DST hours are conservatively blocked. Existing jobs are
preserved and remain visible for dispatcher review; they are not silently moved
or cancelled. Future recurring visits use the existing explicit fallback policy.
Marking staff unavailable now ends an active shift and stops its tracking session.
Returning to available requires the employee to explicitly restart sharing.
No role, membership, authentication account or GPS permission is elevated.
Revoked/inactive memberships cannot be reactivated through this control.

## Maps, refresh and privacy

The native team map uses SDK-54-compatible `react-native-maps` 1.20.1: Apple Maps
on iOS and the existing Google Maps project on Android. Only authorized roster
members introduce markers. Off-duty, stopped, invalid, future-dated and expired
positions are excluded. Stale authorized positions are grey and labeled
last-known, within company retention. Markers display identity, update time,
accuracy and next selected-day visit, with an action to open that schedule.
Initial fit runs once; **Fit visible team** recenters explicitly. Refresh does
not repeatedly recenter an inspected map. Opening a map issues no geocoding or
route-optimization requests.

TanStack queries share WorkQueryProvider and identity/company/role/membership
scope. Only visible, active screens poll at the existing 30-second interval.
Foreground/reconnect/date changes and explicit refresh reuse the same query
infrastructure. Successful changes invalidate the shared scope once. Hidden
screens do not add polling loops. Access errors hide denied data and invoke the
existing authoritative workspace check. Offline company snapshots are identified
as previously loaded; assignment/availability mutations require connectivity.
Offline freshness clocks still enforce location retention.

Reused endpoints: `rlReadWorkspace`, `rlManageJob`, `rlCheckAvailability`,
`rlGetRoutingTeam`, `rlGetDailyRoute`, `rlGetTeamLocations`, `rlWorkShift`,
`rlUpdateWorkLocation`, plus existing job/photo/checklist/chemical/visit/offline
operations. The narrow new callable is `rlManageStaffAvailability`; private
`rlStaffAvailability` documents are denied to direct clients by existing rules.
No new secrets or customer-specific credentials are required.

## Native builds

Corporate iOS identity/team/EAS project and Android package are unchanged.
A new native binary is required because the map adds native code. No cloud build
or store submission is started by this implementation.

Android local build (PowerShell, existing SDK/JDK):

```powershell
Set-Location C:\Users\sjroy\Source\routeLogistics
git pull --ff-only origin main
Set-Location routeLogisticsMobile
npm ci
npx expo prebuild --platform android --no-install
Set-Location android
.\gradlew.bat :app:assembleRelease --no-daemon --max-workers=2 --console=plain "-PreactNativeArchitectures=arm64-v8a"
```

APK: `routeLogisticsMobile/android/app/build/outputs/apk/release/app-release.apk`.
This follows the existing local signing workflow; it is not a Play Store upload.
The small JS prebuild plugin bounds CMake object paths after a confirmed Windows
260-character tool limit. New architecture and signing remain unchanged.

Set `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` on the Android build machine from
the **RouteLogistics-Android-Local** client key in the existing project. It is
restricted to Maps SDK for Android, `com.workside.routelogistics`, and the existing
local signing SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`.
The ignored local `.env` is configured here. Another signing certificate needs
its actual SHA-1 authorized before its Android map will load. Missing key
configuration shows an actionable message instead of mounting a crashing map.
Existing Firebase/browser/backend routing keys are preserved. No value is
committed. iOS uses Apple Maps and does not need this native Google key.

For a corporate TestFlight build, use the existing operator workflow from the
mobile directory: `eas build --platform ios --auto-submit`. Local Mac users can
continue `npm run ios` for prebuild/pods and Xcode development. Existing offline
data remains under the same identifiers; do not uninstall to test mode changes.

## Validation and physical acceptance

November 15 automated evidence:

| Check | Actual result |
| --- | --- |
| Functions | 174 passed, one existing emulator-only skip |
| Web UI/unit | 335/335 passed |
| Mobile | 267/267 passed; final native-config subset 3/3 |
| Full Firestore/Storage rules/integration | 440/440 passed |
| Final authorization/location/owner-manager parity subset | 38/38 passed; combined distinct rules/integration coverage 447 |
| Playwright Chromium smoke | 9/9 passed |
| Full browser matrix | 92/93 passed initially; Firefox PW-OPS-18 exposed reopening during save/refresh |
| Corrected availability journeys in three engines | 6/6 passed after the fix (Chromium, Firefox, WebKit) |
| Expo Doctor | 18/18 passed |
| iOS bundle export | Passed |
| Local Android ARM64 release | Passed; APK signature matches the restricted Maps certificate |
| Web lint/build | Passed; two existing Calendar/Reports hook warnings |

The Firefox defect is fixed by keeping the editor disabled until save and roster
refresh finish, and verifying the displayed revision before reopening. The
initial failure remains recorded; it is not represented as a clean 93/93 run.
Legacy location writes also recheck availability transactionally, and verified
personal responses preserve historical owner aliases without rewriting jobs.

Deployment is limited to affected Route Logistics functions and the existing
Netlify web build on main; no rules/index changes or integration redeployment are
required. Final deployment receipts are retained locally in .migration.
 Test fixtures are local/synthetic; no real email, SMS, push,
charge, accounting write or customer appointment is created by these checks.

Physical iOS and Android acceptance remains **Not Run** until performed:

1. Owner and manager: personal job → notes/checklist/photo/chemical/visit evidence
   → completion → Management → inspect team/map/schedule → Field.
2. Start a shift with explicit permission; switch modes; verify no consent reset,
   then End Shift and confirm collection stops and the dispatcher updates.
3. Technician: only Field Mode; forged preference cannot reveal management data.
4. Queue work/photos offline; attempt mode switch with drafts; restart, reconnect,
   synchronize once, and verify files/operation IDs/tenant isolation.
5. Manager: mark a disposable staff fixture sick/vacation; verify new scheduling
   is denied; overlay emergency availability and verify leave resumes afterward.
6. Verify map fit/marker details, stale/empty/error states, large text, dark/light
   mode, keyboard, safe areas and small screens; confirm no permission prompt is
   caused merely by opening Management Mode.

Use independently authorized disposable fixtures for any real mutation. Native
GPS, camera, background scheduling and OS-level map delivery are not proven by
emulators or a successful binary build.

## Source map

| Area | Main files |
| --- | --- |
| Mode/navigation and personal work | `WorkspaceScreen.js`, `WorkspaceTabs.js`, `WorkspaceModeSelector.js`, `mobileMode.js`, `useWorkQueries.js`, `firebase.js`, `ScheduleScreen.js` |
| Mobile management | `ManagementScreen.js`, `ManagementTeamMap.js`, `StaffAvailabilityEditor.js`, `managementPolicy.js`, `managementOperations.js`, `useManagementQueries.js` |
| Native configuration | `app.config.js` (task hunks only), `constants/nativeMapsConfig.js`, `plugins/withAndroidCmakePaths.js`, mobile package/lockfile and `.env.example` |
| Backend | `staffAvailability.js`, `scheduling.js`, `workData.js`, `routes.js`, `workTracking.js`, `locations.js`, `index.js` |
| Web availability | `StaffAvailabilityEditor.jsx`, `TeamLocationStatus.jsx`, `TechnicianAvailability.jsx`, `DispatchPage.jsx`, `TeamLocationsPage.jsx`, `workLocations.js` |
| Tests/docs | Mobile mode/management/config/renderer suites; availability and owner/manager integration suites; scheduler/rules/browser/UI regressions; master acceptance plan and this document |

Duty-header follow-up: mobile regression **284/284**, iOS export and local Android
ARM64 build passed. The new dialog is a JS overlay and leaves camera/work-order
navigation guards intact. No backend or web redeployment is needed. Details and
physical acceptance caveats are in [on-duty tracking](on-duty-tracking-and-dispatch.md).
