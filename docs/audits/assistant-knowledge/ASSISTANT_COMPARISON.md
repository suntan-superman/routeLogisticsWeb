# Route Logistics Assistant — Actual Response Comparison

The responses below were produced through the real `assistantHandlers` callable path using an in-memory Firestore double and the current local Merxus Route Logistics resolver. No network or production data was used.

## CPE-01 — manager — PASS

**Question:** How do I create a request for an estimate for a new or prospective customer?

**Callable context:** requested `/customers`; sent `/customers` / `customers`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open Customers and choose New Inquiry. Choose Create inquiry for a new prospect, enter contact, service property, Service requested, category and follow-up details, then Save inquiry. From the saved inquiry choose Schedule Estimate. Do not start with Schedule New Job.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## CPE-01 — owner — PASS

**Question:** How do I create a request for an estimate for a new or prospective customer?

**Callable context:** requested `/customers`; sent `/customers` / `customers`; role `owner`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open Customers and choose New Inquiry. Choose Create inquiry for a new prospect, enter contact, service property, Service requested, category and follow-up details, then Save inquiry. From the saved inquiry choose Schedule Estimate. Do not start with Schedule New Job.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## CPE-02 — manager — PASS

**Question:** How do I schedule an estimate visit for an existing customer?

**Callable context:** requested `/customers`; sent `/customers` / `customers`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Create an inquiry, search for and select the existing customer and property, describe the requested service, save, then choose Schedule Estimate and review date, quarter-hour time, property and eligible field worker.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts. Missing concept groups: `new inquiry`.

## CPE-03 — manager — PASS

**Question:** How do I add a customer without first creating an inquiry?

**Callable context:** requested `/customers`; sent `/customers` / `customers`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> On Customers choose Add Customer, enter identity/contact and address fields, then save. Use New Inquiry instead when the contact is still a prospect requesting an estimate.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## CPE-04 — manager — PASS

**Question:** How does Route Logistics prevent a duplicate prospect or customer?

**Callable context:** requested `/customers`; sent `/customers` / `customers`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Search existing customers by name, email, phone or service address. If possible matches appear, reuse the correct record; creating a separate prospect requires explicit confirmation and a reason.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## CPE-05 — manager — PASS

**Question:** How do I manage more than one service property for a customer?

**Callable context:** requested `/customers`; sent `/customers` / `customers`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open the customer, use the Service properties section to add or edit labeled properties, validate the service address and save. Scheduling must select the property where service occurs, not the billing address.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## CPE-06 — manager — PASS

**Question:** Can I change the service property while creating an appointment and save it permanently?

**Callable context:** requested `/jobs`; sent `/jobs` / `scheduling`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Choose Enable Editing before changing the populated address. Google validation is advisory for internal scheduling. Select the option to save the address to the customer when the change should be permanent; otherwise it applies only to the job.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## CPE-07 — manager — PASS

**Question:** How do I check whether a prospect property is inside our service area?

**Callable context:** requested `/customers`; sent `/customers` / `customers`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Enter the service property and category, expand Check coverage / owner exception, and run the eligibility check. An authorized owner can approve an explicit out-of-area exception; the server rechecks eligibility.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## CPE-08 — manager — PASS

**Question:** How do I assign an estimate visit to a field worker?

**Callable context:** requested `/customers`; sent `/customers` / `customers`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> From the saved inquiry choose Schedule Estimate. In the scheduling dialog confirm the Estimate visit kind, select an eligible field worker under Assigned technician, review conflicts and alternatives, then save.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## CPE-09 — technician — PASS

**Question:** How does a technician open an assigned estimate visit?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> In Field mode open the assigned estimate visit, complete the visit workflow, then choose Prepare Estimate. Technicians can prepare only an assigned estimate and cannot approve it as management.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## CPE-10 — manager — PASS

**Question:** How do I add labor to an estimate?

