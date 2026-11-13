# Route Logistics approved screen and access policy

Updated November 13, 2026. Project: `mi-factotum-field-service`. Branch: `main`.

The owner's Role-Based Access Control and Dispatch Board directive supersedes the earlier proposed inventory. The approved capabilities are in [capabilities.json](../functions/shared/capabilities.json), used by the Functions, web and mobile code. The complete spreadsheet inventory is [screen-access-review.csv](screen-access-review.csv).

## Approved roles and scopes

| Role | Scope | Operations | Finance | Governance |
| --- | --- | --- | --- | --- |
| Owner | Actual company owner | Full company operations | Invoices, payments, revenue, financial reports, exports | Company configuration, team, ownership transfer, integrations administration |
| Admin | Active company membership | Full company operations | Invoices, payments, revenue, financial reports, exports | Read company; no owner privileges |
| Manager | Active company membership | Customers, scheduling, dispatch, routes, estimates, service pricing, application records, operational reports | No invoices, balances, revenue, financial reports or customer/job exports | Read company; no owner privileges |
| Technician | Assigned jobs and own route | Contact/site information, work status/notes, application details, photos, navigation, opt-in foreground location | No financial fields, history, exports or financial screens | No customer creation, team administration or company creation |

The future dispatcher profile is reserved and disabled. Roles are never compared numerically. Ownership is checked against the actual company record. Pending, unverified, inactive, removed and unresolved workspaces fail closed. Existing active memberships are not changed by this implementation.

## Backend boundary

- `rlReadWorkspace` checks current membership and assignment and returns allowlisted job, customer, company, photo and application-log responses. Technicians cannot read raw job/customer documents. Managers receive operational prices but no invoice balances, revenue or financial history.
- `rlManageJob` authorizes scheduling/assignment, validates same-company customers and active assignees, supports optimistic versions, and records an audit entry. Technicians use `rlApplyJobOperation`, which permits work fields and revalidates each queued operation, including idempotent retries.
- `rlRecordApplication` authorizes the job and makes application submission idempotent. Customer/site attribution is derived server-side.
- `rlJobPhoto` checks current job access on upload and every read. New objects are private and have no permanent Firebase download tokens. Direct company Storage access is denied to technicians/managers. Existing legacy files are preserved; previously distributed bearer download URLs cannot be recalled by this change.
- Firestore and Storage rules enforce current verified membership and role. Financial documents require owner/admin. Unscoped legacy documents retain legitimate personal ownership access, while RL-associated users cannot use unscoped paths to bypass their company restrictions.
- `rlCreateCompany` requires a verified independent workspace and checks existing ownership, memberships and invitations. Signup creates a personal login first; staff explicitly accept their invitation. Passwords, verification and acceptance are not bypassed.

## Web and dispatch

Navigation and direct URL guards share `routeCapabilities`. Technician home is My Work. The Customers, Jobs management, Calendar, Dispatch, Team Locations, Service Plans and report destinations are unavailable to technicians. Daily Routes gives technicians their own read-only route through My Work. Manager reports use a separate operational view. Owner/admin financial views remain available.

The Dispatch Board provides service-date selection, technician/status/service-area filters, an unassigned list, assignment/reassignment, status-colored map pins, job details, navigation, and each technician's route planner. Route optimization/save uses the existing routing implementation. Last shared positions are labeled live, stale, unavailable or sharing-disabled and show timestamps. Schedule warnings use service date/start/window data, not invented traffic arrival predictions. Without a company time zone, schedule warnings use the browser's time zone.

Maps loads on request. Missing addresses are resolved through the existing Routes library in user-requested batches of up to 25, with a session cache. Road-access coordinates are labeled approximate. No Maps requests run as part of automated tests. Dispatch reads up to 500 jobs per date; the route planner reads up to 100 eligible stops and saves up to 25 per route. Truncation is reported in the UI.

## Native workflow and offline data

Mobile keeps the existing bundle identifier, EAS project, Firebase client configuration and Expo SDK. It uses the shared capability policy, safe workspace responses, company identity/services, local appearance preferences and existing email OTP login. Technician Home provides assigned jobs, own daily route/navigation, en-route/start/complete, work notes, application details, photos and explicit foreground sharing.

