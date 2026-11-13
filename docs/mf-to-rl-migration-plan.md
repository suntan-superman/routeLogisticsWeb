# mi Factotum → Route Logistics: Feature Migration Plan

**Purpose:** Route Logistics (RL) is the intended production product going forward. mi Factotum (MF) is the precursor and will be retired, but it contains substantial functionality RL still lacks, plus real tenant data (e.g. Acme Pest Control) in the shared Firebase project `mi-factotum-field-service`. This plan inventories what MF has that RL doesn't, and sequences the work to bring RL to parity (and beyond) without depending on MF's code, tenancy model, or Cloud Functions.

**Decision on record:** MF will not be kept running long-term. RL will not try to interoperate live with MF's `teamMembers`/`invitations` schema. Existing MF-created records (companies, team members, customers) must be migrated/re-created under RL's own claims-based tenancy model, one time, not continuously synced.

---

## 1. Why this matters now

RL and MF currently share one Firestore project but use **incompatible tenancy models**:

| | mi Factotum | Route Logistics |
|---|---|---|
| Tenancy source of truth | `users/{uid}.companyId` field, no custom claims | Firebase custom claims (`companyId`, `role`), synced via `syncClaims` |
| Roles | `field_tech`, `admin`, `customer`, etc. | `owner`, `admin`, `manager`, `technician` |
| Invites | REST endpoints (`createCompanyInvitation`, `acceptInvitation`), `invitations` collection, no email-verification gate | `teamMembers` docs keyed by email, requires `emailVerified` before activation |
| Functions codebase | `functions:` (default), ~25 functions | `functions:routelogistics` (separate deploy target in the same project) |

This is exactly the root cause of the "Acme Pest Control shows no data" issue investigated this session: Acme's company record and David Lopez's invite were created by MF, but David authenticated through RL, whose claims system never recognized the MF-shaped invite.

**This plan assumes we stop trying to make the two interoperate and instead migrate data + rebuild missing functionality natively in RL.**

---

## 2. Functional gap inventory (MF has it, RL doesn't)

Grouped by priority. Source: `mifactotum/functions/index.js` (31 exported Cloud Functions) and `mifactotum/miFactotumWeb/src/pages` (28 page components).

### P0 — Blocking for any pest-control customer to actually use RL day-to-day
1. **Public self-signup + landing page** — *(built this session: `LandingPage.jsx`, `SignupPage.jsx`, `/signup` route)*
2. **Team invitation flow** — MF: `createCompanyInvitation`, `verifyInvitationCode`, `sendInvitationEmail`, `acceptInvitation`, `InvitationsPage.jsx`. RL only has `CompanyService.addTeamMember`, which writes a `teamMembers` doc but has **no email, no accept link, no UI page to view/manage pending invites**, and no way for the invited person to actually join (no `/accept-invite` route exists in RL at all).
3. **Email verification required but no resend/guidance UI** — RL gates invite activation on `emailVerified` (`functions/claims.js`) but there's no in-app banner telling an unverified user why they can't see company data, and no "resend verification email" button.
4. **Company ownership transfer / claim flow** — MF: `claimCompanyOwnership`. RL has none; if an owner account is lost there's no recovery path.
5. **Data migration tool** — a one-time script to copy real MF company/customer/job data (e.g. Acme) into RL's schema with correct `companyId`/claims, since we are not keeping MF running.

### P1 — High customer value, used constantly in MF
6. **Customer Portal** (MF: `CustomerPortalPage.jsx`, OTP login via `requestCustomerOTP`/`verifyCustomerOTP`, `createCustomerProfileOnSignup`, multi-company dashboard). RL has no customer-facing surface at all today — customers can't see their own jobs/invoices.
7. **Public company directory / "find a provider"** (MF: `PublicDirectoryPage.jsx`, `CompanySearchPage.jsx`, `ProviderProfilePage.jsx`, `displayInDirectory`/`zipCodes`/`regionsServed` fields already present on the Acme company doc). This is a real acquisition channel MF had built and RL doesn't use yet.
8. **QuickBooks integration** (MF: `initiateQuickBooksOAuth`, `syncCustomerToQuickBooks`, `syncServicesToQuickBooks`, `quickbooksWebhook`, `QuickBooksSettingsPage.jsx`). Acme's company doc already has QuickBooks item IDs synced from MF — real customer dependency.
9. **Stripe payments** (MF: `createPaymentIntent`, `stripeWebhook`). RL invoices currently have no "Pay Now" — this was already flagged as pending work in RL's own roadmap.
10. **Recurring job generation as a scheduled function** (MF: `generateRecurringJobs` runs nightly). RL's `ServicePlansPage` currently requires a manual "Generate next job" click — no automatic cron equivalent yet.
11. **Payment reminders / overdue tracking** (MF: `sendPaymentReminders`, `trackOverdueInvoices`, scheduled). RL has invoice overdue *display* but no automated reminder emails.
12. **Bulk customer import** (MF: `BulkImportPage.jsx`). RL has no CSV/bulk import for customers — meaningful onboarding friction for a company migrating off spreadsheets.
13. **Team/technician live location tracking** (MF: `LocationSettingsPage.jsx`, `TeamTrackingPage.jsx`, `cleanupOldLocations`). Not present in RL at all (web or mobile).
14. **Route optimization** (MF: `RouteOptimizationPage.jsx`) — directly on-brand for "Route Logistics" and currently missing.