**Callable context:** requested `/estimates`; sent `/estimates` / `estimates`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open the draft, choose Add labor line, enter description, quantity and unit price, then save the versioned draft. Server calculation determines totals.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts. Missing concept groups: `estimates`.

## CPE-11 — technician — PASS

**Question:** How do I add materials to an estimate?

**Callable context:** requested `/estimates`; sent `/estimates` / `estimates`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open the draft, choose Add material line, enter description, quantity and unit price, then save the versioned draft.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts. Missing concept groups: `estimate`.

## CPE-12 — technician — PASS

**Question:** Can I add notes and photos to an estimate?

**Callable context:** requested `/estimates`; sent `/estimates` / `estimates`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Yes. Add scope/notes and capture or select photos in the estimate draft. Photos are retained locally until uploaded and attached to a saved version; keep the draft until synchronization is confirmed.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## CPE-13 — technician — PASS

**Question:** Can I prepare and save an estimate while the mobile app is offline?

**Callable context:** requested `/estimates`; sent `/estimates` / `estimates`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> A previously loaded assigned estimate can be edited offline. The app shows saved-on-device or waiting-to-sync state and retries after reconnection. It must not be treated as server-saved until synchronization succeeds.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## CPE-14 — manager — PASS

**Question:** How do I create or share an estimate PDF?

**Callable context:** requested `/estimates`; sent `/estimates` / `estimates`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open the saved estimate version and choose Share estimate PDF. Customer email delivery is a separate action and may require management approval and enabled email.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## CPE-15 — technician — PASS

**Question:** How does a technician submit an estimate for management review?

**Callable context:** requested `/estimates`; sent `/estimates` / `estimates`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Save and synchronize the exact draft version first, then choose Submit for Review. The version becomes read-only for the technician while management reviews it.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## CPE-16 — manager — PASS

**Question:** How does a manager approve an estimate or request changes?

**Callable context:** requested `/estimates`; sent `/estimates` / `estimates`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open the submitted version. Enter review comments as needed, then choose Approve for delivery or Request changes. Approval applies only to that exact version.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## CPE-17 — manager — PASS

**Question:** How is an approved estimate sent to the customer?

**Callable context:** requested `/estimates`; sent `/estimates` / `estimates`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> After management approves the exact version, choose Email approved estimate and monitor delivery status. A technician can send directly only if the company owner enabled that policy.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## CPE-18 — manager — PASS

**Question:** How can a customer approve, decline, or request a revision to an estimate?

**Callable context:** requested `/estimates`; sent `/estimates` / `estimates`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> The customer opens the secure estimate link and acts on the exact version: approve, decline, or request a revision. A later edit creates a new version and does not rewrite the earlier decision.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## CPE-19 — technician — PASS

**Question:** How do I revise an estimate after changes are requested?

**Callable context:** requested `/estimates`; sent `/estimates` / `estimates`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open the revision-requested estimate, review management/customer comments, edit the draft, save a new immutable version, and submit or approve that version through the normal workflow.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## CPE-20 — manager — PASS

**Question:** How do I schedule work after a customer approves an estimate?

**Callable context:** requested `/estimates`; sent `/estimates` / `estimates`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open Estimates and locate the estimate marked Approved — scheduling needed. Choose Convert approved estimate to job, confirm required property/category or prospect conversion details, choose date and quarter-hour time, then explicitly convert. This creates one unassigned job linked to the immutable approved estimate and pricing. Technician selection is not currently inside the conversion dialog; assign the technician later in Jobs or Dispatch.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## CPE-20 — technician — PASS

**Question:** How do I schedule work after a customer approves an estimate?

**Callable context:** requested `/estimates`; sent `/estimates` / `estimates`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Your role cannot convert a customer-approved estimate into scheduled work. Ask an authorized manager, administrator, or owner. Do not create an unrelated new job.

**Evaluation:** The response enforced the verified role boundary.

## JSD-01 — manager — PASS

**Question:** How do I create a one-time job for an existing customer?

