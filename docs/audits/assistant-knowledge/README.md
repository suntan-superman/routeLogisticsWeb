# Assistant knowledge audit artifacts

This directory contains a read-only accuracy audit for the Route Logistics assistant.

## Artifacts

- `catalog.mjs` — maintained 75-question source-verified catalog.
- `question-catalog.json` — generated machine-readable catalog.
- `VERIFIED_ANSWERS.md` — human-readable verified procedures and source references.
- `assistant-responses.json` — full actual responses and factual classifications.
- `ASSISTANT_COMPARISON.md` — readable actual-response comparison.
- `audit-summary.json` and `AUDIT_REPORT.md` — metrics, critical failures and recommendations.
- `run-audit.mjs` — repeatable no-network full-path harness.
- `baseline/` — preserved pre-remediation metrics, responses, report and resolver source.
- `compare-remediation.mjs` — repeatable before/after comparison.
- `remediation-results.json` and `REMEDIATION_REPORT.md` — case-level corrections and acceptance results.

## Run

From the repository root:

`node docs/audits/assistant-knowledge/run-audit.mjs`

Then generate the before/after evidence:

`node docs/audits/assistant-knowledge/compare-remediation.mjs`

The harness uses the real Route Logistics `assistantHandlers` callable logic, an in-memory Firestore double, server-derived role/capability policy, and the current local Merxus Route Logistics resolver. It does not contact production or persist conversations.

A missing local Merxus reference checkout is reported as a blocker; do not replace this command with a production chat run because that would mutate conversation/support records.