### P2 — Polish / lower urgency
15. **Invoice templates** (MF: `InvoiceTemplatesPage.jsx`) vs RL's single hardcoded invoice layout.
16. **Support request intake** (MF: `submitSupportRequest`, `SupportPage.jsx`).
17. **Notifications center page** (MF: `NotificationsPage.jsx`) — RL only has the header bell toggle, no history/list.
18. **Privacy policy page** (MF: `PrivacyPolicyPage.jsx`) — RL has none published; needed before real signups collect customer PII.
19. **Single-session enforcement** (MF: `SINGLE_SESSION_IMPLEMENTATION*.md`, `sessionToken`/`sessionDeviceInfo` fields already present on RL's own `users` docs from the shared schema, but RL doesn't enforce it).

---

## 3. Migration plan (sequenced)

### Phase A — Stop the bleeding (this sprint)
- [x] Public landing page + signup (done this session)
- [ ] Add `/accept-invite` page in RL: user enters/clicks an invite link with a code, we verify it server-side (new `acceptTeamInvite` callable in `functions/routelogistics`), and activate the matching `teamMembers` doc + claims — replacing MF's REST flow with an RL-native equivalent.
- [ ] Add an invite-sending UI to `CompanySetupPage`'s Team tab (currently can add a teamMember doc but there is no evidence an email is ever sent — confirm, then wire to a `sendTeamInviteEmail` function alongside the existing `notifyJobAssigned` pattern).
- [ ] Add an "email not verified" banner + resend button, shown app-wide via `Layout`, when `currentUser.emailVerified === false`.
- [ ] **One-time data migration script** (`scripts/migrate-mf-companies.js`, run manually, not deployed): for each MF-created company a real customer is using (starting with Acme `z7DJMjeigjG64YfN4H5h`), re-issue clean RL invites for its `teamMembers` and let each person accept through the new `/accept-invite` flow. Do **not** attempt to auto-convert `field_tech` → RL roles silently; prompt the owner to assign each member's RL role during acceptance.

### Phase B — Customer-facing value (next 1-2 sprints)
- [ ] Stripe "Pay Now" on invoices (`createPaymentIntent` + webhook, ported into `functions/routelogistics`)
- [ ] Minimal customer portal (job status + invoice view only, OTP login) — this is the single highest-leverage MF feature to port, since it's customer-facing and differentiates the product
- [ ] Bulk customer CSV import
- [ ] Scheduled recurring-job generation (convert existing manual trigger to a `onSchedule` function)

### Phase C — Differentiation (backlog)
- [ ] Public directory / provider search (reuses Acme's existing `zipCodes`/`regionsServed`/`displayInDirectory` fields already in Firestore)
- [ ] QuickBooks sync
- [ ] Route optimization
- [ ] Technician location tracking

### Explicitly not migrating
- MF's REST-based (`onRequest`) Cloud Functions pattern — RL should keep using `onCall` callables, which are simpler to secure and already the established RL pattern.
- MF's plain-Firestore-field tenancy model — RL's claims-based model stays as the single source of truth.
- MF's `field_tech`/`roleDisplay` role taxonomy — map to RL's `technician/manager/admin` during acceptance, not automatically.

---

## 4. Immediate next action
Confirm the Phase A `/accept-invite` + invite-email approach, then I'll implement it, re-point Acme's pending invites (David Lopez and `tech3@route-logistics.com`) through it, and verify Acme's data appears correctly for both accounts.
