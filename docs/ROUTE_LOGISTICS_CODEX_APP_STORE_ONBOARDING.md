# Route Logistics — Codex Implementation Plan
## Controlled Company Registration + Mobile Personal Accounts + App Store Readiness

**Target:** Existing Route Logistics production web, backend, and Expo React Native repositories.
**Branch policy:** Work on the existing primary branch. Do not create staging environments or secondary branches. Do not deploy or submit an App Store build until checks pass and the operator approves the release.
**Technology:** Preserve existing JavaScript, Firebase Auth/Firestore, Expo, and existing service boundaries. Do not introduce TypeScript or a new identity provider.

## Product decisions (do not reinterpret)
1. Anyone may register a **personal** account on mobile, verify their email, and sign in without a company.
2. A personal account with zero active company memberships is **unassociated** and has no access to company data or operations.
3. Existing company owners/managers continue inviting technicians through the existing invitation workflow. Preserve it.
4. Creating a **new company** requires a Workside-issued, single-use, expiring authorization during the testing period.
5. A platform administrator controls the company-registration policy in the existing web administration UI: `open`, `approval_required`, or `closed`. Default and current target: `approval_required`.
6. Existing company memberships, customer data, technician workflows, location tracking, billing, and Stripe test-mode behavior must not regress.
7. Public App Store distribution is the goal. Apple reviewers will receive an existing demo account with sample data; never put credentials in source control.

## Phase 0 — Inspect before editing
- Locate web company signup, mobile login, email verification/OTP, invitation acceptance, membership/claims resolution, tenant scoping, Firebase Security Rules, and privileged backend functions.
- Identify all paths that create companies (UI, functions, callable endpoints, admin scripts). Document whether they are server-mediated and how company ownership is assigned.
- Locate existing Workside-only platform admin authorization and UI. Reuse it; do **not** confuse platform admin with an ordinary tenant owner.
- Verify how the mobile app handles a valid authenticated user with zero memberships, including initial routing, claims refresh, listeners, error messages, and logout.
- Locate existing account deletion, privacy policy, terms, support links, and iOS permission strings.
- Report concise findings, file paths, and any architectural blockers before making invasive changes. If a secure platform-admin identity mechanism is absent, stop and request a decision instead of inventing a client-side admin flag.

## Phase 1 — Company registration policy (web/backend)
- Store a server-controlled policy using existing configuration conventions: `open`, `approval_required`, `closed`. **Fail closed** if configuration is missing, malformed, or unreadable; do not allow an unguarded company-creation path.
- Only an authenticated, server-verified Workside platform administrator may read sensitive authorization records, change the policy, issue/revoke authorizations, or inspect issuance history. Ordinary company owners/managers cannot do so.
- Provide a minimal admin UI showing the current policy and a control to change it with confirmation. Include a list of outstanding authorizations and their status; avoid unnecessary new admin frameworks.
- Under `approval_required`, require a valid company-creation authorization bound to the intended verified email or authenticated UID. Tokens must be cryptographically random, short-lived, single-use, and revocable. Store only token hashes where feasible; never log raw tokens. Use an existing trusted transactional email channel or a secure copy-link flow.
- Redeem authorization and create company/owner membership in one trusted, idempotent transaction or equivalent server-enforced atomic workflow. Handle retries, duplicate taps, and expired/revoked/used tokens without duplicate companies.
- Under `open`, permit verified eligible users to create companies through the same server-enforced flow without an authorization. Under `closed`, reject new company creation regardless of link status. Existing tenant activity and invitations remain unaffected in every mode.
- Apply enforcement to **every** company-creation entry point, not just the web UI. Ensure Firestore rules prevent clients from bypassing the privileged server workflow. Preserve necessary legacy records and indexes.
- If a previously issued authorization is opened before registration, securely retain the pending intent through signup/login and require the same verified identity at redemption. Do not let possession of a link grant access to an existing company.
- Avoid altering Stripe, pricing, subscription entitlements, or provider payment handling.

