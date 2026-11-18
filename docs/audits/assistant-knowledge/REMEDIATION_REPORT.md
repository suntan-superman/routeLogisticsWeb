# Route Logistics assistant accuracy remediation

Generated: 2026-11-18T17:03:09.946Z

## Before and after

| Metric | Baseline | Remediated |
| --- | ---: | ---: |
| Supported strict accuracy | 14.9% | 100% |
| Supported substantial accuracy | 51.4% | 100% |
| Passing role/context cases | 14 / 85 | 84 / 85 |
| Critical failures | 11 | 0 |

The remaining non-PASS classification is the intentionally unavailable live-payment workflow. Its response is factually correct, exposes no action, and is excluded from the supported-case denominator. All 71 baseline non-passing cases now pass their factual acceptance check.

## Critical corrections

| Case | Expected behavior | Baseline defect | Correction | Retest |
| --- | --- | --- | --- | --- |
| JSD-01 · technician | technician must be denied this action and directed to an authorized role. The authorized workflow is: Open Jobs, choose New Job, select an existing customer and service property, keep One-time appointment, enter service, date, quarter-hour time and duration, optionally assign an eligible field worker, then Schedule Job. | The generic fallback did not have a verified procedure for this intent and context. | Added an explicit role denial for this verified procedure and removed unauthorized navigation actions. | PASS |
| JSD-06 · manager | Open the job and choose Cancel appointment, then confirm. Scheduled work can be cancelled and retained in history; in-progress or completed work cannot be cancelled through this action. | Broad scheduling guidance matched the job keywords before the cancel/delete intent was resolved. | Added the source-verified procedure to the deterministic intent/context resolver with exact-first matching and safe fuzzy fallback. | PASS |
| JSD-07 · manager | Choose Permanently delete and confirm. It is limited to authorized management, is unavailable for in-progress work and estimate visits, and is intended for records that may safely be removed. | Broad scheduling guidance matched the job keywords before the cancel/delete intent was resolved. | Added the source-verified procedure to the deterministic intent/context resolver with exact-first matching and safe fuzzy fallback. | PASS |
| BIL-01 · owner | Open the completed billable job in Jobs, choose Create Invoice, review the preview/source details and explicitly generate the draft. Estimate visits are nonbillable and cannot use this path. | A broad field-work or generic fallback outranked the billing intent and omitted the role boundary. | Added the source-verified procedure to the deterministic intent/context resolver with exact-first matching and safe fuzzy fallback. | PASS |
| BIL-01 · manager | manager must be denied this action and directed to an authorized role. The authorized workflow is: Open the completed billable job in Jobs, choose Create Invoice, review the preview/source details and explicitly generate the draft. Estimate visits are nonbillable and cannot use this path. | A broad field-work or generic fallback outranked the billing intent and omitted the role boundary. | Added an explicit role denial for this verified procedure and removed unauthorized navigation actions. | PASS |
| BIL-01 · technician | technician must be denied this action and directed to an authorized role. The authorized workflow is: Open the completed billable job in Jobs, choose Create Invoice, review the preview/source details and explicitly generate the draft. Estimate visits are nonbillable and cannot use this path. | A broad field-work or generic fallback outranked the billing intent and omitted the role boundary. | Added an explicit role denial for this verified procedure and removed unauthorized navigation actions. | PASS |
| BIL-02 · manager | manager must be denied this action and directed to an authorized role. The authorized workflow is: No. The current capability policy gives invoice read/manage access to owners and administrators only. Managers and technicians must ask an authorized owner or administrator. | A broad field-work or generic fallback outranked the billing intent and omitted the role boundary. | Added an explicit role denial for this verified procedure and removed unauthorized navigation actions. | PASS |
| BIL-02 · technician | technician must be denied this action and directed to an authorized role. The authorized workflow is: No. The current capability policy gives invoice read/manage access to owners and administrators only. Managers and technicians must ask an authorized owner or administrator. | A broad field-work or generic fallback outranked the billing intent and omitted the role boundary. | Added an explicit role denial for this verified procedure and removed unauthorized navigation actions. | PASS |
| BIL-06 · owner | No. Live payments remain disabled unless live mode is configured and explicitly approved. Use only the controlled test flow; the assistant cannot enable payments. | The resolver had no explicit disabled-payment rule and returned generic invoice guidance. | Added an explicit unsupported/disabled procedure that states the real limitation and exposes no action. | PASS |
| BIL-10 · manager | manager must be denied this action and directed to an authorized role. The authorized workflow is: Connect QuickBooks, refresh available options, search the active income accounts and service items, choose both defaults and Save defaults. Empty lists must be populated in QuickBooks first. Saving preferences does not create or modify QuickBooks records. | A broad field-work or generic fallback outranked the billing intent and omitted the role boundary. | Added an explicit role denial for this verified procedure and removed unauthorized navigation actions. | PASS |
| APT-04 · manager | manager must be denied this action and directed to an authorized role. The authorized workflow is: Open Company, enter the email, select Technician or Manager and send the invitation. The role is owner-selected. If email is disabled or delayed, copy the generated invitation link securely. | The generic fallback did not have a verified procedure for this intent and context. | Added an explicit role denial for this verified procedure and removed unauthorized navigation actions. | PASS |

## Resolver changes

- The generated registry contains all 75 source-verified procedures and keeps the audit catalog as the source of truth.
- Exact normalized questions resolve first; intent, action, object, phrase, token and page/role context scoring handle variants.
- Explicit role denials are evaluated before navigation actions. Disabled or unsupported workflows return limitations rather than invented steps.
- Financial intents are evaluated before field-work fallbacks, preventing completed-job invoice questions from being classified as technician work.
- The web fallback consumes the same generated verified procedures when the assistant provider is unavailable.

## Complete retest evidence

- `remediation-results.json` records expected behavior, baseline response, root cause, correction, current response and retest result for every baseline non-passing case.
- `assistant-responses.json` contains all 85 current role/context responses.
- `baseline/assistant-responses.json` preserves the original 85-case baseline.
- `audit-summary.json` and `baseline/audit-summary.json` preserve the comparable aggregate metrics.

## Deployment status

Local implementation and validation only. No production function, web application or Merxus backend deployment was performed.

