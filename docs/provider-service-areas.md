# Provider geographic service areas

## Provider setup

Open **Company Setup → Service Areas** (`/company-setup`) in the web application. The current company owner and active managers can save coverage. Administrators and technicians cannot change these settings; only the current owner can approve an out-of-area exception.

Save a physical US business operating address and either a ZIP-code list or a radius from that validated address. ZIP+4 entries normalize to five digits; lists support up to 500 ZIP codes. Radius coverage uses straight-line distance, including the boundary, with a range of 0.1–300 miles. Optional service-category overrides replace the default coverage for the selected category. Categories come from the company's existing service-category catalog.

The default toggles are off: accepting new customers, publishing coverage, and allowing owner-approved out-of-area exceptions. An unconfigured provider retains existing internal scheduling behavior; future public requests and bookings fail closed until coverage is configured. Accepting-new-customers applies to those future public workflows and does not cancel existing work.

The form saves only changed settings, confirms success or failure, warns before discarding changes, and rejects a stale revision when another session has saved. Preview uses saved coverage. Radius preview draws a circle; ZIP preview lists the actual saved ZIP codes and marks the operating location without inventing ZIP boundary polygons.

## Service property and authorization

Jobs, service plans, and estimates have an explicit **Service property** field. The property is the site where work will occur, independently of the customer's contact or billing address. The user can explicitly copy the displayed address into this field. The server never substitutes billing addresses, device GPS, client coordinates, or client-provided eligibility flags for configured coverage checks.

For configured providers, creating a job, estimate, or service plan validates the property server-side. Explicit property or service-category changes require another check. Converting an approved estimate into a new job checks current scheduling eligibility and preserves the approved property's identity; a different property requires a revised estimate. Invalid or insufficiently precise physical addresses fail safely with an actionable error.

Outside properties are rejected unless the owner has explicitly approved an exception and optional exceptions are enabled. An approval records a reason and expires after 24 hours. It is bound to the tenant, validated property, service category, workflow purpose, policy revision, and current owner. A manager can use a valid owner approval but cannot grant one. A changed territory, expired/revoked approval, changed owner, or mismatched property/category/purpose requires a fresh check or approval. An exception never expands the territory.

## Existing records

Saving or changing coverage does not rewrite customers, historical jobs, appointments, estimates, or service plans. Ordinary status, notes, date/time, assignment, and other non-geographic edits do not revalidate an existing appointment against a new boundary.

Existing service-plan continuations retain their established property and historical eligibility. Generating the next recurring visit does not invalidate the plan because coverage changed. New plans and explicit geographic edits use the checked server workflow. Previously completed estimate conversions remain idempotent after a boundary change. No customer-history scan automatically establishes or expands coverage.

## Server integration

The existing Firebase project remains `mi-factotum-field-service`. The existing browser Maps configuration remains unchanged. Server address checks use Google's Address Validation API with Application Default Credentials from the Functions runtime and the existing Google Cloud project. No new Maps API key, client secret, service-account JSON file, or mobile credential is introduced. Required API/billing/IAM availability must be verified during deployment; provider failures reject configured checks instead of bypassing coverage.

The callable entry points are:

| Callable | Purpose |
| --- | --- |
| `rlServiceAreas` | Tenant-authorized `status`, `save`, `check`, and owner-only `approveException` actions. |
| `rlManageJob` | Existing job creation and explicit geographic updates, with server validation. |
| `rlEstimate` | Estimate creation/geographic revisions and approved-estimate conversion. |
| `rlManageServicePlan` | Service-plan creation and explicit geographic updates. |

Private collections are `rlServiceAreas`, `rlServiceAreaExceptions`, `rlServiceAreaAudit`, and `rlServiceAreaGeocodes`. Clients cannot directly read or write these records. Authorized settings/check responses come through the callable. Tenant policy revisions, live actor membership or ownership, provider/catalog state, and applicable exception state are checked again in the Firestore transaction after address validation. Membership revoked during an address lookup cannot finish a geographic write. Client-supplied approval snapshots cannot substitute for the server-issued result. Configured providers cannot bypass these checks by directly creating geography-bearing jobs, appointments, legacy estimates, or service plans through Firestore.

Validated service-property snapshots are stored on work records for routing and assigned-work access. This does not expose territory boundaries to technicians or other tenants. The publication toggle records an explicit provider preference; this phase introduces no public coverage endpoint or marketplace directory.

An explicit service-property snapshot also takes precedence over old job address fields and customer billing coordinates in assigned-work responses, recurring visits, and daily routes. If that property has no usable coordinates, routing uses its address for a later lookup rather than substituting billing coordinates. Legacy jobs with no explicit service property keep their established address fallback behavior. These changes are in the web settings/scheduling editors and existing backend APIs; the mobile app consumes assigned-work snapshots through its existing API and does not require a native rebuild for this feature.

## Future public requests and bookings

Reuse `serviceAreaHandlers(...).checkForWorkflow(...)` with a fixed server-selected purpose: `scheduling`, `estimate`, `public-request`, or `booking`. Public-request and booking checks require configured coverage, a provider accepting new customers, and a valid offered category where a catalog is present. Never accept a purpose or eligibility decision from an untrusted browser as the authorization decision.

Check the property before creating the work record, then pass the unchanged server-issued result to `assertWorkflowCurrent` inside the record-creation transaction. Do not serialize or clone that result before the transaction assertion. Expose only `publicEligibility(result)` to future anonymous requesters; it contains eligibility, status, and a message, not operating addresses, boundaries, or another customer's address. Any future publication endpoint must independently honor `publishCoverage`.

Public provider discovery, homeowner request forms, marketplace booking, public coverage publication, and payment collection remain outside this phase.

## Validation

The workflow emulator suite covers explicit property versus billing, invalid/outside addresses, category overrides, owner exceptions, tenant/technician denial, stale policy and revoked-exception races, boundary changes, existing records, estimate conversion, and recurring-plan continuity. Core tests additionally cover ZIP/radius boundaries, public-mode fail-closed behavior, address-provider errors, and direct-write security rules. Synthetic fixtures and stub address responses avoid paid Maps calls during automated tests. Deployment and any controlled provider API acceptance checks are recorded separately by the deployment operator.

Implementation validation on November 14, 2026 passed all 205 web tests, all 289 checks in the full Firestore/Storage emulator run, and all 51 final targeted workflow/routing/authorization checks. Functions unit checks passed (129 passed; the native-push emulator test is skipped outside the emulator and passes in the full emulator run). The web build and lint passed with two pre-existing hook warnings. Twelve synthetic Chrome checks at phone and desktop widths found no horizontal overflow, browser exceptions, or axe accessibility violations. Two controlled Google Address Validation requests for public business addresses returned validated premise-level geocodes; no customer addresses were used.

Synthetic Chrome acceptance checks passed at 390px and 1440px for owner and manager settings, technician denial, saved radius preview, outside-property warnings, and owner approval (12 scenarios). These checks found no horizontal overflow, browser exceptions, or WCAG A/AA axe violations. The browser harness and screenshots remain ignored local artifacts under `.migration/service-areas-browser/`; its Maps and backend calls are mocked.
