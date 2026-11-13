# Route Logistics screen and access review

Audit date: November 13, 2026. Project: `mi-factotum-field-service`. Branch: `main`.

This is a decision document, not an approved new permission policy. It inventories every routed web page, every mobile screen file, and the dialogs that add capabilities. The proposed role mapping is also available in [screen-access-review.csv](screen-access-review.csv) for spreadsheet review. Leave the decision column blank until the owner approves or edits a row.

## Production findings

- Luis Gonzales (`tech3@route-logistics.com`) has one active Acme membership, with role `technician`, a matching membership ID in his Firebase claims, verified email, and the correct company in both profile association fields. This was read directly at 20:11 UTC on November 13. His invitation is now accepted; another invitation is unnecessary.
- The deployed Firestore rules match the local `firestore.rules` file. The live rules release was updated at 07:55 UTC on November 13.
- A technician cannot create, edit, deactivate, restore, or delete company customers under those rules. The customer page nevertheless displayed management buttons and opened the forms. This change hides those controls, guards the forms and mutation handlers, and preserves owner/admin/manager management access.
- There is a separate, substantive permission issue: technicians currently can read company-wide customers, jobs, estimates, templates, invoices, plans, and service logs. This includes financial fields present in those documents. The web dashboard, reports, exports, and job/calendar views expose much of that information.
- Direct Firestore job updates allow a technician to change permitted work fields on **any job in their company**, not only assigned jobs. The mobile job-operation callable enforces assignment; the direct database rule is broader. Narrowing only the UI would leave this gap.
- The web sidebar lists all 13 staff destinations for every signed-in user. Web route protection checks authentication, not role. Individual pages and server operations have different restrictions; seeing a sidebar entry does not establish that every action succeeds.
- All 507 Acme customers remain present. This audit performed zero production writes and sent zero invitations or other emails. It did not modify memberships, customer data, Firestore rules, or Cloud Functions.

Local evidence, excluded from Git: `.migration/screen-access-audit.json`.

## Account terminology and company creation

The invitation formerly mentioned mi Factotum because both apps share Firebase Authentication and an existing password can be reused. That implementation detail has been removed from the invitation text.

“Create a team account” was a misleading label for **creating a personal login to accept an invitation**. The invitation link preserves its return path through signup. That signup branch does not create a company or select a role. It is now labeled “Create your login,” and the disabled company-name field is removed from invitation signup. Email verification and explicit acceptance remain required.

The ordinary `/signup` path without an invitation return path is a different flow: it creates a new login and a company shell for a new business owner. Existing Acme staff should use their invitation or sign in, not register a second business. Luis's current profile already has `companyId`, so the company-create rule prevents him from creating another company. However, that rule tests the profile's `companyId`, not all membership states or `rlCompanyId`; pending/unresolved staff need an explicit policy and consistent enforcement across signup, company creation, and workspace resolution.

## Reading the inventory

- **Owner** means the actual `companies.ownerId`, not a selectable invitation role.
- **Management** currently means owner, admin, or manager. Most operational checks treat admin and manager identically.
- **Staff** means active owner/admin/manager/technician in the same company.
- **Personal workspace** is the existing independent-business path, separate from company staff roles. Mobile requires an explicit resolved `solo` workspace; web currently treats missing company claims as personal scope.
- “Read” describes actual data access; “visible” describes interface exposure. Neither implies that a write is authorized.
- Function restrictions below are from source inspection. The production membership and Firestore release were checked directly; this audit did not invoke every production callable or verify every deployed function's source revision.

## Complete web page inventory

There are **18 explicit URL paths and 19 page components** because `/` displays either Landing or Dashboard. Unknown paths redirect to `/`.

