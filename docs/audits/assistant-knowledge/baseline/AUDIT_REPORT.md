# Route Logistics AI Assistant Knowledge Accuracy Audit

## Executive result

- Catalog: **75 source-verified questions** and **85 role/context cases**.
- Strict accuracy: **14.9%** (PASS questions / testable questions; UNSUPPORTED excluded).
- Substantially useful: **51.4%** (PASS + PARTIAL / testable questions).
- Question results: **11 PASS**, **27 PARTIAL**, **36 FAIL**, **1 UNSUPPORTED**.
- Critical failing role/context cases: **11**.
- Runtime knowledge version inspected: `2026-11-18.1`.
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
| Customers, prospects and estimates | 20 | 7 | 11 | 2 | 0 | 35.0% |
| Jobs, scheduling and dispatch | 15 | 2 | 5 | 8 | 0 | 13.3% |
| Technician mobile workflows | 15 | 0 | 5 | 10 | 0 | 0.0% |
| Billing, payments and approvals | 10 | 1 | 2 | 6 | 1 | 11.1% |
| Accounts, permissions and troubleshooting | 15 | 1 | 4 | 10 | 0 | 6.7% |

## Critical failures

| ID | Role | Question | Actual response |
|---|---|---|---|
| JSD-01 | technician | How do I create a one-time job for an existing customer? | I can help you find the correct Route Logistics page or explain a supported workflow. Ask what you want to do. I am not certain which workflow you mean; name the task, such as creating an inquiry, scheduling a job, completing field work, preparing an estimate, or reviewing an invoice. |
| JSD-06 | manager | How do I cancel an appointment? | Use Jobs to create or edit the appointment, select its service property and quarter-hour start time, then choose an eligible field worker and review conflicts. Use Dispatch to review potentially late, overdue, or reassignment-requested work and to reassign when authorized. |
| JSD-07 | manager | How do I permanently delete a test job? | On Jobs, choose the customer and service property, schedule on a quarter hour, check field-staff availability, and assign the appointment before saving. I am not certain which workflow you mean; name the task, such as creating an inquiry, scheduling a job, completing field work, preparing an estimate, or reviewing an invoice. |
| BIL-01 | owner | How do I create an invoice from a completed job? | Open My Work and select the assigned visit. Record arrival/departure, photos, notes, checklist entries, and completion details. Offline drafts stay on the device until server synchronization is confirmed; do not discard a draft that is still waiting to sync. |
| BIL-01 | manager | How do I create an invoice from a completed job? | Open My Work and select the assigned visit. Record arrival/departure, photos, notes, checklist entries, and completion details. Offline drafts stay on the device until server synchronization is confirmed; do not discard a draft that is still waiting to sync. |
| BIL-01 | technician | How do I create an invoice from a completed job? | Open My Work and select the assigned visit. Record arrival/departure, photos, notes, checklist entries, and completion details. Offline drafts stay on the device until server synchronization is confirmed; do not discard a draft that is still waiting to sync. |
| BIL-02 | manager | Can a manager or technician create or view invoices? | I can help you find the correct Route Logistics page or explain a supported workflow. Ask what you want to do. I am not certain which workflow you mean; name the task, such as creating an inquiry, scheduling a job, completing field work, preparing an estimate, or reviewing an invoice. |
| BIL-02 | technician | Can a manager or technician create or view invoices? | On My Work, open an assigned visit, record arrival and departure, save notes and photos, complete checklists, and synchronize offline drafts before completion. I am not certain which workflow you mean; name the task, such as creating an inquiry, scheduling a job, completing field work, preparing an estimate, or reviewing an invoice. |
| BIL-06 | owner | Can Route Logistics collect live card payments now? | On Invoices, authorized owners or administrators can preview billable work, explicitly generate an invoice, review status, make audited corrections, and inspect payment history. I am not certain which workflow you mean; name the task, such as creating an inquiry, scheduling a job, completing field work, preparing an estimate, or reviewing an invoice. |
| BIL-10 | manager | How do I choose the default QuickBooks income account and service item? | I can help you find the correct Route Logistics page or explain a supported workflow. Ask what you want to do. I am not certain which workflow you mean; name the task, such as creating an inquiry, scheduling a job, completing field work, preparing an estimate, or reviewing an invoice. |
| APT-04 | manager | How does the owner invite a technician or manager? | On Company, authorized users can review team roles, field-work eligibility, services, service areas, availability, and company settings. I am not certain which workflow you mean; name the task, such as creating an inquiry, scheduling a job, completing field work, preparing an estimate, or reviewing an invoice. |

## Unsupported or deliberately disabled workflows

