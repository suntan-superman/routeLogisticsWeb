# On-duty tracking, visit evidence and Dispatch improvements

November 13, 2026. Existing `main`, Firebase project `mi-factotum-field-service`.

**Current iOS signing:** [Corporate signing migration](ios-corporate-signing.md) changes the bundle identifier and creates a separate app. The install-over instructions in this earlier report apply only to builds with the same identifier. Synchronize the old app's work/photos and end its shift before switching.

## Operator workflow

The company owner opens **Team Locations → Location policy**, selects **1, 3 or 5 minutes**, and saves the interval. The default is three minutes. Existing active shifts receive a changed interval on their next successful update. Last-location retention remains a separate owner setting; this release does not change Acme's stored policy automatically.

On mobile, open **Home → Work shift → Manage → Start shift** and confirm sharing. Select background sharing and grant the device's Always/background location permission to continue while the app is backgrounded or the phone is locked. App-open sharing is available without background consent. No job has to be in progress. **End shift** remains accessible while offline or while access is being checked, stops local collection first and removes only unsent optional GPS samples. Saved work, application and photo queues are untouched. If the server cannot be reached, its duty status needs a reconnect/End shift confirmation; the device does not resume tracking automatically.

The shift controls are an explicit on-duty tracking boundary, not payroll timekeeping. Shifts expire after twelve hours to bound forgotten sessions. Starting or resuming collection requires confirmation; signing in or installing an update does not start a shift. Sign-out, an account/company/role/membership change, revoked permission, confirmed authorization failure, expiry or End shift stops collection. Existing older clients retain their original job-only behavior until rebuilt.

Dispatch and Team Locations show **On duty / Off duty** separately from **current GPS / update overdue / waiting for first fix / stopped**. Capture time and accuracy accompany the last fix. A delayed upload never becomes a newly captured position. Dispatch refreshes every thirty seconds while visible. **Find nearby on-duty staff** ranks recent positions with accuracy at most 200 m by approximate straight-line distance to the mapped job, and uses the existing authorized assignment operation. This is not driving time or an availability guarantee.

## Job and visit records

Job Details provides **Arrived**, **Departed**, and **Couldn't access property**. Access-blocked reports require a reason. Records are append-only with authenticated staff identity, server receipt time, source and available capture time/accuracy. Manual recording requires connectivity and retains its note/payload for safe retry. It does not silently queue an unconfirmed event or change the job's operational status. Existing foreground location permission can attach a fresh fix; this action does not silently request new tracking permission.

While a shift is sharing, the server can infer proximity events for eligible assigned jobs that already have valid site coordinates. It uses accurate fresh fixes (accuracy at most 50 m), entry within 100 m including uncertainty, exit beyond 200 m excluding uncertainty, and state-based deduplication. It checks at most 100 assigned job candidates per fix and exposes coverage/error information to the tracking response. In-progress work can span dates; scheduled/en-route matching uses company time zone, or adjacent UTC dates when no company time zone is configured. Old/out-of-order/coarse fixes cannot infer a new arrival or departure.

These are sampled observations, not continuous geofences. Visits between samples can be missed; arrival/departure time is the observed sample time. GPS proximity does not prove entry, denied property access, or work performed. A denied-access reason and relevant job photos provide additional context. Raw position coordinates are not copied into immutable visit history.

Address points resolved for the Dispatch map are approximate road-access coordinates held in its browser session; they are not silently saved as authoritative site coordinates. Automatic proximity events therefore require existing saved job/customer coordinates. Manual visit reporting remains usable when coordinates are missing. Accurate site pinning remains a separate follow-up.

## Dispatch map and details

**Show dispatch map** now resolves the visible jobs automatically and fits their status-colored markers, with distinct staff markers. Existing coordinates require no address request. Address lookup uses the already configured Maps JavaScript Routes library, normalizes numeric/functional Maps coordinate types, caches addresses and bounds each lookup to 25 unique addresses. Polling unchanged jobs does not repeatedly charge for lookup. Larger lists expose the next batch; failed/zero-result addresses expose an explicit retry. Missing points produce an informative overlay rather than a silently empty national map. This does not require enabling another Maps API or changing keys.

The job-count text is centered vertically with its map controls. Clicking a job card or job marker immediately opens a right-side Job Details panel, including photos and visit records. The panel has its own scroll, mobile-width layout, close/backdrop/Escape handling, keyboard focus containment/return and body-scroll cleanup. It no longer sits below the entire job list. The daily route planner remains available through the existing route action.

## Phone formatting

Mobile Settings formats North American personal phone input as `(661) 555-0123`, supports pasted `+1` numbers, and shows a phone keyboard. Explicit international numbers and legacy short display values are preserved. Company phone information remains read-only for staff. Existing dirty profile fields survive refresh.

