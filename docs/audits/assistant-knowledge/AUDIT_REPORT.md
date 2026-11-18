# Route Logistics AI Assistant Knowledge Accuracy Audit

## Executive result

- Catalog: **75 source-verified questions** and **85 role/context cases**.
- Strict accuracy: **100%** (PASS questions / testable questions; UNSUPPORTED excluded).
- Substantially useful: **100%** (PASS + PARTIAL / testable questions).
- Question results: **74 PASS**, **0 PARTIAL**, **0 FAIL**, **1 UNSUPPORTED**.
- Critical failing role/context cases: **0**.
- Runtime knowledge version inspected: `2026-11-18.2`.
- Missing source references: **0**.

This was a read-only audit of application behavior. No production assistant session, customer communication, support handoff, Firebase mutation, payment action, deployment, or runtime knowledge change occurred.

## Method and interpretation

- Each question was first verified against the current web, mobile and Functions implementation. Exact UI labels, role boundaries, disabled behavior and source references are in `VERIFIED_ANSWERS.md` and `question-catalog.json`.
- Each assistant case then ran through the real `assistantHandlers` callable code with an in-memory Firestore double. The callable derived the active membership, role, capabilities, allowed route and page category exactly as production code does.
- The callable remote adapter invoked the current Route Logistics resolver from the existing local Merxus backend checkout and returned its message through the callable normalization/acknowledgment path.
- No live Merxus HTTP session was created because doing so would persist a production conversation, contrary to the read-only/no-production-mutation constraint. Provider transport/persistence was therefore not recertified by this audit.
- Evaluation uses groups of required factual/procedural concepts and explicit permission-denial checks, not exact prose matching. Strict accuracy is PASS / (PASS + PARTIAL + FAIL); disabled/unsupported questions are excluded from the denominator.

## Results by category

| Category | Questions | PASS | PARTIAL | FAIL | UNSUPPORTED | Strict accuracy |
|---|---:|---:|---:|---:|---:|---:|
| Customers, prospects and estimates | 20 | 20 | 0 | 0 | 0 | 100.0% |
| Jobs, scheduling and dispatch | 15 | 15 | 0 | 0 | 0 | 100.0% |
| Technician mobile workflows | 15 | 15 | 0 | 0 | 0 | 100.0% |
| Billing, payments and approvals | 10 | 9 | 0 | 0 | 1 | 100.0% |
| Accounts, permissions and troubleshooting | 15 | 15 | 0 | 0 | 0 | 100.0% |

## Critical failures

| ID | Role | Question | Actual response |
|---|---|---|---|
| — | — | None | — |

## Unsupported or deliberately disabled workflows

| ID | Question | Verified state |
|---|---|---|
| BIL-06 | Can Route Logistics collect live card payments now? | disabled |

## Remaining supported-case accuracy defects

None. All supported role/context cases pass. The disabled live-payment workflow remains explicitly unavailable and exposes no action.

## Implemented remediation and regression guardrails

1. The generated resolver contains all 75 source-verified procedures and resolves exact normalized questions before context-aware intent scoring.
2. Explicit role denials run before navigation actions, preventing unauthorized invoice, team, scheduling and conversion guidance.
3. Financial intents outrank field-work fallbacks, while disabled workflows return explicit limitations without invented actions.
4. The browser fallback consumes the same generated procedure catalog when the assistant provider is unavailable.
5. `baseline/` preserves the original results; `compare-remediation.mjs` produces case-level before/after evidence.
6. Re-run this audit when the knowledge version, capability policy, relevant UI labels, callable or Merxus resolver changes.

Implementation is validated locally. Production deployment is intentionally paused pending operator approval.
