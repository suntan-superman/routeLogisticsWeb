# Company usage metrics

The platform administrator opens **Platform administration → Company usage**. A company Owner/Admin sees a summary on **Dashboard**. Both views request an on-demand snapshot from `rlCompanyUsage`; no scheduler, subscription enforcement, or billing behavior is involved. Platform totals sum provider-specific counts. The platform response contains company names and counts, not customer names or addresses.

| Metric | Definition |
| --- | --- |
| Customers | Company-owned customer documents excluding `deletedAt` and `status: deleted`. Archived and prospect records remain in the total. |
| Active / inactive | Explicit `lifecycle`, `isActive`, or `status` values. Inactive/archived wins over an active flag; prospects and legacy records with no explicit state are shown separately. |
| Serviced in 90 days | Distinct retained customer IDs with a completed **service** job and a valid `completedAt` within the rolling 90 days. Estimate visits are excluded. |
| Service properties | Distinct normalized street address and unit pairs within one provider. A newer stored property that repeats a legacy primary address counts once. The same physical address in two providers counts in both provider totals. |
| Multi-property customers | Retained customers with more than one distinct address and unit pair. |
| Property distribution | Retained customers grouped by zero, one, two, or three-or-more distinct properties. |
| Average properties per customer | Sum of distinct address and unit pairs per retained customer, divided by retained customer count. Customers without an address contribute zero. |
| Maximum properties | Highest distinct address and unit pair count for one retained customer. |
| Active technicians | Distinct UIDs on active company memberships with the `technician` role. Managers, owners, pending and deactivated memberships are excluded. Duty and field assignment eligibility are separate from membership status. |
| Completed visits in 30 days | Completed non-deleted service jobs with a valid `completedAt` within the rolling 30 days. Estimate visits are excluded. |
| Monthly trend | Completed service visits by UTC month for up to 12 recent months where timestamps exist; the detail view shows the latest six populated months. |

These are document counts, not globally deduplicated people. Address normalization resolves punctuation and common street abbreviations, but cannot prove two differently entered addresses represent the same physical location. Completed legacy jobs without `completedAt` are omitted from recent activity rather than dated by their schedule. Historic customer activity earlier than 90 days remains in the customer total. No customer records are rewritten.

The snapshot reads the current tenant's customer, membership and completed-job documents. Platform administrators may explicitly request all-company totals; ordinary Owners/Admins can request only their own company. The web UI does not poll usage automatically and provides a Refresh usage action. A future material increase in tenants or completed jobs would warrant maintained aggregate counters; this release does not create recurring scans.