## Phase 2 — Mobile personal registration and unassociated state
- Add a minimal `Create Account` entry on the mobile sign-in screen using existing Firebase Auth/email verification patterns. Reuse existing password and/or email OTP logic as appropriate; do not build a parallel auth stack.
- After registration, clearly distinguish `email_unverified`, `authenticated_unassociated`, `invitation_pending`, `active_member`, and genuine auth/network errors. Use the existing claims-refresh and membership query patterns without granting fallback owner/manager permissions.
- For `authenticated_unassociated`, show a clean screen: "Your account is ready. You aren't connected to a company yet." Explain that an existing company administrator can invite the user, or Workside can authorize new company creation. Offer an existing-invitation path, refresh/check access, sign out, account deletion, and privacy/terms links.
- If the app supports invitation links, ensure a verified-email match and safe deep-link handling; otherwise provide a straightforward invitation acceptance route using the existing workflow. Never auto-join a tenant based only on a typed company name or an untrusted link.
- Ensure users with no active membership do not start shift/location tracking, subscribe to company Firestore data, display jobs/customers/dispatch, or reach tenant APIs. Test against backend rules, not only navigation guards.
- Preserve existing owner, manager, and technician navigation and their current permission boundaries. Avoid rebuilding the login UI beyond what is necessary.
- Account deletion must remain reachable for both unassociated and associated users. Verify reauthentication and server-side deletion/cleanup behavior, and ensure it cannot silently delete another company's shared records. If company-owner deletion has dependencies, explain them in-app and offer a compliant resolution path.

## Phase 3 — Web signup UX
- Under `approval_required`, replace unrestricted company-creation affordances with an authorization-code/link flow and a clear request-access message. Do not claim a company was created until the server confirms it.
- Under `open`, show ordinary company registration. Under `closed`, show a neutral registration-unavailable message. Keep existing sign-in and company invitation flows available in all modes.
- Do not require mobile users to complete company creation on the phone. Authorized company creation can remain web-first.

## Phase 4 — App Store release verification
- Verify App Store Connect app record for Route Logistics Mobile and the approved bundle identifier `com.worksidesoftware.routelogisticsapp`; do not create a duplicate record.
- Check iOS version/build numbers, app icon (replace any placeholder), display name, production API URLs, release build configuration, required privacy manifest, permission usage descriptions, and any background-location modes against actual behavior. Do not claim background tracking if only foreground tracking is implemented.
- Confirm privacy policy and terms links open from sign-in and signed-in/settings states, including unassociated accounts. Verify support URL and account deletion workflow.
- Audit actual data collection for App Privacy answers; do not guess. Review Apple age-rating questions, including location-sharing questions, based on app behavior.
- Review Apple's current rules for any paid digital subscriptions or external web purchase links before exposing purchase CTAs in the iOS app. **Do not enable live Stripe collection or add purchase links as part of this task.**
- Prepare a demo owner/manager account with non-sensitive sample company/jobs/technicians and stable login, plus reviewer notes describing login, job workflows, and account deletion. Keep credentials in secure operator handoff, not git.
- Run existing unit/integration tests, emulator/security-rules tests, web build, Expo Doctor, and iOS export/build checks. Add targeted tests below.

## Required tests and evidence
1. New mobile user registers and verifies email; has zero memberships and sees the unassociated screen.
2. Unassociated user cannot read/write tenant Firestore documents or call tenant-scoped functions, even with direct requests.
3. Unassociated user can access privacy, terms, sign-out, and account deletion.
4. Existing technician invitation for the same verified email activates correctly; a mismatched email is rejected.
5. Existing owner/manager/technician login and permission checks continue to pass.
6. In `approval_required`, unauthenticated or unapproved company creation fails through **every** entry point, including direct API calls.
7. Valid authorization creates exactly one company and owner membership; expired, revoked, reused, or wrong-email authorization fails.
8. Concurrent redemptions/retries do not create duplicate companies.
9. In `closed`, all new company creation fails; in `open`, verified eligible users can create a company; restore `approval_required` after tests.
10. Non-platform-admin users cannot change policy or issue/revoke authorizations.
11. Existing customers, jobs, invitations, and location behavior are unchanged.
12. App Store release checks: legal links, account deletion, demo login, icon, permission prompts, and production configuration.

## Deployment and reporting
- Work directly against the current primary branch; no staging and no secondary branches.
- Make small, reversible changes and use existing CI/tests. Avoid test mutations against real production customer records. Use isolated test identities and clean them up safely.
- Before any production deploy, present changed files, migrations/rules/indexes, test results, rollback plan, and remaining Apple-review blockers. Obtain operator approval before deploying and before initiating EAS build/submission.
- After approval, deploy the smallest necessary backend/rules/web/mobile changes, verify production behavior, and ensure company policy is `approval_required`.
- Do not claim a feature is tested if it was only code-reviewed. Mark any unavailable device or App Store checks explicitly as pending.

## Deliverable
Produce a concise implementation report with: current architecture findings, exact files changed, security enforcement details, test commands/results, production deployment status, policy status, remaining blockers, and operator steps for App Store Connect. Prefer one clean report file in the existing `docs/` hierarchy.