**Callable context:** requested `/jobs`; sent `/jobs` / `scheduling`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open Jobs, choose New Job, select an existing customer and service property, keep One-time appointment, enter service, date, quarter-hour time and duration, optionally assign an eligible field worker, then Schedule Job.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## JSD-01 — technician — PASS

**Question:** How do I create a one-time job for an existing customer?

**Callable context:** requested `/jobs`; sent `/` / `dashboard`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Your role can review assigned work but cannot create or schedule company jobs. Ask an authorized manager, administrator, or owner. Use My Work for assigned visits.

**Evaluation:** The response enforced the verified role boundary.

## JSD-02 — manager — PASS

**Question:** How do I create a recurring weekly, monthly, or quarterly appointment?

**Callable context:** requested `/jobs`; sent `/jobs` / `scheduling`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Choose Recurring appointment, select the frequency/pattern and first service date, configure preferred technician and fallback behavior, review availability, then save. The recurring Service Plan creates future jobs.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## JSD-03 — manager — PASS

**Question:** Can I assign a technician before saving a new job?

**Callable context:** requested `/jobs`; sent `/jobs` / `scheduling`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Yes. Select Assigned technician before saving. Only field-eligible staff appear; review schedule conflicts and alternatives before Schedule Job.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## JSD-04 — manager — PASS

**Question:** What happens if the selected technician has a schedule conflict?

**Callable context:** requested `/jobs`; sent `/jobs` / `scheduling`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> The availability check shows overlapping work and alternate times/dates. Choose a conflict-free alternative or deliberately leave unassigned/review the warning; travel time is not included in the conflict check.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## JSD-05 — manager — PASS

**Question:** Why is a manager or owner missing from the assignment list?

**Callable context:** requested `/company-setup`; sent `/company-setup` / `company`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Role and field-work eligibility are separate. Open Company and enable field assignment for that staff member. Office-only managers retain management access but do not appear for new field assignments.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## JSD-06 — manager — PASS

**Question:** How do I cancel an appointment?

**Callable context:** requested `/jobs`; sent `/jobs` / `scheduling`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open the job and choose Cancel appointment, then confirm. Scheduled work can be cancelled and retained in history; in-progress or completed work cannot be cancelled through this action.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## JSD-07 — manager — PASS

**Question:** How do I permanently delete a test job?

**Callable context:** requested `/jobs`; sent `/jobs` / `scheduling`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Choose Permanently delete and confirm. It is limited to authorized management, is unavailable for in-progress work and estimate visits, and is intended for records that may safely be removed.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## JSD-08 — manager — PASS

**Question:** How do I skip one recurring visit or pause recurring service for a period?

**Callable context:** requested `/service-plans`; sent `/service-plans` / `service-plans`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open Service Plans, choose Pause, then select Skip the next occurrence only, Pause through a date, or Pause indefinitely. Already-created Jobs remain individually manageable. Use Resume to reactivate an indefinite pause.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## JSD-09 — manager — PASS

**Question:** How do I reassign a job from the web app?

**Callable context:** requested `/dispatch`; sent `/dispatch` / `dispatch`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open Dispatch or the job in Jobs, select a different eligible field worker in Assigned to, review conflicts/availability, and save. A technician cannot self-reassign without management.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## JSD-09 — technician — PASS

**Question:** How do I reassign a job from the web app?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> A technician cannot directly reassign a company job. Use Request reassignment on the assigned work order; an authorized manager, administrator, or owner reviews and changes the assignment.

**Evaluation:** The response enforced the verified role boundary.

## JSD-10 — manager — PASS

**Question:** How does a manager reassign scheduled work in the mobile app?

**Callable context:** requested `/dispatch`; sent `/dispatch` / `dispatch`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Switch to Management mode, open Scheduled jobs, select the job and choose an eligible staff member. Review conflicts before confirming. Technicians instead submit a reassignment request.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## JSD-11 — manager — PASS

**Question:** How do I calculate and save a technician’s daily route?