Native jobs, photos and application logs use persistent queues and reauthorize on synchronization. Queues are scoped to identity/company/role/membership; old rich read caches and obsolete session caches are purged without deleting unsynchronized work. Caches from previous roles are removed on online workspace refresh. An offline device cannot learn of remote revocation until it reconnects; all writes and authenticated media fetches are checked online. Previously downloaded information cannot be remotely recalled.

The browser uses memory-only Firestore caching and persists assigned-job work updates separately for reconnect synchronization. It no longer reads the old shared Firestore IndexedDB cache. That legacy database is retained because it may contain unsynchronized writes; recovering any such older writes requires explicit review before site data is cleared. Browser photo uploads and application submission currently require connectivity; the native app queues all three. There is no background location tracking. Manager operational report export and existing native estimate-to-job/PDF placeholders remain unimplemented.

## Complete screen and action inventory

Each row preserves the original inventory identifier. “Company” includes current membership checks; technician “Assigned” always means current assigned work. Public/own-account screens do not grant company authority.

| ID | Platform | Screen or action | Owner | Admin | Manager | Technician |
| --- | --- | --- | --- | --- | --- | --- |
| W01 | Web | Landing | Public | Public | Public | Public |
| W02 | Web | Login | Own | Own | Own | Own |
| W03 | Web | Invitation signup | Own | Own | Own | Own |
| W03.owner | Web | New-business signup / company creation | New independent owner only | No for existing staff | No for existing staff | No for existing staff |
| W04 | Web | Accept invitation | Own invitation | Own invitation | Own invitation | Own invitation |
| W05 | Web | Customer portal | Customer identity only | Customer identity only | Customer identity only | Customer identity only |
| W06 | Web | Privacy | Public | Public | Public | Public |
| W07 | Web | Dashboard operations | Company | Company | Company | Assigned work |
| W07.finance | Web | Dashboard financial summary | Yes | Yes | No | No |
| W08.read | Web + Mobile | Company information/services | Read | Read | Read | Read |
| W08.edit | Web | Company details/services/branding | Edit | No | No | No |
| W08.team | Web | Team administration | Yes | No | No | No |
| W08.transfer | Web | Ownership transfer | Yes | No | No | No |
| W09.read | Web + Mobile | Customer list/details | Company | Company | Company | Assigned customer details only |
| W09.notes | Web + Mobile | Customer notes/contact fields | All | All | All | Work-required contact/site notes only |
| W09.edit | Web + Mobile | Customer add/edit/deactivate/restore | Yes | Yes | Yes | No |
| W09.import | Web | Customer import | Yes | Yes | No | No |
| W09.export | Web | Customer export | Yes | Yes | No | No |
| W09.delete | Service layer | Permanent customer deletion | Yes | Yes | No | No |
| W09.finance | Web | Customer spend and revenue | Yes | Yes | No | No |
| W10 | Web | Estimate Templates | Manage | Manage | Manage | No |
| W11.read | Web + Mobile | Jobs / Job Details | Company | Company | Company | Assigned only |
| W11.schedule | Web + Mobile | Job create/edit/assign/delete/follow-up | Yes | Yes | Yes | No |
| W11.work | Web + Mobile | Start/complete and work notes | Company | Company | Company | Assigned only |
| W11.cancel | Web + Mobile | Job cancel/reopen | Yes | Yes | Yes | No |
| W11.finance | Web + Mobile | Job prices / change history | Yes | Yes | Operational quote/schedule prices only | No |
| W11.photos | Web + Mobile | Job Photos | Company | Company | Company | Assigned only |
| W11.photo-delete | Web / data layer | Photo deletion | Yes | Yes | Yes | No |
| W11.logs | Web + Mobile | Chemical application records | Company | Company | Company | Assigned read/add only |
| W11.export | Web | Job export | Yes | Yes | No | No |
| W12 | Web | Calendar | Company + schedule | Company + schedule | Company + schedule | No web calendar; assigned schedule in My Work/mobile |
| W13.read | Web | Daily Routes view/navigation | Company | Company | Company | Own route |
| W13.edit | Web | Daily Routes reorder/optimize/save | Company | Company | Company | No |
| W14 | Web | Team Locations | Company | Company | Company | No |
| W14.retention | Web | Location retention | Yes | No | No | No |
| W15 | Web | Service Plans | Manage | Manage | Manage | No plan access; assigned generated visits only |
| W15.export | Web | Application-log export | Yes | Yes | Yes | No |
| W16.read | Web | Invoices view/print | Yes | Yes | No | No |
| W16.edit | Web | Invoice actions / payment dialog | Yes | Yes | No | No |
| W17.operations | Web | Operational reports | Yes | Yes | Yes without financial data | No |
| W17.finance | Web | Financial reports | Yes | Yes | No | No |
| W18.read | Web | QuickBooks status/preview/reconcile | Yes | Yes | No | No |
| W18.edit | Web | QuickBooks administration/export | Yes | No | No | No |
| W19 | Web | Notifications / push enrollment | Own | Own | Own | Own |
| M01 | Mobile | Login | Own | Own | Own | Own |
| M02 | Mobile | Signup | New-owner onboarding | Invitation login only | Invitation login only | Invitation login only |
| M03 | Mobile | Email Verification | Own | Own | Own | Own |
| M04 | Mobile | Workspace Access | Own invitation | Own invitation | Own invitation | Own invitation |
| M05 | Mobile | Home | Company | Company | Company | Assigned work |
| M06 | Mobile | Settings | Own + company edit link | Own + company read | Own + company read | Own + company read |
| M07 | Mobile | Service Selection | Independent workspace only | No company editing | No company editing | No company editing |
| M08 | Mobile | Splash file / loading-error states | Own session | Own session | Own session | Own session |
| M09 | Mobile | Menu | Own + manage | Own + manage | Own + manage | Sign out only |
| M10 | Mobile | Customers dialog | Manage | Manage | Add/edit; no permanent delete | Assigned details through job only |
| M11 | Mobile | Schedule Service dialog | Yes | Yes | Yes | No |
| M12 | Mobile | Schedule dialog | Company | Company | Company | Assigned only |
| M13 | Mobile | Job Details dialog | Company | Company | Company | Assigned without financial fields |
| M14 | Mobile | Completion and confirmation | Company | Company | Company | Assigned only |
| M15 | Mobile | Edit Job dialog | Yes | Yes | Yes | No |
| M16 | Mobile | Estimates / create / templates | Manage | Manage | Manage | No |
| M17 | Mobile | Customer/service/date/time pickers | Yes | Yes | Yes | No |
| M18 | Mobile | JobPhotos | Company | Company | Company | Assigned only |
| M19 | Mobile | WorkLocation | Own opt-in | Own opt-in | Own opt-in | Own opt-in |
| M20 | Mobile | OfflineStatus | Own | Own | Own | Own authorized work |
| W20 | Web | Dispatch Board | Company | Company | Company | No |
| W21 | Web | My Work | Own/company | Own/company | Own/company | Assigned only |
| M21 | Mobile | My daily route / Field work | Company work | Company work | Company work | Assigned only |

