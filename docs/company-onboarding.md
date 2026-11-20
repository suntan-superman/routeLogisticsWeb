# Company onboarding wizard

New self-serve signups proceed through `/onboarding` after email verification. Existing company members and invitation recipients retain their current signup and acceptance paths. The existing `/company-setup` page remains available for active companies.

## Draft and activation model

`rlCompanyOnboardingDrafts/{ownerUid}` stores a normalized draft, revision, last update, and 30-day expiry. Callables require an authenticated, verified user; drafts are keyed by Firebase UID, and save requests compare the expected revision to detect edits from another session. Drafts never grant company claims or management access. Daily cleanup removes expired drafts, and account deletion removes the owner’s draft.

Activation validates the draft and performs a transaction that creates one company, associates the owner profile, and records the activated company ID in the draft. Repeating the request returns the same company. Existing company membership, pending invitation, deletion markers, or an existing owner company block activation. Team invitations use the current invitation callable after activation and therefore preserve its verified-email, tenant, and role controls.

The wizard stores services and business hours in the existing company document. Business hours are descriptive company settings; they do not change scheduling behavior, which continues to use technician availability. Time zones are validated using the runtime IANA database. Optional service coverage is saved through the existing `rlServiceAreas` callable and address verifier after company activation; if validation or the maps service fails, the owner can retry from Company Settings. No coverage eligibility rules are changed by onboarding.

## Customer CSV handling

The setup wizard uses the current browser CSV parser for local preview and validation. It does not upload customer rows before activation. The locally validated preview is retained through the owner's activation/claim refresh and is handed directly to the existing tenant-scoped importer, so the file is selected only once during the normal flow. The owner still explicitly chooses **Import customers** after activation. That importer processes batches, never overwrites existing records, reports interruption, and can be retried safely because imported identities are deterministic. Since the importer is chunked rather than one all-or-nothing database transaction, a network or validation failure can leave a clearly reported partial import; retry skips the rows already written. Customer records are not modified merely by saving an onboarding draft. For privacy, CSV rows are not stored in the onboarding draft and therefore do not follow the owner to another device.

## Operational checks

- New callable names: `rlGetCompanyOnboardingDraft`, `rlSaveCompanyOnboardingDraft`, `rlActivateCompanyOnboarding`.
- Draft collection access is server-only; Firestore client rules do not grant direct access.
- Draft saves are bounded by Firebase callable request size and are rate limited. Expiry cleanup processes up to 400 drafts per daily run.
- Owner email verification is required before draft access or activation. New unverified signups see the existing verification gate.
- Acceptance coverage: clean/invalid draft validation, resume and revision conflicts, cross-user isolation, verified activation, and duplicate activation in the Firestore emulator.