**Callable context:** requested `/routes`; sent `/routes` / `routes`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open Daily Routes, select the technician and service date, choose Load jobs, set the start/departure options, choose Calculate route, review warnings, and then choose Save stop order. Route optimization requires valid service locations.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## JSD-12 — manager — PASS

**Question:** How do I show jobs and technician locations on the dispatch map?

**Callable context:** requested `/dispatch`; sent `/dispatch` / `dispatch`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open Dispatch, choose the service date and filters, show the map, and locate unmapped service addresses in controlled batches. Job markers and on-duty team positions are distinct; GPS freshness does not prove availability.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## JSD-13 — manager — PASS

**Question:** Where do I review potentially late, overdue, or reassignment-requested jobs?

**Callable context:** requested `/dispatch`; sent `/dispatch` / `dispatch`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Use Dispatch and select Potentially late, Overdue, or Reassignment requested. These indicators do not automatically change assignments or prove technician absence.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## JSD-14 — technician — PASS

**Question:** How do job statuses change from scheduled to completed?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Assigned field staff progress authorized work through en-route/in-progress and completion using the job workflow. Completion requires work completed text and preserves visit/checklist/photo drafts. Managers can review status but must not bypass assignment controls.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## JSD-15 — technician — PASS

**Question:** Why can’t I see or open a job that should be assigned to me?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Confirm the signed-in workspace, active membership, current assignment and non-cancelled status. Refresh assigned work after reconnecting. Technicians see only authorized assigned jobs; ask management to correct assignment rather than weakening access.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## MOB-01 — technician — PASS

**Question:** How does a technician sign in on mobile with a password or email code?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Choose Password or Email code. For Email code request the newest six-digit code and enter it within ten minutes. An invitation must still be accepted separately before company access exists.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## MOB-02 — manager — PASS

**Question:** What is the difference between Field and Management mode?

**Callable context:** requested `/`; sent `/` / `dashboard`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Field mode shows the signed-in person’s assigned work. Management mode exposes authorized operational summaries and management actions. A technician has Field access only; switching mode does not change role or permissions.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## MOB-02 — technician — PASS

**Question:** What is the difference between Field and Management mode?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Field mode shows the signed-in person’s assigned work. Management mode exposes authorized operational summaries and management actions. A technician has Field access only; switching mode does not change role or permissions.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## MOB-03 — technician — PASS

**Question:** How do I go On Duty or Off Duty?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Tap the status button in the Home header, then Start shift or End shift. On Duty is a server shift state; Off Duty stops work-location sharing on the device after the end is confirmed.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## MOB-04 — technician — PASS

**Question:** When is my location shared with the manager or owner?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Location is shared only during an active On Duty shift after device permission/consent. Background sharing depends on the selected option and OS permission. End shift to stop; recording a visit does not start continuous sharing.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## MOB-05 — technician — PASS

**Question:** Can I open and work on a job while offline?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Yes, only if the authorized job was opened/cached online first. Offline work is saved in the company/user/role/membership scope and must synchronize after reconnection; access is revalidated before server changes.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## MOB-06 — technician — PASS

**Question:** Will work-note drafts survive closing or restarting the mobile app?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Typed work notes are persisted per company/user/job and restored after restart. Use Save work notes to queue synchronization. Do not discard the draft until Saved to server is shown.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## MOB-07 — technician — PASS

**Question:** How do I take or choose a job photo and what happens offline?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open Photos and choose Camera or Gallery, grant permission when requested, select/capture the image and save/queue it. The retained file and operation survive offline restart and show waiting/sync/error state with retry.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## MOB-08 — technician — PASS

**Question:** How do I record arrival at a job?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Choose Record arrival, optionally attach a current GPS sample, then save the visit event. The original event time and operation ID are retained offline. Arrival evidence does not independently prove access.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## MOB-09 — technician — PASS

**Question:** How do I record departure from a job?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Choose Record departure, optionally include a current GPS sample, then save. Confirm the green/completed state or synchronization label before leaving the workflow.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## MOB-10 — technician — PASS