## Validation and deployment status

Automated checks: 24 function unit tests, 31 web tests including rendered customer controls/direct route capability checks, 91 Firestore/Storage/backend integration tests, 6 Auth/Functions emulator end-to-end tests, and 13 mobile tests. Expo compatibility: 18/18 doctor checks and SDK dependency check pass. iOS/Android Hermes exports pass. Web build passes; lint has no errors and existing Hook/large-bundle warnings remain. Final regression checks are recorded in the implementation report before deployment.

The end-to-end suite identified a legacy attribution-trigger regression: its synthetic authorization omitted the account's verified-email property. The RL trigger now uses the actual Auth account verification state and skips disabled/unverified accounts; it does not trust client-provided verification.

Deployment is pending final regression checks. Production baseline: all 507 Acme customer records and six membership records fingerprinted read-only, together with deployed function metadata. Deployment must compare these fingerprints afterward, preserve all non-RL functions, keep Stripe test mode with live approval false, and keep QuickBooks disabled.

On the Mac, pull main, run `npm ci` in `routeLogisticsMobile`, run `npm run ios:prepare`, open `ios/*.xcworkspace`, clean the Xcode build folder and rebuild. The prior missing ExpoSystemUI module requires a native rebuild; Metro reload alone is insufficient. Physical-device checks remain: Luis's restricted Home/Settings, assigned navigation, camera/offline application sync, appearance persistence, OTP, and explicit sharing stopping on background/job completion. No invitation reissue is necessary.