| ID | Screen / URL | Data and actions | Current access and gaps |
| --- | --- | --- | --- |
| W01 | Landing `/` when signed out | Marketing content; links to login/signup | Public. No business data. |
| W02 | Login `/login` | Email/password, password visibility, emailed sign-in code, password reset, remembered email | Public entry point; sign-in does not grant a role. Authentication actions apply to that identity. |
| W03 | Signup `/signup` | Name, email, password; company name for ordinary registration | Invitation return path creates only a personal login. Ordinary registration also creates a company shell. Needs a clear separation between new-owner onboarding and invited staff. |
| W04 | Accept invitation `/accept-invite` | Invitation link, signed-in email, email-verification prompt, accept/use another account | Acceptance callable validates invitation, email, verification, status, and owner-selected role. No role selector or team-creation action. |
| W05 | Customer portal `/portal` | Separate customer email-code login; matching service accounts, visits, invoice lines/totals; conditional test-card dialog | Customer identity, not a staff role. Server returns customer-specific data. Portal tokens cannot read staff Firestore collections directly. |
| W06 | Privacy `/privacy` | Privacy information | Public. No business data. |
| W07 | Dashboard `/` when signed in | Customer count, active jobs, monthly revenue, template count; company/customer/template shortcuts | All signed-in users see management-oriented dashboard. Company staff can read the underlying company-wide data, including technicians. |
| W08 | Company Setup `/company-setup` | Company details, address, service categories, branding, estimate setup, staff invitations/roles/status, ownership transfer | Existing company: actual owner gets controls; other staff get company name and owner-managed message. New-company flow exists for users without a resolved company. Server membership changes are owner-only callables. |
| W09 | Customers `/customers` | Company customer directory, contact/address/notes, email consent, active status, spend/revenue; view, search/filter, pagination, export, import, add/edit/deactivate/restore | All staff can read/export company customers. After this fix, management-only mutation controls and dialogs match server writes. Technician read scope and financial/export visibility remain undecided. |
| W10 | Estimate Templates `/estimate-templates` | Service descriptions, default items, prices, duration; view, create, edit, delete, duplicate, create defaults | All staff can read. Write controls are still visible to technicians, although server writes require management. |
| W11 | Jobs `/jobs` | Company-wide jobs, customers/contact/address, assignments, schedule, price/revenue, work details, history, photos/application logs; search/filter/export, create/edit/delete/complete/follow-up/invoice | Create/edit/delete/follow-up controls require management. Technicians see company-wide jobs and can submit allowed work changes; direct rules do not check assignment. Invoice creation is management-only at the data layer. |
| W12 | Calendar `/calendar` | Day/week/work-week/month/agenda views; company jobs and related customer details, notes, price, assignment; job detail and new-job dialog | All staff can view company schedule and financial details. New scheduling is management-gated. Drag/drop and resize are disabled for everyone. |
| W13 | Daily Routes `/routes` | Technician/date, assigned stops, addresses, timing/windows, start/return settings, reorder, calculate/optimize, save, map, navigation links | Callables restrict technicians to their own assigned route; management can select other active staff. Technicians can currently reorder/optimize/save their own route. Decide whether dispatch should control ordering. |
| W14 | Team Locations `/team-locations` | Last shared position, technician name, sharing/stale/accuracy/time indicators, map, retention setting | Link/page visible to technicians, but list callable denies technician access. Management can view; only owner changes retention. Location sharing requires explicit permission and active work. |
| W15 | Service Plans `/service-plans` | Recurring customer services, frequency/date/price/notes; new plan, pause/resume/delete, generate next visit, date-filtered chemical-log CSV | All staff can read plans and export application records. Plan mutations and job generation require management. Technician price/export visibility needs a decision. |
| W16 | Invoices `/invoices` | All company invoice totals/status/customer/due dates, outstanding/overdue/paid summaries, print; email, mark sent/paid, void/delete draft, conditional test-card/cancel-payment controls | All staff can read/print. Management gets state/payment/email controls. Payment fields are server-controlled; paid invoices and locked payments have additional restrictions. No policy decision here enables live payments. |
| W17 | Reports `/reports` | Job/customer/estimate analytics; revenue, service/customer performance, report selection/date ranges, generated reports, export and print | All staff can use current page and read underlying financial data. No page-level role gate. |
| W18 | Integrations `/integrations` | QuickBooks connection/status, saved mappings, customer/service/invoice selection, export preview, payment reconciliation, account defaults | Page and callables deny technicians. Management can inspect/preview/reconcile. Only actual owner connects/disconnects, saves defaults, adopts mappings, or exports reviewed accounting records. |
| W19 | Notifications `/notifications` | Own notifications, mark read, job links; browser push enrollment also appears in shared header | Self-only notification data. Following a job link currently reaches the broader Jobs page. |

### Web dialogs and embedded capabilities