## Backend and storage boundary

- `rlWorkShift`: own status/start/end, explicit consent, active membership and bounded expiry.
- `rlSetLocationPolicy`: actual company owner only; allowed intervals 1/3/5.
- `rlUpdateWorkLocation`: own authorized shift/session; strict numeric coordinates/accuracy, bounded capture timestamps and monotonic fix reconciliation. Legacy job sessions retain their checks.
- `rlGetTeamLocations`: manager/admin/owner only, current same-company active roster, separate duty state and coordinate-only compatibility list.
- `rlJobVisit`: current authorized job access, append-only idempotent records; no client-supplied role/company/server timestamp overrides.

`rlWorkShifts`, `rlLocations`, `rlJobVisits` and `rlJobVisitStates` remain closed to direct client reads/writes by the existing Firestore deny-by-default rules. Callables enforce tenant, current membership, role and assignment. Location cleanup removes expired raw fixes while preserving an authorized shift/session until its bounded expiry. It does not remove visit evidence, job operations or photos.

The mobile GPS-only outbox is project/account/company/role/membership scoped, limited to sixty samples and bounded by the active shift. Native callbacks are throttled by actual capture timestamps to the owner interval, including high-frequency iOS callbacks. Missing/non-numeric accuracy is rejected rather than presented as perfect accuracy. End shift clears durable consent before network work, so an offline stop cannot be undone by a later OS callback. This storage is separate from durable job/photo/application queues.

No mi Factotum functions, Firebase project, application identifiers, EAS project or credentials are changed. Only Route Logistics functions are deployed. The visit-history composite index is created individually, without deploying or deleting other projects' shared indexes.

## Native rebuild and device behavior

New direct dependency: **`expo-task-manager ~14.0.9`**, selected by Expo SDK 54. The existing `expo-location` plugin now declares iOS background location and Android background/foreground-service permissions. The TaskManager handler is registered at module scope before the React app. Native indicators are enabled: iOS location indicator and Android persistent shift notification.

The interval is a target; iOS/Android can delay background delivery, and force-quitting can stop it. A stale position remains visibly stale. Background behavior requires a real development/release build and device permission; Expo Go and JavaScript bundle export cannot certify it. See [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/) and [TaskManager](https://docs.expo.dev/versions/latest/sdk/task-manager/). Maps lookup types follow Google's [Routes JavaScript reference](https://developers.google.com/maps/documentation/javascript/reference/route).

Stop the app and Metro on the Mac. From the existing repository root:

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

Select the existing Route Logistics scheme/team and physical device in Xcode, **Clean Build Folder**, then **Run**. Install over the existing app to preserve saved work/photos. Do not uninstall or clear app data. Start the development server separately with `npx expo start --dev-client --clear`. Android also needs a native rebuild (`npm run android -- --device`). A JavaScript reload of the previous binary cannot add TaskManager or background permissions.

Physical acceptance must verify each interval while moving and stationary, background/locked-screen behavior, permission denial/revocation, offline End, sign-out/account changes, expiry, GPS freshness, geocoded-site entry/exit, manual access-blocked/photo evidence, and Dispatch map/drawer keyboard/mobile layout. This release is not device-certified until those checks pass. No live employee shift or test financial transaction is started by automated validation.

## Validation and deployment

Validation completed: **132 mobile tests**, **50 web tests**, **27 Functions unit tests**, **102 Firestore/Storage/workflow emulator tests**, and **6 Auth/Functions E2E tests** passed. Expo Doctor passed **18/18**, dependency compatibility passed, the web production build passed, and iOS/Android Hermes bundles exported successfully. Expo config introspection verified the unchanged bundle/EAS identifiers, iOS location background mode and Android background/foreground-service permissions. The screen/access inventory has 69 unique identifiers. Maps tests use provider stubs and make no paid API calls.

Local evidence is retained in ignored `.migration/shift-*-final.log` / `.migration/shift-functions-tests.log` / `.migration/shift-expo-*.log` files. The new production visit-history index `CICAgLjIzo8K` is **READY**; it was created individually and no other index was modified/deleted. The new `rlWorkShift`, `rlSetLocationPolicy`, and `rlJobVisit` endpoints are active in `us-central1`; controlled unauthenticated requests returned **401 UNAUTHENTICATED** for all three without creating shifts or records. Deployment uses only `functions:routelogistics` in `mi-factotum-field-service`.

Production deployment completed: 61 Route Logistics functions, zero errors. Public production assets were checked after the main push and include the automatic Dispatch lookup, fixed side panel, duty roster and owner interval form. A CI dependency mismatch was also corrected: backend/rules/E2E checks stay in their own job, and web UI tests run only after their existing web/mobile test dependencies are installed. No application dependency was added for that CI repair.
