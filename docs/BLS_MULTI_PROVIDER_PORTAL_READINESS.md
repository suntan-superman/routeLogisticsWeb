# BLS and multi-provider customer portal: local readiness

## Current architecture and minimum changes

Route Logistics already stores provider customer records in `customers` with `companyId`, stable customer IDs, a legacy address, and optional `serviceProperties` with stable property IDs. Jobs retain `customerId`, their own scheduled address snapshot, and, for newer jobs, `servicePropertyId`. The existing customer intake API adds or edits properties without replacing the legacy primary address. The onboarding wizard and `bulkImportCustomers` support tenant-scoped CSV import and retry by deterministic provider/customer identity. Staff membership, invitations, and Firebase claims remain separate from customer portal identity. The customer portal already had an isolated Firebase Auth session, one-time email code, customer-facing visit/invoice projections, and guarded file downloads.

The previous portal discovered customers by matching their email address. This was insufficient to establish provider consent. The local change requires a provider-issued link in `rlPortalLinks` for every provider/customer association. The link is activated only by a signed-in portal identity after redeeming a single-use invitation sent to the customer's current email. A portal identity can claim independent links for Acme and BLS; their customer documents remain separate. Server-side reads, file downloads, reviews, and invoice payment/history authorization all check the current link. A changed customer email, archived customer, disabled company, or revoked link removes access. Firestore rules continue to deny direct portal access to provider customer records. Revoking a pending invitation records a tombstone so its token cannot activate access later.

`rlPortalLinkInvites` stores only a token hash as its document ID, provider/customer/email scope, status, and expiration. The email carries the token in a URL fragment so it is not sent in an HTTP request or referrer. `rlPortalLinkAudit` records invitation, claim, and revocation actions without storing the token. Invitation and OTP requests are rate limited. OTP hashes are challenge-bound; code attempts and expiration are enforced server-side. Portal Firebase Auth uses browser session persistence; server requests with an `auth_time` older than 24 hours require a new email-code sign-in. A provider link grants no team role or staff capability.

The portal now lists authorized properties per provider and filters visits using saved `servicePropertyId`. Old visits without an unambiguous property reference remain visible under **All properties**. Property projections omit access instructions and technician notes. The same physical street may appear independently in different providers' records.

## BLS import preparation

No ten shared Acme contacts were designated in the request. Do not infer them from names or email matches. The owner must use **Customers → Export** while signed in to Acme, save the export in ignored `.migration/acme-export.csv`, and create ignored `.migration/bls-approved-emails.txt` containing exactly ten distinct emails with explicit authorization for BLS. Then run:

```powershell
node scripts/prepare-bls-import.js .migration/acme-export.csv .migration/bls-approved-emails.txt
```

The script selects those ten rows, preserves their contact/address fields, removes notes, creates 40 clearly synthetic `.example.com` contacts with blank phone numbers and fictional `Example Lane (Synthetic)` addresses, and validates exactly 50 rows using the existing CSV preview and server row validator. It writes `bls-customers-import.csv` and a separate ten-row `bls-shared-reconciliation.csv` inside ignored `.migration/`. These files must stay private. The generated CSV contains no Acme IDs or tenant IDs; the importer assigns BLS ownership from the signed-in BLS workspace.

Synthetic test addresses are marked unverified and bypass Google geocoding only when the exact BLS test name, email, address, and blank phone/notes pattern match. They are not suitable for scheduling. Real addresses continue through Google validation. If any approved shared Acme address is invalid, correct it through the usual customer workflow or leave that row out of the approval set; do not silently alter it.

## BLS owner checklist

1. Use **Add Your Company** and complete email verification and the existing seven-step onboarding wizard. Set Bakersfield Lawncare Service, BLS, Lawn Care / Landscaping, and Bakersfield, California.
2. Add the two crews' technicians through existing team invitations. Crew grouping does not yet exist: assign each technician individually. A future minimal model would be `companyId`, `crewId`, display name, member IDs, optional lead member ID, and active status; it must never replace individual job assignments.
3. Configure services, operating hours, and service areas. Keep customer CSV import optional.
4. Prepare the approved ten-contact file and generate the private 50-row CSV above. Preview and import it once from the BLS workspace. Retry is expected to skip already imported records.
5. Inspect the created BLS customer records and invite selected customers to the portal individually from **Customers → Customer Details → Customer portal access**. Do not bulk invite during testing.
6. Confirm Acme and BLS histories remain independent for a shared identity, including when both records use the same property address.