These are not additional routes, but must be permissioned separately from their containing screen.

| Parent | Dialog / control | Reads / changes |
| --- | --- | --- |
| Customers | Customer details | Full customer fields including notes and spend; edit shortcut is now management-only. |
| Customers | Add / edit / deactivate / restore | Contact, address, consent, notes, active status; management only. Current “Delete customer” wording is misleading: this UI calls soft deactivation and offers restore. Permanent-delete service method exists separately. |
| Customers | CSV import preview/commit | Bulk customer data; management-only import callable. Export is a separate read-derived action and is currently available to technicians. |
| Company Setup | Invite/reissue, role/status changes, removal, copy invite link, transfer ownership | Owner-only; transfer destination must be an active admin. Invitations do not make the recipient an owner. |
| Estimate Templates | View / add / edit / duplicate / defaults / deletion confirmation | Company template content and pricing. Technician mutation UI needs gating even though server denies writes. |
| Jobs / Calendar | Job details and shared JobFormModal | Customer/service, assignee, date/time, duration, address, price, notes; management schedules/edits. Read views expose these fields to staff. |
| Jobs | Completion and follow-up forms | Completion details/hours/notes and terminal status; follow-up creates another job and requires management. Assignment restriction is inconsistent between direct web writes and mobile callable. |
| Jobs | Change history | Previous/current schedule, service, price and other revisions, editor and reason. Hiding the current price alone would not hide historical prices. |
| Jobs | Photos | View/open original and upload; staff currently have company-wide photo reads/creates. Metadata edits/deletes require management. Storage currently permits active staff to upload/replace images throughout their company path. |
| Jobs | Chemical application log | Product, EPA registration, ingredient, quantity/unit, pest/area/method, applicator/license, notes. Staff create/read; management can update via rules. Client deletion is denied even to owner. No direct-rule job-assignment check. |
| Jobs / Invoices | Create invoice, print, email, payment/status confirmations | Financial actions; management writes. Invoice print is currently available to technicians. |
| Invoices / Customer Portal | InvoicePayment dialog | Stripe Payment Element using a server-created payment intent. Staff scope requires management; portal scope requires matching customer. Test results must not mark the actual invoice paid. |
| Service Plans | New plan and log export | Recurrence and pricing writes require management; exported logs can include company-wide application/customer/applicator data. |
| Shared layout | Navigation, account footer, notification enrollment, sign out, confirmation dialogs | Sidebar is not role-filtered. Confirmation is a user interaction, not an authorization check. Email verification banner is not a page-level membership gate. |

## Complete mobile inventory

The current `App.js` mounts Login, Signup, Home, and Settings plus loading/error, email-verification, and workspace-access states. It does not use a separate route per Home modal. These changes must be pulled and rebuilt on the Mac to replace an older native binary; the earlier screenshots can represent the older build.

| ID | Screen / entry | Data and actions | Current access and gaps |
| --- | --- | --- | --- |
| M01 | LoginScreen | Password/visibility, email code, reset, remembered email, theme toggle | Public authentication; no role selection. Remembered email and appearance are local; passwords and codes are not remembered. |
| M02 | SignUpScreen | Personal name, email, password, service selection before registration | Creates login/profile, then verification/workspace resolution. Still asks new invited staff to select personal services; that onboarding needs separation from new-business setup. It does not grant a company role. |
| M03 | EmailVerificationScreen | Verification status, resend, refresh, sign out | Signed-in unverified users. Operational screens remain blocked. |
| M04 | WorkspaceAccessScreen | Pending company/role summaries, paste invitation link, explicit acceptance, refresh, sign out | Pending/unavailable workspace blocks operations. No automatic acceptance, owner creation, or role elevation. |
| M05 | HomeScreen | Company name/role/services, today's jobs, location sharing, sync state, menu, schedule and management shortcuts | Technicians query assigned jobs; management can manage company work. Price fields remain in full job documents and some detail views. Current backend reads are broader than this mobile query. |
| M06 | SettingsScreen | Company business name/phone/address/services; own display name/phone/language/notification preferences; System/Light/Dark | Staff view shared company information. Only owner gets web company-settings link. Own preferences editable; appearance stored locally. Company services cannot be changed by technicians. Notification toggles are preferences, not proof a delivery channel is configured. |
| M07 | ServiceSelectionScreen | Category/service checklist and save/continue | Embedded during signup and in confirmed personal-workspace Settings. Not a company service editor for existing staff. |
| M08 | SplashScreen file | Legacy welcome/splash component | Not mounted by current App.js; do not treat this dormant file as a navigable screen. Actual loading/error states offer loading, retry, or sign out. |