**Question:** What should I record if I cannot access the property?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Choose Couldn’t access property, enter the required explanation, optionally include GPS evidence, and save the access-blocked visit event. This records evidence; it does not automatically complete or cancel the job.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## MOB-11 — technician — PASS

**Question:** Why do I see a service checklist and which template should I use?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> A manager attaches the company/service-appropriate template. Technicians complete the pinned template but cannot choose or replace it. The management catalog is filtered for the company/job and the server rejects an unrelated built-in template. Saved report versions remain tied to the job assignment.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## MOB-12 — technician — PASS

**Question:** What must I do before completing a job?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Save or explicitly discard open notes/photo/checklist/visit drafts, enter Work completed, optional hours/notes and estimate-visit outcome when applicable, review the confirmation, then submit. Product application is optional unless company policy says otherwise.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts. Missing concept groups: `review completion`.

## MOB-13 — technician — PASS

**Question:** What do I do when mobile synchronization fails?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Keep the local draft, reconnect, use the specific retry control and wait for Saved to server. Do not recreate the work or discard the stable operation; conflicts require management review.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## MOB-14 — technician — PASS

**Question:** How does a technician request that a job be reassigned?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open the assigned nonterminal job, choose Request reassignment, select a supported reason and add appropriate notes. Management receives the request and must resolve it; the technician does not change the assignment directly.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## MOB-15 — technician — PASS

**Question:** Where can I change mobile appearance and find the app version?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open Settings. Appearance offers System, Light and Dark and stores the choice on the device. Open About for the app version/build used by support.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## BIL-01 — owner — PASS

**Question:** How do I create an invoice from a completed job?

**Callable context:** requested `/invoices`; sent `/invoices` / `invoices`; role `owner`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open the completed billable job in Jobs, choose Create Invoice, review the preview/source details and explicitly generate the draft. Estimate visits are nonbillable and cannot use this path.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## BIL-01 — manager — PASS

**Question:** How do I create an invoice from a completed job?

**Callable context:** requested `/jobs`; sent `/jobs` / `scheduling`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Your current role does not have invoice access. Ask an authorized company owner or administrator. The assistant cannot create invoices, payments, or financial changes.

**Evaluation:** The response enforced the verified role boundary.

## BIL-01 — technician — PASS

**Question:** How do I create an invoice from a completed job?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Your current role does not have invoice access. Ask an authorized company owner or administrator. The assistant cannot create invoices, payments, or financial changes.

**Evaluation:** The response enforced the verified role boundary.

## BIL-02 — manager — PASS

**Question:** Can a manager or technician create or view invoices?

**Callable context:** requested `/invoices`; sent `/` / `dashboard`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Your current role does not have invoice access. Managers and technicians must ask an authorized company owner or administrator. The assistant cannot create invoices, payments, or financial changes.

**Evaluation:** The response enforced the verified role boundary.

## BIL-02 — technician — PASS

**Question:** Can a manager or technician create or view invoices?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Your current role does not have invoice access. Managers and technicians must ask an authorized company owner or administrator. The assistant cannot create invoices, payments, or financial changes.

**Evaluation:** The response enforced the verified role boundary.

## BIL-03 — owner — PASS

**Question:** How do I review an invoice before generating it?

**Callable context:** requested `/invoices`; sent `/invoices` / `invoices`; role `owner`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open Create Invoice from eligible completed work, review customer/source, immutable completed work, line items, totals and warnings, then explicitly create. Do not rely on the assistant to perform the financial action.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts. Missing concept groups: `preview`.

## BIL-04 — owner — PASS

**Question:** How do I correct an invoice after it has been issued?

**Callable context:** requested `/invoices`; sent `/invoices` / `invoices`; role `owner`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Do not silently rewrite issued history. Void the eligible invoice with confirmation, then use Review replacement for its job. Payment locks must be resolved first and audit history is retained.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## BIL-05 — owner — PASS

**Question:** What does a Stripe test payment change on an invoice?

