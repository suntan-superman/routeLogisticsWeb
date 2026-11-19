# Technician location history

Route Logistics records new mobile shift GPS fixes in `rlLocationHistory`. Existing `rlLocations` remains the latest-fix record used by the live team map. Historical routes begin only after this feature is deployed; previous `rlLocations` documents were overwritten and cannot be used to reconstruct past movement.

## Collection and access

Each accepted fix stores the company, user, membership, shift and session identifiers, coordinates, reported accuracy, device capture time, server receipt time, and expiry time. The deterministic document ID makes delivery retries idempotent. Out-of-order offline fixes are kept in history if they are valid for the active shift, even when they do not replace the latest live fix. The client Firestore rules deny direct access; management pages use callable functions that re-check the caller’s active company membership and require the `locations.viewTeam` capability. Technician roles cannot list members or read history. Every history query is additionally scoped to the caller’s company and a verified technician membership.

Shift start/end and sharing start/stop states are stored separately in `rlLocationHistoryEvents`. A missing sample is reported as a GPS gap because the available data cannot establish whether GPS, app, permission, or connectivity caused it. Explicit stop events identify known disabled intervals. If a device is offline when sharing stops, the local stop still happens immediately; the server may have no stop event, so the display remains an unexplained gap.

## Retention and privacy

The company owner’s existing location-retention setting applies to the latest fix, history samples, and tracking-state events. The default is 24 hours; the owner can choose 1 to 168 hours. New records expire relative to their capture or event time. Reducing the policy shortens existing expiry times; increasing it does not restore or extend already-recorded data. An hourly cleanup deletes expired history and events. Account deletion also removes the staff member’s retained location history.

The web privacy notice explains shift consent, management access, retention, and gaps. Map routes connect only recorded fixes. Stop detection omits fixes with reported accuracy worse than 50 m, uses a default 100 m radius and 15 minute dwell, and allows management to adjust radius and dwell for review. Arrival/departure are estimates from the first and last qualifying fixes, not verified property visits. Approximate address resolution is a user-triggered Google Maps geocode, limited to 30 stops per request; the displayed address may identify a nearby street or parcel.

## Query and cost limits

History is queried by company, technician, and capture-time range with a composite Firestore index, ordered by capture time. Requests are limited to seven calendar days in the UI, at most eight UTC days to account for daylight-saving boundaries, and 200 GPS fixes per page. A page can read up to 201 point documents and up to 201 tracking-state events to detect the next page and report event truncation. The technician picker reads at most 501 company memberships. Use narrower date ranges when reviewing a large team or a dense 1-minute reporting policy. Address resolution incurs Google Maps geocoding requests only when explicitly selected.

Changing retention scans the company’s latest-location, history, and tracking-event records, then applies expiry updates in batches of 400. Owners should expect that one-time read/write cost to grow with the amount of retained team history. The normal cleanup function processes at most 4,000 expired documents per collection per hourly run and continues on subsequent runs if a tenant has a larger backlog.