### Mobile Home dialogs and device capabilities

| ID | Dialog / component | Data and actions | Current access |
| --- | --- | --- | --- |
| M09 | Home menu | Customer shortcut and sign out | Customer shortcut only management; sign out self. |
| M10 | Customers | Company customer list; add/delete | Management only in current mobile UI and service guards. Server customer writes also require management. |
| M11 | Schedule Service | Customer/service pickers, date/time, duration, address, cost/notes, save job | Management only; server job create also requires management. |
| M12 | Schedule | Day/week/month job lists and open job | Technicians use assigned-job queries; management sees company work. |
| M13 | Job Details | Customer/address/contact, schedule, work details, price where present, photos, edit/complete/follow-up controls | Assigned-list entry for technician. Edit/follow-up management only; work completion available. Direct database reads still allow other company jobs. |
| M14 | Job Completion + confirmation | Work done, hours, completion notes, queued submission and confirmation | Technician's assigned job enforced by job-operation callable; management has company scope. |
| M15 | Edit Job | Schedule, service, price, notes and related job changes | Management only; date/time subdialogs share this scope. |
| M16 | Estimates list / Create Estimate / template chooser | Customer/service, predefined template/items, pricing, save estimate, convert-to-job and generate-PDF buttons | Management-only interface and writes. Both PDF generation and conversion to a job are placeholder alerts: conversion currently reports success without creating a job. Estimate deletion exists in the service layer but has no button in this list. Templates here include built-in choices; do not assume all web template behavior exists natively. |
| M17 | Customer/service and date/time pickers | Values for scheduling/editing/estimates | Subdialogs of management forms, not independently authorized workflows. |
| M18 | JobPhotos | Camera/library, upload, display, queue uploads | Device permission plus app scope. Offline job operation checks assignment; company Storage rules remain broader. No native photo-delete control is implemented. |
| M19 | WorkLocation | Explicit device permission and start/stop sharing, active job | Technician's assigned job must be in progress; current position remains company-scoped and manager-readable. No all-day tracking permission is implied by login. |
| M20 | OfflineStatus | Pending/synced/conflicted operations, retry/discard | Local cache/queue bound to user, company, role and membership; writes replay through authenticated operations. Discarding local work is distinct from deleting production records. |

There are no standalone native Invoice, Reports, Daily Routes map/optimizer, Team Locations map, QuickBooks, team-administration, or Customer Portal screens in the current app. A legacy route button handler says “coming soon” and is not wired into the current dashboard. Native estimate PDF output and conversion to a job are also unfinished. These should not be counted as working capabilities when allocating permissions.

## Proposed role mapping for owner review

**None of the new policy choices in this table have been applied.** The customer-button correction above merely matches the existing server restrictions. “Assigned” means the technician's assigned jobs and only the customer/service information needed for them; it would require changes to server rules or a scoped data projection, not just filtered menus.