**Callable context:** requested `/invoices`; sent `/invoices` / `invoices`; role `owner`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> In test mode the Payment Element creates a test PaymentIntent. Signed webhook reconciliation updates testPaymentStatus and payment audit state, but does not mark the real invoice paid.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## BIL-06 — owner — UNSUPPORTED

**Question:** Can Route Logistics collect live card payments now?

**Callable context:** requested `/invoices`; sent `/invoices` / `invoices`; role `owner`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> No. Live payments remain disabled unless live mode is configured and explicitly approved. Use only the controlled test flow; the assistant cannot enable payments.

**Evaluation:** The response recognizes that the workflow is unavailable or disabled.

## BIL-07 — owner — PASS

**Question:** What invoices and payments can a customer see in the portal?

**Callable context:** requested `/invoices`; sent `/invoices` / `invoices`; role `owner`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> After email-code verification, the customer sees only invoices and payment history linked to their authorized provider association and matching portal identity. Provider switching remains tenant-scoped.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts. Missing concept groups: `customer portal`.

## BIL-08 — owner — PASS

**Question:** How do I email an invoice and verify delivery?

**Callable context:** requested `/invoices`; sent `/invoices` / `invoices`; role `owner`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> For a draft/sent eligible invoice choose Email invoice. The app queues delivery and records status; sent status is not the same as inbox delivery, so review delivery/audit status when needed.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## BIL-09 — owner — PASS

**Question:** Is QuickBooks synchronization available and can it export accounting data?

**Callable context:** requested `/integrations`; sent `/integrations` / `integrations`; role `owner`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> The owner can connect the company sandbox and review status/options/mappings. Accounting exports are currently disabled; production synchronization is not approved. Do not use Export reviewed record until writes are deliberately enabled for a controlled environment.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts. Missing concept groups: `quickbooks`.

## BIL-10 — owner — PASS

**Question:** How do I choose the default QuickBooks income account and service item?

**Callable context:** requested `/integrations`; sent `/integrations` / `integrations`; role `owner`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Connect QuickBooks, refresh available options, search the active income accounts and service items, choose both defaults and Save defaults. Empty lists must be populated in QuickBooks first. Saving preferences does not create or modify QuickBooks records.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts. Missing concept groups: `accounting defaults`.

## BIL-10 — manager — PASS

**Question:** How do I choose the default QuickBooks income account and service item?

**Callable context:** requested `/integrations`; sent `/` / `dashboard`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Only the company owner can change QuickBooks accounting defaults. A manager cannot select or save the default income account or service item.

**Evaluation:** The response enforced the verified role boundary.

## APT-01 — owner — PASS

**Question:** What can a company owner do that other roles cannot?

**Callable context:** requested `/company-setup`; sent `/company-setup` / `company`; role `owner`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> The owner has company edit, team management, ownership transfer, finance and integration management in addition to operations. Owner-reserved actions include invitations/role changes, ownership transfer and QuickBooks connection/defaults.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## APT-02 — manager — PASS

**Question:** What can a manager do and what is restricted?

**Callable context:** requested `/`; sent `/` / `dashboard`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Managers can manage customers, jobs, assignments, estimates, plans, routes, dispatch, locations, operational reports and reviews. They cannot manage invoices/financial reports, company ownership, team invitations/roles or owner-only integrations.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## APT-03 — technician — PASS

**Question:** What can a technician access?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Technicians can read authorized company/customer/job context, work assigned jobs, prepare assigned estimates, read routes and share their own location. They cannot schedule/assign company work, manage customers, invoices, team or integrations.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## APT-04 — owner — PASS

**Question:** How does the owner invite a technician or manager?

**Callable context:** requested `/company-setup`; sent `/company-setup` / `company`; role `owner`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open Company, enter the email, select Technician or Manager and send the invitation. The role is owner-selected. If email is disabled or delayed, copy the generated invitation link securely.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## APT-04 — manager — PASS

