# Job service addresses

Implemented on `main` for the existing `mi-factotum-field-service` project.

Selecting a customer in **Schedule New Job** fills the saved customer address.
The address stays locked until **Enable Editing** is clicked. Editing an
existing job starts from its recorded property/address, preserving its location
during ordinary notes, time, or price changes. Missing addresses require an
explicit editing action before entry.

After enabling editing, an authorized user can leave the change as a one-time
job property, or check **Update customer's saved address**. The checkbox starts
unchecked and appears only for a different address and a user with customer
management access. Changing customers relocks the field, clears this choice,
and invalidates the previous property approval/exception. Customer-list refreshes
do not overwrite a manually entered draft or silently advance its editing
revision.

Permanent saves run through the existing `rlManageJob` callable with explicit
`saveCustomerAddress: true` and the customer version captured when editing
started. The backend rechecks the current role, tenant, job, customer version,
and service-area eligibility before committing the job, customer, and audit
records in one transaction. A conflict or failed property check leaves both
records untouched. Owners, administrators, and managers can make this choice;
technicians cannot schedule jobs or change customer records. Independent
business owners use the same atomic operation for permanent updates.

The customer address is stored as one full address string. Stale city/state/ZIP
components and validation metadata are replaced with the verified result.
Only coordinates from server validation can replace them. No Maps lookup runs
merely from selecting a customer or enabling editing.

New and changed physical customer/service addresses must pass the server's
Google Address Validation check, including providers without configured service
areas and independent workspaces. This applies to customer forms/imports,
job scheduling/edits, service plans and estimate conversion. Ordinary edits to
unchanged historical addresses do not trigger revalidation or alter past jobs.
Server-private, tenant-scoped verified results are cached to avoid redundant
paid requests; client coordinates and eligibility flags are never proof.

Google's confirmed formatting, locality and ZIP/ZIP+4 enrichment is accepted
automatically when the physical street/property is confirmed. It does not block
Save or require the user to apply a suggested postal-format change.
If Google changes the physical street or unit, the form displays **Use
suggested address** for review. This changes only the draft; the user must save again.
Unconfirmed/approximate results are rejected. Invalid or unavailable checks
retain the draft and show retry/correction guidance. Approved estimate
addresses remain immutable and require a new draft/reapproval to change.
Direct client writes cannot bypass physical-address validation.

Successful permanent saves refresh the scheduling form's customer default
without requiring a page reload. Recorded addresses on other jobs and service
plans are not rewritten. Legacy records without their own location continue to
inherit the customer's address when read; this change does not migrate those
historical records.

Address validation uses the existing Google Address Validation API with runtime
Application Default Credentials in the same Firebase project. No browser key
or new secret is needed. Deploy the affected Route Logistics callables
(`rlManageCustomer`, `rlManageJob`, `rlServiceAreas`, `rlManageServicePlan`,
`rlEstimate`, `bulkImportCustomers`) and Firestore rules together. Web changes
deploy from `main`; native changes require an updated mobile build.

The scheduling customer picker now uses the app's green selection theme.
All editable web/mobile appointment and route departure time controls offer
quarter hours (`00`, `15`, `30`, `45`). Existing odd-minute values are retained
until explicitly changed; recorded timestamps and durations are not rounded.

Tests use synthetic emulator records. No real customer address is edited during
development acceptance.

Correction prompts on locked job addresses now include **Enable Editing** beside
the suggestion. Checking a saved address does not unlock it automatically.
After explicit unlocking, **Use suggested address** fills the draft and clears
the old eligibility/exception; a separate Save is still required. Both unlock
locations capture the same customer revision and cannot silently rebase an
existing permanent edit. Fixed approved-estimate properties show revision
guidance instead of an unusable correction button. Company save errors and
preflight checks use one correction notice, without a duplicate eligibility error.
The follow-up web suite passed **293/293**, including six new lock/correction
regressions; lint/build passed with the two existing hook warnings.

The subsequent postal-normalization repair passed **147 Functions tests / one
existing skip** and **56 focused integration cases**. Its regression proves
that a complete, confirmed Google property with inferred ZIP/ZIP+4 saves in one
request for company and independent accounts, without changing the customer's
saved address or historical jobs. A read-only provider check of the reported
address returned Google's **ACCEPT** verdict with only the postal components
inferred; no customer record was modified during that check.

November 15 validation: web unit/UI **287/287**, mobile **224/224**, Functions
**144 passed / one existing skip**, focused emulator **125/125**, and the final
affected-file emulator rerun **28/28**. The broader integration/rules run passed
**374/375**; its sole failure was a frozen login timestamp expiring against the
ownership test's real clock. The fixture now shares its clock with both handlers,
and that test passes in the final rerun; application authorization was unchanged.

All **27 distinct Chromium scenarios** passed across the full and focused runs.
The initial time-label assertion included the decorative selection checkmark;
it now inspects the label text. Workflows PW-OPS-10 through PW-OPS-14 then passed
**15/15 across Chromium, Firefox and WebKit**, including the green highlight,
keyboard selection, 96 quarter-hour choices, one-off and permanent addresses.
Other Firefox/WebKit cases were not rerun in this batch.

Web lint/build passed with two preexisting hook warnings. Expo Doctor **18/18**,
dependency compatibility and iOS export passed. One actual Google validation of
Google's public campus returned **HTTP 200**, complete **PREMISE** validation and
geocoding, and no unconfirmed components. No production customer record was
changed. Physical iPhone/Android acceptance remains required after rebuilding.
