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
components and coordinates are cleared, and only coordinates from server
validation can replace them. No Maps lookup runs merely from selecting a
customer or enabling editing. Existing configured coverage still validates
the explicit service property on save; unconfigured providers retain their
existing scheduling behavior. Other estimate and service-plan workflows retain
their explicit address-selection behavior.

Successful permanent saves refresh the scheduling form's customer default
without requiring a page reload. Recorded addresses on other jobs and service
plans are not rewritten. Legacy records without their own location continue to
inherit the customer's address when read; this change does not migrate those
historical records.

Backend deployment needs only `rlManageJob` and `rlReadWorkspace` (normalized
customer address/revision projection). No Firebase rules, secrets, mobile binary,
or unrelated integration changes are needed for this repair.

Tests use synthetic emulator records. No real customer address is edited during
development acceptance.

Validation: web unit/UI **260/260**; focused Firestore integration/rules
**103/103**, including **13** atomic-address cases; Functions **138 passed / 1
existing skip**; Chromium browser **27/27**, including the two new address
journeys. Web lint/build passed (two preexisting hook warnings). Firefox and
WebKit remain configured; the new address journeys have not been run in those
engines. Physical/manual acceptance is separate.