**Question:** How does the owner invite a technician or manager?

**Callable context:** requested `/company-setup`; sent `/company-setup` / `company`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Only the company owner can send team invitations or choose invitation roles. A manager cannot invite or change the role of a technician or manager.

**Evaluation:** The response enforced the verified role boundary.

## APT-05 — technician — PASS

**Question:** Where does an invited new user set a password?

**Callable context:** requested `/`; sent `/` / `dashboard`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> A new user creates a personal Route Logistics login from the invitation flow, sets the password during account creation, verifies email, then returns to Accept invitation. Acceptance joins the existing company and does not create a team.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## APT-06 — technician — PASS

**Question:** What should an invited user do if they already have a Route Logistics account?

**Callable context:** requested `/`; sent `/` / `dashboard`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Sign in with the existing password or use Forgot password, then reopen the same invitation and choose Accept invitation while signed in with the invited email.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## APT-07 — manager — PASS

**Question:** How do I reset a forgotten password?

**Callable context:** requested `/`; sent `/` / `dashboard`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> On Login choose Forgot password?, enter the email and send the reset link. After changing the password, sign in again; reopen a pending invitation if one still needs acceptance.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## APT-08 — manager — PASS

**Question:** How does email-code login work for staff?

**Callable context:** requested `/`; sent `/` / `dashboard`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Choose Email code, request a code for a verified staff account, enter the newest six-digit code within ten minutes and sign in. Codes are single-use/rate-limited; customer portal codes belong on the portal.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## APT-09 — technician — PASS

**Question:** What does Remember me store?

**Callable context:** requested `/`; sent `/` / `dashboard`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> It stores only the email address on that device for convenience. It does not store the password or bypass authentication.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts. Missing concept groups: `remember`.

## APT-10 — technician — PASS

**Question:** How do I permanently delete my mobile account?

**Callable context:** requested `/my-work`; sent `/my-work` / `technician-work`; role `technician`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Open Settings and Delete account, review pending offline work, sign in recently if required, type the full current email exactly and complete the destructive confirmation. Personal sign-in is deleted while required business/audit records are retained.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## APT-11 — manager — PASS

**Question:** Why do I get a missing or insufficient permissions error after my role changes?

**Callable context:** requested `/`; sent `/` / `dashboard`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> The active membership, token role and membership ID must match. Use Refresh access or sign out/in to obtain current claims. If the membership is inactive or wrong, the owner must correct it; retrying must not bypass tenant checks.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## APT-12 — manager — PASS

**Question:** Can I switch to another company workspace with the same account?

**Callable context:** requested `/`; sent `/` / `dashboard`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Only active authorized memberships can be selected. Switching refreshes claims and data scope; unsaved/offline work remains scoped to the original company and must not be mixed across workspaces.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## APT-13 — owner — PASS

**Question:** Can the AI Assistant change jobs, customers, invoices, or permissions for me?

**Callable context:** requested `/`; sent `/` / `dashboard`; role `owner`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> No. The assistant is guidance-only and offers authorized navigation. It does not execute customer, job, financial, credential or permission changes.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## APT-14 — manager — PASS

**Question:** How do I contact a human or report a problem from the assistant?

**Callable context:** requested `/`; sent `/` / `dashboard`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Use the existing support workflow: choose Support or Report a Problem in the assistant. Review the disclosure, describe the issue without customer or financial data, and submit it to Workside Support. An ordinary question does not automatically create a handoff.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.

## APT-15 — manager — PASS

**Question:** How do I close or reset an assistant conversation, and what should I do if it is unavailable?

**Callable context:** requested `/`; sent `/` / `dashboard`; role `manager`; knowledge `2026-11-18.2`.

**Actual assistant response:**

> Use the assistant’s new/reset conversation control to close the existing session and start clean; minimizing preserves it in session storage. If the provider is unavailable, retry later and use verified help topics. Closing a conversation does not change application data.

**Evaluation:** The response includes the required navigation, procedure, and limitation concepts.