| ID | Question | Verified state |
|---|---|---|
| BIL-06 | Can Route Logistics collect live card payments now? | disabled |

## Categorized defects

The current resolver has nine broad intents and matches them in fixed order. The principal defect classes found by this audit are:

1. **Over-broad intent routing.** Terms such as customer, service property, assignment, payment, notification, and company divert detailed questions into generic answers.
2. **Missing workflow granularity.** Recurring pause/resume, cancellation/deletion, invoice replacement, offline draft recovery, login/account deletion, and QuickBooks defaults lack dedicated verified procedures.
3. **Incomplete role nuance.** The callable correctly derives role/capabilities, but the upstream resolver often returns the same generic procedure or only a broad denial.
4. **Missing explicit limitations.** Advisory address checks, assignment after approved-estimate conversion, test-payment isolation, offline prerequisites, and disabled production accounting/payments are frequently omitted.
5. **Navigation mismatch.** Some answers name a broad page but omit the actual control labels needed to finish the task.

| ID | Role | Result | Severity | Reason |
|---|---|---|---|---|
| CPE-02 | manager | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| CPE-03 | manager | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| CPE-04 | manager | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| CPE-05 | manager | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| CPE-06 | manager | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| CPE-07 | manager | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| CPE-09 | technician | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| CPE-10 | manager | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| CPE-11 | technician | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| CPE-14 | manager | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| CPE-17 | manager | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| CPE-18 | manager | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| CPE-19 | technician | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| JSD-01 | manager | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| JSD-01 | technician | FAIL | critical | The response did not enforce the verified role boundary. |
| JSD-02 | manager | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| JSD-03 | manager | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| JSD-04 | manager | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| JSD-05 | manager | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| JSD-06 | manager | FAIL | critical | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| JSD-07 | manager | FAIL | critical | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| JSD-08 | manager | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| JSD-10 | manager | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| JSD-11 | manager | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| JSD-12 | manager | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| JSD-14 | technician | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| JSD-15 | technician | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| MOB-01 | technician | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| MOB-02 | manager | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| MOB-02 | technician | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| MOB-03 | technician | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| MOB-04 | technician | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| MOB-05 | technician | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| MOB-06 | technician | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| MOB-07 | technician | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| MOB-08 | technician | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| MOB-09 | technician | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| MOB-10 | technician | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| MOB-11 | technician | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| MOB-12 | technician | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| MOB-13 | technician | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| MOB-14 | technician | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| MOB-15 | technician | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| BIL-01 | owner | FAIL | critical | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| BIL-01 | manager | FAIL | critical | The response did not enforce the verified role boundary. |
| BIL-01 | technician | FAIL | critical | The response did not enforce the verified role boundary. |
| BIL-02 | manager | FAIL | critical | The response did not enforce the verified role boundary. |
| BIL-02 | technician | FAIL | critical | The response did not enforce the verified role boundary. |
| BIL-04 | owner | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| BIL-05 | owner | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| BIL-07 | owner | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| BIL-08 | owner | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| BIL-09 | owner | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| BIL-10 | owner | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| BIL-10 | manager | FAIL | critical | The response did not enforce the verified role boundary. |
| APT-01 | owner | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| APT-02 | manager | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| APT-03 | technician | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| APT-04 | owner | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| APT-04 | manager | FAIL | critical | The response did not enforce the verified role boundary. |
| APT-05 | technician | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| APT-06 | technician | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| APT-07 | manager | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| APT-08 | manager | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| APT-09 | technician | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| APT-10 | technician | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| APT-11 | manager | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| APT-12 | manager | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |
| APT-13 | owner | PARTIAL | moderate | The response is directionally correct but omits material verified steps or limitations. |
| APT-15 | manager | FAIL | major | The response is incorrect, misleading, or too generic to complete the verified workflow. |

## Smallest practical corrections (not implemented)

1. Expand the version-controlled Route Logistics knowledge registry from broad topics to the audited task IDs, reusing the verified answers and source references in `question-catalog.json`.
2. Send a compact task/role manifest to Merxus and resolve by stable knowledge ID before falling back to broad regex intent matching.
3. Add explicit role variants for Owner/Admin, Manager, Technician and customer-only workflows; continue deriving capabilities only in `rlAssistant`.
4. Add regression fixtures from `assistant-responses.json` with concept-level assertions and forbidden-claim checks, not exact prose matching.
5. Keep disabled features explicit (live Stripe, production QuickBooks writes) and never turn a limitation into navigation to a nonexistent or unauthorized action.
6. Re-run this audit in CI whenever the knowledge version, capability policy, relevant UI labels, callable, or Merxus resolver changes.

Implementation is intentionally paused pending review and approval.