## Acceptance before production release

- Test OTP delivery, expiration, replay, attempt limits, and rate limits with authorized test inboxes only.
- Test provider invitations with wrong email, expired and duplicate token, concurrent claims, email change, and provider/customer revocation.
- Test zero, one, and multiple properties; legacy single-address customers; and shared streets across providers.
- Test that portal identities cannot call staff management APIs or read Firestore customer documents directly.
- Test cross-provider visits, photos, PDFs, invoices, payment history, and reviews.
- Test the 50-row private CSV with the BLS owner account, verify 10 approved plus 40 synthetic, then retry without duplicate records. Compare Acme customer counts before and after.
- Browser-test desktop and phone widths and confirm sign-out clears visible records.

## Release scope and limitations

The release requires the Route Logistics Functions containing portal links and invoice authorization, the web app, and the `rlPortalLinks` composite index (`email`, `status`). Firestore rules need no change because new link collections remain denied by the catch-all rule. The local validation phase made no production record changes.

**Production access preflight (November 20, 2026):** A read-only audit of `mi-factotum-field-service` found zero active `rlPortalLinks`, zero pending link invitations, three consumed portal OTP challenges belonging to owner-controlled test inboxes, and one portal Auth identity belonging to an owner-controlled test inbox. No unexpected external portal access was found. The existing implementation had no explicit provider authorization record to migrate; email matching alone is insufficient. The approved release therefore starts with no active provider links and requires a new provider-issued, single-use invitation for each relationship. No customer record or permission is changed by this transition, and no backfill is run. The audit script prints counts only and can be rerun before deployment.

The BLS CSV cannot be generated with real shared contacts until the owner identifies the ten authorized emails and supplies the private Acme export. Crew grouping is a future feature; individual assignments work now. No customer self-service lookup, payment checkout change, scheduling request, or cross-provider data sharing is introduced by this work.

## Local validation, November 20, 2026

- Firestore emulator: all 145 combined portal, review, payment, invoice, rules, and workflow tests passed in the final run. The 50-row BLS import test confirmed new tenant-owned IDs, idempotent retry, and unchanged Acme source rows.
- Web unit/UI: 516 passed. Mobile regression: 446 passed. The private CSV generator passed a 50-row synthetic-input test; no real customer export was read or generated.
- Chromium smoke: 16 nonportal cases passed. The two portal smoke cases initially used an outdated email-match fixture; after the fixture was corrected, all seven portal browser journeys passed on a fresh emulator run.
- Web production build passed. ESLint reported zero errors and one preexisting Team Locations hook warning. No production records, emails, or imports were touched.

## Production release requirements

1. Rerun the read-only authorization preflight and stop if any unexpected external portal identity, consumed OTP, active link, or pending invitation appears.
2. Commit only the portal, import, index, audit, tests, and this document; preserve unrelated `routeLogisticsWeb/README.md` changes and `debug.log`.
3. Deploy the `rlPortalLinks` composite index (`email`, `status`) and wait until it is ready. Existing Firestore rules already deny direct access to link and invitation collections, so no rules change is required.
4. Push `main` and confirm Netlify publication, then deploy only affected Route Logistics Functions: portal read/file/link callables, customer review, customer CSV import, and the portal-facing invoice payment creation/status/history callables. The email worker and unrelated integrations do not need redeployment.
5. Smoke-test the public portal and owner-facing invitation controls. Automated tests use emulator mail and synthetic fixtures; do not send production emails or create production records for release verification.
6. Owner-controlled manual acceptance: create or select an owner-controlled test customer, issue one invitation to an authorized inbox, use a fresh email OTP, claim the provider link, inspect provider/property isolation, revoke it, and confirm the old link cannot restore access. Do not invite real customers during rollout testing.

BLS is not created by this release. Its private import CSV remains blocked until the owner supplies the Acme export and explicitly approves ten shared identities. The generator creates new BLS-owned IDs at import time; it never copies source IDs. Crew grouping remains deferred.
