# Appointment assignment and recurring service

Use **Jobs → New Job** (also available from Calendar). Choose the customer,
service, date, quarter-hour start time, duration and technician before saving.
Unassigned remains an explicit choice. Active technicians and the company owner
are offered; existing legacy staff assignments remain visible for review.

Availability checks scheduled jobs and future recurring reservations, including
work crossing midnight. Completed/cancelled work does not reserve time. The
current visit is excluded while editing. Conflict messages offer explicit
quarter-hour alternatives; choosing one fills the draft without saving it.
The search covers up to 14 days, using an 8 AM–6 PM default suggestion window.
Appointments outside that window are allowed. Travel, holidays and time off are
not included in these calendar checks; GPS and on-duty status are separate.

The server rechecks the live actor, technician, tenant and schedule in the save
transaction. UID-based schedule locks prevent concurrent overlapping bookings,
including legacy membership-ID aliases. Direct Firestore scheduling writes are
denied. Reopening a finished appointment also requires the scheduling callable.

Choose **Recurring appointment** for weekly, monthly or quarterly service.
The first date sets the weekday/date pattern: choose a Thursday for Thursdays.
Monthly/quarterly rules use a calendar day or the same weekday and week of the
month. Short months clamp a calendar date without drifting subsequent months.
The fifth weekday is represented as the last weekday. New series start today
or later in company time. Existing fixed-day plans are not migrated.

The first visit and its service plan are committed together. A stable booking
operation ID makes retries idempotent; changing an already-saved retry cannot
create another appointment. The selected first-visit technician becomes the
preferred technician. Future visits use either:

- **Dispatcher review** (default): unavailable/departed preferred staff leave a
  clearly flagged unassigned visit.
- **Use another available technician**: an active technician without a schedule
  conflict is assigned; otherwise the visit remains flagged for review. The
  company owner is not silently used as a replacement.

Each future occurrence is checked again. New calendar plans materialize visits
within a 14-day lookahead; later occurrences still reserve their preferred
technician in availability checks. Recurrence does not promise every future
visit can retain the preferred technician. Dates are not automatically moved.

When membership is removed, deactivated or deleted, a resumable, idempotent
worker reviews upcoming scheduled appointments. Explicit automatic-fallback
plans receive a free replacement when possible; other visits become unassigned
with a dispatcher-review reason. Completed, historical and ongoing work is
preserved. Current membership and assignment UID are rechecked before changes.
No bulk migration or production acceptance fixtures are run at deployment.

**Service Plans → Technician preference** changes preferences for future
generated visits, with saved-version checks, dirty-save feedback and a discard
warning. Existing materialized visits can be reassigned in Dispatch. Plan rows
and job/dispatch views show assignment-review warnings and server-resolved names.

Server-only scheduling state lives in `rlScheduleLocks`, `rlScheduleOperations`
and `rlScheduleReconciliations`. Calendar logic uses `functions/recurrenceRules.js`;
the shared checks are in `functions/scheduling.js`. Provider integrations are not
used by scheduling tests. Native assigned-job delivery and physical-device
acceptance remain separate from browser/emulator results.

## Validation

- Web unit/UI: **326 passed**; Functions: **167 passed, one existing skip**.
- Firestore/Storage integration and rules: **427 passed**.
- Chromium: **29/29 scenarios**. New inline-assignment and weekly-recurrence
  journeys: **6/6 across Chromium, Firefox and WebKit**. Other cross-browser
  scenarios were not rerun in this batch.
- Mobile: **229 passed**. Real Auth-emulator typed-email deletion/retry: **1 passed**.
- Web lint/build, Expo Doctor **18/18** and iOS bundle export passed. Lint retains
  the two existing Calendar/Reports hook warnings.

All mutations in acceptance tests use local synthetic fixtures. No real account,
customer, accounting transaction, email, SMS or push delivery was used. Rebuild
the mobile app for the email-confirmation field and verify its physical layout,
disabled-state handling and cancellation before using a disposable account for
an independently authorized irreversible deletion test.