| Capability | Owner | Admin | Manager | Technician |
| --- | --- | --- | --- | --- |
| Personal login, profile, appearance, own notifications | Own | Own | Own | Own |
| Company identity/services read | Yes | Yes | Yes | Yes |
| Company settings, service catalogue, branding | Edit | Read | Read | Read |
| Invite/reissue/remove staff; assign roles | Yes | No | No | No |
| Transfer ownership | Yes | No | No | No |
| Dashboard operations | Company | Company | Company | Assigned |
| Customer directory/details | Company | Company | Company | Assigned details only |
| Add/edit/deactivate/restore customers | Yes | Yes | Yes | No |
| Customer import/export or permanent deletion | Yes | Yes | No | No |
| Job/calendar reads | Company | Company | Company | Assigned |
| Create/schedule/assign/edit/delete jobs; follow-up | Yes | Yes | Yes | No |
| Start/complete work and add work notes/photos/application records | Company | Company | Company | Assigned |
| Cancel/reopen a job; change prices or customer | Yes | Yes | Yes | No |
| View prices, revenue, invoice data, financial history | Yes | Yes | No | No |
| Estimate/template create/edit/delete | Yes | Yes | Yes | No |
| Quotes and service-plan pricing needed to schedule work | Yes | Yes | Yes | No |
| Recurring plans and generate next visit | Yes | Yes | Yes | Assigned visit only |
| Daily routes: view/navigate | Company | Company | Company | Own |
| Daily routes: reorder/optimize/save | Yes | Yes | Yes | No |
| View other technicians' work locations | Yes | Yes | Yes | No |
| Share own work location | Explicit opt-in | Explicit opt-in | Explicit opt-in | Explicit opt-in |
| Location retention policy | Yes | No | No | No |
| Invoice create/email/mark paid/void/payment actions | Yes | Yes | No | No |
| Operational reports and application-log export | Yes | Yes | Yes | No |
| Financial reports and bulk job exports | Yes | Yes | No | No |
| QuickBooks status/preview/reconcile | Yes | Yes | No | No |
| QuickBooks connect/settings/mappings/export | Yes | No | No | No |
| Permanent company/account deletion | No current UI | No | No | No |

The proposal deliberately separates management of daily work from accounting authority. Managers would still see quote and service-plan pricing needed for scheduling, but not invoice/revenue reporting. If managers should also handle invoices or financial reports, approve those rows explicitly. Admins would manage operations and accounting, while company governance stays with the owner. Customer portal access remains a separate verified-customer scope rather than an employee role.

The main owner decisions are: technician assigned-only reads; technician access to prices and customer notes/contact details; technician control of route order; manager invoice/payment/report rights; admin rights to company settings and staff administration; and whether invited/pending staff can ever start an independent company from the same identity. The CSV provides separate rows for these decisions.

## Enforcement work after approval

1. Establish one approved capability map shared by web/mobile, with separate owner privileges, company staff, pending/unverified states, and explicit personal workspaces.
2. Apply it to navigation, direct URL access, dialogs, buttons, and service entry points. Web must consume resolved workspace state rather than interpreting missing claims as management permission.
3. Enforce the same scopes in Firestore, Storage, and callables. Restrict technician job/customer/photo/log reads and mutations by assignment if approved. Keep real owner checks and stale-membership checks.
4. Financial confidentiality needs a separate safe projection/document or callable response: a Firestore document read returns its fields, so hiding a price column does not protect it. Job history, customer spend, exports, offline caches, and original image access need the same review.
5. Harden new-company creation against pending/removed/active membership states, preserving explicitly approved independent-business behavior. Resolve the policy before changing shared legacy-compatible rules.
6. Test each role, direct navigation and direct API/database calls, unassigned work, stale claims, another company, revocation, offline replay, and invitation signup. Validate both newly built mobile binaries and deployed web assets.

## Sources and validation

Routing/UI: [web App](../routeLogisticsWeb/src/App.jsx), [Layout](../routeLogisticsWeb/src/components/Layout.jsx), [ProtectedRoute](../routeLogisticsWeb/src/components/ProtectedRoute.jsx), [web pages](../routeLogisticsWeb/src/pages), [web tenancy](../routeLogisticsWeb/src/services/tenancy.js), [mobile App](../routeLogisticsMobile/App.js), [mobile screens](../routeLogisticsMobile/screens).

Authority: [Firestore rules](../firestore.rules), [Storage rules](../storage.rules), [security helpers](../functions/security.js), [workspace resolution](../functions/workspace.js), [routes](../functions/routes.js), [offline work operations](../functions/offline.js), [locations](../functions/locations.js), [QuickBooks](../functions/quickbooks.js).

Checks for this change:

- `node --test tests/web-customer-access.ui.test.js`: six rendered-UI checks cover technician rows/details/empty state, preserved owner/admin/manager controls, and an open form after role downgrade. Services are mocked; no production writes.
- Web `npm run lint`: zero errors; six existing Hook dependency warnings.
- Web `npm run build`: passed; existing large-chunk warnings remain.
- Local Firestore emulator: all 37 checks in the existing `tests/firestore.rules.test.js` authorization suite passed, using `demo-routelogistics`, not production.

The UI test uses the existing web JSX compiler and mobile workspace React test renderer, so install both workspace development dependencies before running it. No new dependency is required.
