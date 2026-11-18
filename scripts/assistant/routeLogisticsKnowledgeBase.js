// GENERATED from Route Logistics docs/audits/assistant-knowledge/catalog.mjs.
// Do not hand-edit this deploy-only copy. Regenerate from the Route Logistics repository.

const PRODUCT_NAME = 'Route Logistics';
const PROCEDURES = Object.freeze([
  {
    "id": "CPE-01",
    "question": "How do I create a request for an estimate for a new or prospective customer?",
    "reply": "Open Customers and choose New Inquiry. Choose Create inquiry for a new prospect, enter contact, service property, Service requested, category and follow-up details, then Save inquiry. From the saved inquiry choose Schedule Estimate. Do not start with Schedule New Job.",
    "intent": "customer_intake",
    "status": "implemented",
    "routes": [
      "/customers"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-02",
    "question": "How do I schedule an estimate visit for an existing customer?",
    "reply": "Create an inquiry, search for and select the existing customer and property, describe the requested service, save, then choose Schedule Estimate and review date, quarter-hour time, property and eligible field worker.",
    "intent": "customer_intake",
    "status": "implemented",
    "routes": [
      "/customers"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-03",
    "question": "How do I add a customer without first creating an inquiry?",
    "reply": "On Customers choose Add Customer, enter identity/contact and address fields, then save. Use New Inquiry instead when the contact is still a prospect requesting an estimate.",
    "intent": "customer_intake",
    "status": "implemented",
    "routes": [
      "/customers"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-04",
    "question": "How does Route Logistics prevent a duplicate prospect or customer?",
    "reply": "Search existing customers by name, email, phone or service address. If possible matches appear, reuse the correct record; creating a separate prospect requires explicit confirmation and a reason.",
    "intent": "customer_intake",
    "status": "implemented",
    "routes": [
      "/customers"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-05",
    "question": "How do I manage more than one service property for a customer?",
    "reply": "Open the customer, use the Service properties section to add or edit labeled properties, validate the service address and save. Scheduling must select the property where service occurs, not the billing address.",
    "intent": "customer_intake",
    "status": "implemented",
    "routes": [
      "/customers"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-06",
    "question": "Can I change the service property while creating an appointment and save it permanently?",
    "reply": "Choose Enable Editing before changing the populated address. Google validation is advisory for internal scheduling. Select the option to save the address to the customer when the change should be permanent; otherwise it applies only to the job.",
    "intent": "customer_intake",
    "status": "implemented",
    "routes": [
      "/jobs"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-07",
    "question": "How do I check whether a prospect property is inside our service area?",
    "reply": "Enter the service property and category, expand Check coverage / owner exception, and run the eligibility check. An authorized owner can approve an explicit out-of-area exception; the server rechecks eligibility.",
    "intent": "customer_intake",
    "status": "implemented",
    "routes": [
      "/customers"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-08",
    "question": "How do I assign an estimate visit to a field worker?",
    "reply": "From the saved inquiry choose Schedule Estimate. In the scheduling dialog confirm the Estimate visit kind, select an eligible field worker under Assigned technician, review conflicts and alternatives, then save.",
    "intent": "customer_intake",
    "status": "implemented",
    "routes": [
      "/customers"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-09",
    "question": "How does a technician open an assigned estimate visit?",
    "reply": "In Field mode open the assigned estimate visit, complete the visit workflow, then choose Prepare Estimate. Technicians can prepare only an assigned estimate and cannot approve it as management.",
    "intent": "estimate_workflow",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-10",
    "question": "How do I add labor to an estimate?",
    "reply": "Open the draft, choose Add labor line, enter description, quantity and unit price, then save the versioned draft. Server calculation determines totals.",
    "intent": "estimate_workflow",
    "status": "implemented",
    "routes": [
      "/estimates"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-11",
    "question": "How do I add materials to an estimate?",
    "reply": "Open the draft, choose Add material line, enter description, quantity and unit price, then save the versioned draft.",
    "intent": "estimate_workflow",
    "status": "implemented",
    "routes": [
      "/estimates"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-12",
    "question": "Can I add notes and photos to an estimate?",
    "reply": "Yes. Add scope/notes and capture or select photos in the estimate draft. Photos are retained locally until uploaded and attached to a saved version; keep the draft until synchronization is confirmed.",
    "intent": "estimate_workflow",
    "status": "implemented",
    "routes": [
      "/estimates"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-13",
    "question": "Can I prepare and save an estimate while the mobile app is offline?",
    "reply": "A previously loaded assigned estimate can be edited offline. The app shows saved-on-device or waiting-to-sync state and retries after reconnection. It must not be treated as server-saved until synchronization succeeds.",
    "intent": "estimate_workflow",
    "status": "implemented",
    "routes": [
      "/estimates"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-14",
    "question": "How do I create or share an estimate PDF?",
    "reply": "Open the saved estimate version and choose Share estimate PDF. Customer email delivery is a separate action and may require management approval and enabled email.",
    "intent": "estimate_workflow",
    "status": "implemented",
    "routes": [
      "/estimates"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-15",
    "question": "How does a technician submit an estimate for management review?",
    "reply": "Save and synchronize the exact draft version first, then choose Submit for Review. The version becomes read-only for the technician while management reviews it.",
    "intent": "estimate_workflow",
    "status": "implemented",
    "routes": [
      "/estimates"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-16",
    "question": "How does a manager approve an estimate or request changes?",
    "reply": "Open the submitted version. Enter review comments as needed, then choose Approve for delivery or Request changes. Approval applies only to that exact version.",
    "intent": "estimate_workflow",
    "status": "implemented",
    "routes": [
      "/estimates"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-17",
    "question": "How is an approved estimate sent to the customer?",
    "reply": "After management approves the exact version, choose Email approved estimate and monitor delivery status. A technician can send directly only if the company owner enabled that policy.",
    "intent": "estimate_workflow",
    "status": "implemented",
    "routes": [
      "/estimates"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-18",
    "question": "How can a customer approve, decline, or request a revision to an estimate?",
    "reply": "The customer opens the secure estimate link and acts on the exact version: approve, decline, or request a revision. A later edit creates a new version and does not rewrite the earlier decision.",
    "intent": "estimate_workflow",
    "status": "implemented",
    "routes": [
      "/estimates"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-19",
    "question": "How do I revise an estimate after changes are requested?",
    "reply": "Open the revision-requested estimate, review management/customer comments, edit the draft, save a new immutable version, and submit or approve that version through the normal workflow.",
    "intent": "estimate_workflow",
    "status": "implemented",
    "routes": [
      "/estimates"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "CPE-20",
    "question": "How do I schedule work after a customer approves an estimate?",
    "reply": "Open Estimates and locate the estimate marked Approved — scheduling needed. Choose Convert approved estimate to job, confirm required property/category or prospect conversion details, choose date and quarter-hour time, then explicitly convert. This creates one unassigned job linked to the immutable approved estimate and pricing. Technician selection is not currently inside the conversion dialog; assign the technician later in Jobs or Dispatch.",
    "intent": "approved_estimate_scheduling",
    "status": "implemented",
    "routes": [
      "/estimates"
    ],
    "deniedRoles": [
      "technician"
    ],
    "denialReply": "Your role cannot convert a customer-approved estimate into scheduled work. Ask an authorized manager, administrator, or owner. Do not create an unrelated new job."
  },
  {
    "id": "JSD-01",
    "question": "How do I create a one-time job for an existing customer?",
    "reply": "Open Jobs, choose New Job, select an existing customer and service property, keep One-time appointment, enter service, date, quarter-hour time and duration, optionally assign an eligible field worker, then Schedule Job.",
    "intent": "scheduling_dispatch",
    "status": "implemented",
    "routes": [
      "/jobs"
    ],
    "deniedRoles": [
      "technician"
    ],
    "denialReply": "Your role can review assigned work but cannot create or schedule company jobs. Ask an authorized manager, administrator, or owner. Use My Work for assigned visits."
  },
  {
    "id": "JSD-02",
    "question": "How do I create a recurring weekly, monthly, or quarterly appointment?",
    "reply": "Choose Recurring appointment, select the frequency/pattern and first service date, configure preferred technician and fallback behavior, review availability, then save. The recurring Service Plan creates future jobs.",
    "intent": "scheduling_dispatch",
    "status": "implemented",
    "routes": [
      "/jobs"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "JSD-03",
    "question": "Can I assign a technician before saving a new job?",
    "reply": "Yes. Select Assigned technician before saving. Only field-eligible staff appear; review schedule conflicts and alternatives before Schedule Job.",
    "intent": "scheduling_dispatch",
    "status": "implemented",
    "routes": [
      "/jobs"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "JSD-04",
    "question": "What happens if the selected technician has a schedule conflict?",
    "reply": "The availability check shows overlapping work and alternate times/dates. Choose a conflict-free alternative or deliberately leave unassigned/review the warning; travel time is not included in the conflict check.",
    "intent": "scheduling_dispatch",
    "status": "implemented",
    "routes": [
      "/jobs"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "JSD-05",
    "question": "Why is a manager or owner missing from the assignment list?",
    "reply": "Role and field-work eligibility are separate. Open Company and enable field assignment for that staff member. Office-only managers retain management access but do not appear for new field assignments.",
    "intent": "scheduling_dispatch",
    "status": "implemented",
    "routes": [
      "/company-setup"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "JSD-06",
    "question": "How do I cancel an appointment?",
    "reply": "Open the job and choose Cancel appointment, then confirm. Scheduled work can be cancelled and retained in history; in-progress or completed work cannot be cancelled through this action.",
    "intent": "scheduling_dispatch",
    "status": "implemented",
    "routes": [
      "/jobs"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "JSD-07",
    "question": "How do I permanently delete a test job?",
    "reply": "Choose Permanently delete and confirm. It is limited to authorized management, is unavailable for in-progress work and estimate visits, and is intended for records that may safely be removed.",
    "intent": "scheduling_dispatch",
    "status": "implemented",
    "routes": [
      "/jobs"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "JSD-08",
    "question": "How do I skip one recurring visit or pause recurring service for a period?",
    "reply": "Open Service Plans, choose Pause, then select Skip the next occurrence only, Pause through a date, or Pause indefinitely. Already-created Jobs remain individually manageable. Use Resume to reactivate an indefinite pause.",
    "intent": "scheduling_dispatch",
    "status": "implemented",
    "routes": [
      "/service-plans"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "JSD-09",
    "question": "How do I reassign a job from the web app?",
    "reply": "Open Dispatch or the job in Jobs, select a different eligible field worker in Assigned to, review conflicts/availability, and save. A technician cannot self-reassign without management.",
    "intent": "scheduling_dispatch",
    "status": "implemented",
    "routes": [
      "/dispatch",
      "/my-work"
    ],
    "deniedRoles": [
      "technician"
    ],
    "denialReply": "A technician cannot directly reassign a company job. Use Request reassignment on the assigned work order; an authorized manager, administrator, or owner reviews and changes the assignment."
  },
  {
    "id": "JSD-10",
    "question": "How does a manager reassign scheduled work in the mobile app?",
    "reply": "Switch to Management mode, open Scheduled jobs, select the job and choose an eligible staff member. Review conflicts before confirming. Technicians instead submit a reassignment request.",
    "intent": "scheduling_dispatch",
    "status": "implemented",
    "routes": [
      "/dispatch"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "JSD-11",
    "question": "How do I calculate and save a technician’s daily route?",
    "reply": "Open Daily Routes, select the technician and service date, choose Load jobs, set the start/departure options, choose Calculate route, review warnings, and then choose Save stop order. Route optimization requires valid service locations.",
    "intent": "scheduling_dispatch",
    "status": "implemented",
    "routes": [
      "/routes"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "JSD-12",
    "question": "How do I show jobs and technician locations on the dispatch map?",
    "reply": "Open Dispatch, choose the service date and filters, show the map, and locate unmapped service addresses in controlled batches. Job markers and on-duty team positions are distinct; GPS freshness does not prove availability.",
    "intent": "scheduling_dispatch",
    "status": "implemented",
    "routes": [
      "/dispatch"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "JSD-13",
    "question": "Where do I review potentially late, overdue, or reassignment-requested jobs?",
    "reply": "Use Dispatch and select Potentially late, Overdue, or Reassignment requested. These indicators do not automatically change assignments or prove technician absence.",
    "intent": "scheduling_dispatch",
    "status": "implemented",
    "routes": [
      "/dispatch"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "JSD-14",
    "question": "How do job statuses change from scheduled to completed?",
    "reply": "Assigned field staff progress authorized work through en-route/in-progress and completion using the job workflow. Completion requires work completed text and preserves visit/checklist/photo drafts. Managers can review status but must not bypass assignment controls.",
    "intent": "scheduling_dispatch",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "JSD-15",
    "question": "Why can’t I see or open a job that should be assigned to me?",
    "reply": "Confirm the signed-in workspace, active membership, current assignment and non-cancelled status. Refresh assigned work after reconnecting. Technicians see only authorized assigned jobs; ask management to correct assignment rather than weakening access.",
    "intent": "scheduling_dispatch",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "MOB-01",
    "question": "How does a technician sign in on mobile with a password or email code?",
    "reply": "Choose Password or Email code. For Email code request the newest six-digit code and enter it within ten minutes. An invitation must still be accepted separately before company access exists.",
    "intent": "technician_work",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "MOB-02",
    "question": "What is the difference between Field and Management mode?",
    "reply": "Field mode shows the signed-in person’s assigned work. Management mode exposes authorized operational summaries and management actions. A technician has Field access only; switching mode does not change role or permissions.",
    "intent": "technician_work",
    "status": "implemented",
    "routes": [
      "/",
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "MOB-03",
    "question": "How do I go On Duty or Off Duty?",
    "reply": "Tap the status button in the Home header, then Start shift or End shift. On Duty is a server shift state; Off Duty stops work-location sharing on the device after the end is confirmed.",
    "intent": "technician_work",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "MOB-04",
    "question": "When is my location shared with the manager or owner?",
    "reply": "Location is shared only during an active On Duty shift after device permission/consent. Background sharing depends on the selected option and OS permission. End shift to stop; recording a visit does not start continuous sharing.",
    "intent": "technician_work",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "MOB-05",
    "question": "Can I open and work on a job while offline?",
    "reply": "Yes, only if the authorized job was opened/cached online first. Offline work is saved in the company/user/role/membership scope and must synchronize after reconnection; access is revalidated before server changes.",
    "intent": "technician_work",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "MOB-06",
    "question": "Will work-note drafts survive closing or restarting the mobile app?",
    "reply": "Typed work notes are persisted per company/user/job and restored after restart. Use Save work notes to queue synchronization. Do not discard the draft until Saved to server is shown.",
    "intent": "technician_work",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "MOB-07",
    "question": "How do I take or choose a job photo and what happens offline?",
    "reply": "Open Photos and choose Camera or Gallery, grant permission when requested, select/capture the image and save/queue it. The retained file and operation survive offline restart and show waiting/sync/error state with retry.",
    "intent": "technician_work",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "MOB-08",
    "question": "How do I record arrival at a job?",
    "reply": "Choose Record arrival, optionally attach a current GPS sample, then save the visit event. The original event time and operation ID are retained offline. Arrival evidence does not independently prove access.",
    "intent": "technician_work",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "MOB-09",
    "question": "How do I record departure from a job?",
    "reply": "Choose Record departure, optionally include a current GPS sample, then save. Confirm the green/completed state or synchronization label before leaving the workflow.",
    "intent": "technician_work",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "MOB-10",
    "question": "What should I record if I cannot access the property?",
    "reply": "Choose Couldn’t access property, enter the required explanation, optionally include GPS evidence, and save the access-blocked visit event. This records evidence; it does not automatically complete or cancel the job.",
    "intent": "technician_work",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "MOB-11",
    "question": "Why do I see a service checklist and which template should I use?",
    "reply": "A manager attaches the company/service-appropriate template. Technicians complete the pinned template but cannot choose or replace it. The management catalog is filtered for the company/job and the server rejects an unrelated built-in template. Saved report versions remain tied to the job assignment.",
    "intent": "technician_work",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "MOB-12",
    "question": "What must I do before completing a job?",
    "reply": "Save or explicitly discard open notes/photo/checklist/visit drafts, enter Work completed, optional hours/notes and estimate-visit outcome when applicable, review the confirmation, then submit. Product application is optional unless company policy says otherwise.",
    "intent": "technician_work",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "MOB-13",
    "question": "What do I do when mobile synchronization fails?",
    "reply": "Keep the local draft, reconnect, use the specific retry control and wait for Saved to server. Do not recreate the work or discard the stable operation; conflicts require management review.",
    "intent": "technician_work",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "MOB-14",
    "question": "How does a technician request that a job be reassigned?",
    "reply": "Open the assigned nonterminal job, choose Request reassignment, select a supported reason and add appropriate notes. Management receives the request and must resolve it; the technician does not change the assignment directly.",
    "intent": "technician_work",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "MOB-15",
    "question": "Where can I change mobile appearance and find the app version?",
    "reply": "Open Settings. Appearance offers System, Light and Dark and stores the choice on the device. Open About for the app version/build used by support.",
    "intent": "technician_work",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "BIL-01",
    "question": "How do I create an invoice from a completed job?",
    "reply": "Open the completed billable job in Jobs, choose Create Invoice, review the preview/source details and explicitly generate the draft. Estimate visits are nonbillable and cannot use this path.",
    "intent": "invoice_workflow",
    "status": "implemented",
    "routes": [
      "/invoices",
      "/jobs",
      "/my-work"
    ],
    "deniedRoles": [
      "manager",
      "technician"
    ],
    "denialReply": "Your current role does not have invoice access. Ask an authorized company owner or administrator. The assistant cannot create invoices, payments, or financial changes."
  },
  {
    "id": "BIL-02",
    "question": "Can a manager or technician create or view invoices?",
    "reply": "No. The current capability policy gives invoice read/manage access to owners and administrators only. Managers and technicians must ask an authorized owner or administrator.",
    "intent": "invoice_workflow",
    "status": "implemented",
    "routes": [
      "/invoices",
      "/my-work"
    ],
    "deniedRoles": [
      "manager",
      "technician"
    ],
    "denialReply": "Your current role does not have invoice access. Managers and technicians must ask an authorized company owner or administrator. The assistant cannot create invoices, payments, or financial changes."
  },
  {
    "id": "BIL-03",
    "question": "How do I review an invoice before generating it?",
    "reply": "Open Create Invoice from eligible completed work, review customer/source, immutable completed work, line items, totals and warnings, then explicitly create. Do not rely on the assistant to perform the financial action.",
    "intent": "invoice_workflow",
    "status": "implemented",
    "routes": [
      "/invoices"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "BIL-04",
    "question": "How do I correct an invoice after it has been issued?",
    "reply": "Do not silently rewrite issued history. Void the eligible invoice with confirmation, then use Review replacement for its job. Payment locks must be resolved first and audit history is retained.",
    "intent": "invoice_workflow",
    "status": "implemented",
    "routes": [
      "/invoices"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "BIL-05",
    "question": "What does a Stripe test payment change on an invoice?",
    "reply": "In test mode the Payment Element creates a test PaymentIntent. Signed webhook reconciliation updates testPaymentStatus and payment audit state, but does not mark the real invoice paid.",
    "intent": "invoice_workflow",
    "status": "implemented",
    "routes": [
      "/invoices"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "BIL-06",
    "question": "Can Route Logistics collect live card payments now?",
    "reply": "No. Live payments remain disabled unless live mode is configured and explicitly approved. Use only the controlled test flow; the assistant cannot enable payments.",
    "intent": "live_payments_unavailable",
    "status": "disabled",
    "routes": [
      "/invoices"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "BIL-07",
    "question": "What invoices and payments can a customer see in the portal?",
    "reply": "After email-code verification, the customer sees only invoices and payment history linked to their authorized provider association and matching portal identity. Provider switching remains tenant-scoped.",
    "intent": "invoice_workflow",
    "status": "implemented",
    "routes": [
      "/invoices"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "BIL-08",
    "question": "How do I email an invoice and verify delivery?",
    "reply": "For a draft/sent eligible invoice choose Email invoice. The app queues delivery and records status; sent status is not the same as inbox delivery, so review delivery/audit status when needed.",
    "intent": "invoice_workflow",
    "status": "implemented",
    "routes": [
      "/invoices"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "BIL-09",
    "question": "Is QuickBooks synchronization available and can it export accounting data?",
    "reply": "The owner can connect the company sandbox and review status/options/mappings. Accounting exports are currently disabled; production synchronization is not approved. Do not use Export reviewed record until writes are deliberately enabled for a controlled environment.",
    "intent": "quickbooks_limited",
    "status": "limited",
    "routes": [
      "/integrations"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "BIL-10",
    "question": "How do I choose the default QuickBooks income account and service item?",
    "reply": "Connect QuickBooks, refresh available options, search the active income accounts and service items, choose both defaults and Save defaults. Empty lists must be populated in QuickBooks first. Saving preferences does not create or modify QuickBooks records.",
    "intent": "quickbooks_defaults",
    "status": "implemented",
    "routes": [
      "/integrations"
    ],
    "deniedRoles": [
      "manager"
    ],
    "denialReply": "Only the company owner can change QuickBooks accounting defaults. A manager cannot select or save the default income account or service item."
  },
  {
    "id": "APT-01",
    "question": "What can a company owner do that other roles cannot?",
    "reply": "The owner has company edit, team management, ownership transfer, finance and integration management in addition to operations. Owner-reserved actions include invitations/role changes, ownership transfer and QuickBooks connection/defaults.",
    "intent": "account_permissions",
    "status": "implemented",
    "routes": [
      "/company-setup"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "APT-02",
    "question": "What can a manager do and what is restricted?",
    "reply": "Managers can manage customers, jobs, assignments, estimates, plans, routes, dispatch, locations, operational reports and reviews. They cannot manage invoices/financial reports, company ownership, team invitations/roles or owner-only integrations.",
    "intent": "account_permissions",
    "status": "implemented",
    "routes": [
      "/"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "APT-03",
    "question": "What can a technician access?",
    "reply": "Technicians can read authorized company/customer/job context, work assigned jobs, prepare assigned estimates, read routes and share their own location. They cannot schedule/assign company work, manage customers, invoices, team or integrations.",
    "intent": "account_permissions",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "APT-04",
    "question": "How does the owner invite a technician or manager?",
    "reply": "Open Company, enter the email, select Technician or Manager and send the invitation. The role is owner-selected. If email is disabled or delayed, copy the generated invitation link securely.",
    "intent": "account_permissions",
    "status": "implemented",
    "routes": [
      "/company-setup"
    ],
    "deniedRoles": [
      "manager"
    ],
    "denialReply": "Only the company owner can send team invitations or choose invitation roles. A manager cannot invite or change the role of a technician or manager."
  },
  {
    "id": "APT-05",
    "question": "Where does an invited new user set a password?",
    "reply": "A new user creates a personal Route Logistics login from the invitation flow, sets the password during account creation, verifies email, then returns to Accept invitation. Acceptance joins the existing company and does not create a team.",
    "intent": "account_permissions",
    "status": "implemented",
    "routes": [
      "/"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "APT-06",
    "question": "What should an invited user do if they already have a Route Logistics account?",
    "reply": "Sign in with the existing password or use Forgot password, then reopen the same invitation and choose Accept invitation while signed in with the invited email.",
    "intent": "account_permissions",
    "status": "implemented",
    "routes": [
      "/"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "APT-07",
    "question": "How do I reset a forgotten password?",
    "reply": "On Login choose Forgot password?, enter the email and send the reset link. After changing the password, sign in again; reopen a pending invitation if one still needs acceptance.",
    "intent": "account_permissions",
    "status": "implemented",
    "routes": [
      "/"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "APT-08",
    "question": "How does email-code login work for staff?",
    "reply": "Choose Email code, request a code for a verified staff account, enter the newest six-digit code within ten minutes and sign in. Codes are single-use/rate-limited; customer portal codes belong on the portal.",
    "intent": "account_permissions",
    "status": "implemented",
    "routes": [
      "/"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "APT-09",
    "question": "What does Remember me store?",
    "reply": "It stores only the email address on that device for convenience. It does not store the password or bypass authentication.",
    "intent": "account_permissions",
    "status": "implemented",
    "routes": [
      "/"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "APT-10",
    "question": "How do I permanently delete my mobile account?",
    "reply": "Open Settings and Delete account, review pending offline work, sign in recently if required, type the full current email exactly and complete the destructive confirmation. Personal sign-in is deleted while required business/audit records are retained.",
    "intent": "account_permissions",
    "status": "implemented",
    "routes": [
      "/my-work"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "APT-11",
    "question": "Why do I get a missing or insufficient permissions error after my role changes?",
    "reply": "The active membership, token role and membership ID must match. Use Refresh access or sign out/in to obtain current claims. If the membership is inactive or wrong, the owner must correct it; retrying must not bypass tenant checks.",
    "intent": "account_permissions",
    "status": "implemented",
    "routes": [
      "/"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "APT-12",
    "question": "Can I switch to another company workspace with the same account?",
    "reply": "Only active authorized memberships can be selected. Switching refreshes claims and data scope; unsaved/offline work remains scoped to the original company and must not be mixed across workspaces.",
    "intent": "account_permissions",
    "status": "limited",
    "routes": [
      "/"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "APT-13",
    "question": "Can the AI Assistant change jobs, customers, invoices, or permissions for me?",
    "reply": "No. The assistant is guidance-only and offers authorized navigation. It does not execute customer, job, financial, credential or permission changes.",
    "intent": "assistant_boundary",
    "status": "implemented",
    "routes": [
      "/"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "APT-14",
    "question": "How do I contact a human or report a problem from the assistant?",
    "reply": "Use the existing support workflow: open Support or Report a Problem, review the disclosure, enter only necessary non-customer/non-financial details and submit to Workside Support. A handoff is not automatic from an ordinary question.",
    "intent": "human_support",
    "status": "implemented",
    "routes": [
      "/"
    ],
    "deniedRoles": [],
    "denialReply": null
  },
  {
    "id": "APT-15",
    "question": "How do I close or reset an assistant conversation, and what should I do if it is unavailable?",
    "reply": "Use the assistant’s new/reset conversation control to close the existing session and start clean; minimizing preserves it in session storage. If the provider is unavailable, retry later and use verified help topics. Closing a conversation does not change application data.",
    "intent": "assistant_session",
    "status": "implemented",
    "routes": [
      "/"
    ],
    "deniedRoles": [],
    "denialReply": null
  }
]);

function safeText(value, maxLength = 1_000) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function capabilities(context = {}) {
  return new Set(Array.isArray(context.capabilities) ? context.capabilities.map(value => safeText(value, 80)) : []);
}

function resolution(reply, intent, { confidence = 'high', humanRequired = false, knownLimitation = false, knowledgeId = null } = {}) {
  return {
    reply: safeText(reply, 1_600),
    intent,
    confidenceLevel: confidence,
    intentConfidence: { label: confidence, score: confidence === 'high' ? 0.98 : 0.72 },
    answerAuthority: { label: 'approved_route_logistics_knowledge', score: 0.99, source: 'route_logistics_knowledge_registry', ...(knowledgeId ? { knowledgeId } : {}) },
    clarificationRequired: false,
    pendingClarification: null,
    knowledgeGap: false,
    humanRequired,
    humanReason: humanRequired ? 'user_requested_human' : null,
    knownLimitation,
    resolvedWithoutHuman: !humanRequired,
  };
}

function pageHelp(context = {}) {
  const page = safeText(context.pageCategory, 80);
  const byPage = {
    customers: 'On Customers, choose New Inquiry, search before creating a prospect, select the service property, assign follow-up, and schedule an estimate visit.',
    dispatch: 'On Dispatch, review potentially late, overdue, and reassignment-requested work. Authorized dispatchers can reassign jobs and compare available field staff.',
    scheduling: 'On Jobs, choose an existing customer and service property, schedule on a quarter hour, check field-staff availability, and assign the appointment before saving.',
    estimates: 'On Estimates, authorized staff can prepare a versioned estimate, submit it for review, approve or request changes, send it to the customer, and convert approved work.',
    invoices: 'On Invoices, authorized owners or administrators review invoices and payments. Create an invoice from an eligible completed job in Jobs, not from the assistant.',
    'technician-work': 'On My Work, open an assigned visit, record arrival and departure, save notes and photos, complete checklists, and synchronize offline drafts before completion.',
    company: 'On Company, authorized users review team roles, field-work eligibility, services, service areas, availability, and company settings.',
  };
  return byPage[page] || 'I can help you find the correct Route Logistics page or explain a supported workflow. Ask what you want to do.';
}

const STOP_WORDS = new Set(['a','an','and','are','can','does','do','for','from','how','i','if','in','is','it','me','my','of','on','or','our','should','that','the','this','to','what','when','where','which','while','why','will','with','you']);
const replacements = [
  [/\bone[- ]time\b/g, 'onetime'], [/\bsign[- ]?in\b/g, 'login'], [/\blog in\b/g, 'login'],
  [/\bfield worker\b/g, 'technician'], [/\bteam member\b/g, 'staff'], [/\bprospective\b/g, 'prospect'],
  [/\bgenerat(?:e|ing)\b/g, 'create'], [/\badd(?:ing)?\b/g, 'create'], [/\bappointment\b/g, 'job'],
  [/\bwork order\b/g, 'job'], [/\breassign(?:ed|ing|ment)?\b/g, 'reassign'], [/\bschedul(?:e|ed|ing)\b/g, 'schedule'],
  [/\bdelet(?:e|ed|ing|ion)\b/g, 'delete'], [/\bcancell?(?:ed|ing|ation)?\b/g, 'cancel'],
  [/\bapprov(?:e|ed|al|ing)\b/g, 'approve'], [/\brevis(?:e|ed|ion)\b/g, 'revise'],
  [/\bsynchroni[sz](?:e|ed|ing|ation)?\b/g, 'sync'], [/\bphotos?\b/g, 'photo'], [/\bnotes?\b/g, 'note'],
  [/\bpayments?\b/g, 'payment'], [/\binvoices?\b/g, 'invoice'], [/\bestimates?\b/g, 'estimate'],
  [/\bcustomers?\b/g, 'customer'], [/\bjobs?\b/g, 'job'], [/\btechnicians?\b/g, 'technician'],
];

function normalized(value) {
  let text = safeText(value, 2_000).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
  return text.replace(/\s+/g, ' ').trim();
}

function terms(value) {
  return normalized(value).split(' ').filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

function dice(first, second) {
  const a = new Set(first), b = new Set(second);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const value of a) if (b.has(value)) overlap += 1;
  return 2 * overlap / (a.size + b.size);
}

function bigrams(tokens) {
  return tokens.slice(1).map((token, index) => tokens[index] + ':' + token);
}

const ACTIONS = Object.freeze({
  create: /\b(create|new|request)\b/, schedule: /\bschedule\b/, assign: /\b(assign|reassign)\b/,
  cancel: /\b(cancel|delete|pause|skip|resume)\b/, record: /\b(record|take|choose|save|share|email|send)\b/,
  approve: /\b(approve|decline|revise|review|convert)\b/, access: /\b(login|reset|invite|permission|access|switch)\b/,
});
const OBJECTS = Object.freeze({
  customer: /\b(customer|prospect|inquiry)\b/, property: /\b(property|address|coverage|service area)\b/,
  estimate: /\bestimate\b/, job: /\b(job|recurring|service plan)\b/, dispatch: /\b(dispatch|route|late|overdue)\b/,
  field: /\b(arrival|departure|photo|note|checklist|offline|sync|duty|location|reassign)\b/,
  invoice: /\b(invoice|stripe|payment|quickbooks|accounting)\b/, account: /\b(login|password|code|invite|role|permission|account|assistant|support)\b/,
});

function signature(text, registry) {
  return new Set(Object.entries(registry).filter(([, pattern]) => pattern.test(text)).map(([name]) => name));
}

function intersects(first, second) {
  for (const value of first) if (second.has(value)) return true;
  return false;
}

function routeBonus(procedure, context) {
  const route = safeText(context.route, 120);
  if (route && procedure.routes.includes(route)) return 0.06;
  const category = safeText(context.pageCategory, 80);
  if (category === 'customers' && procedure.id.startsWith('CPE-')) return 0.03;
  if (category === 'technician-work' && procedure.id.startsWith('MOB-')) return 0.03;
  if (category === 'invoices' && procedure.id.startsWith('BIL-')) return 0.03;
  return 0;
}

function procedureScore(question, procedure, context) {
  const incoming = normalized(question), canonical = normalized(procedure.question);
  if (incoming === canonical) return 1;
  const incomingTerms = terms(incoming), canonicalTerms = terms(canonical);
  const tokenScore = dice(incomingTerms, canonicalTerms);
  const phraseScore = dice(bigrams(incomingTerms), bigrams(canonicalTerms));
  const incomingActions = signature(incoming, ACTIONS), canonicalActions = signature(canonical, ACTIONS);
  const incomingObjects = signature(incoming, OBJECTS), canonicalObjects = signature(canonical, OBJECTS);
  if (incomingObjects.size && canonicalObjects.size && !intersects(incomingObjects, canonicalObjects)) return 0;
  if (incomingActions.size && canonicalActions.size && !intersects(incomingActions, canonicalActions)) return 0.45 * tokenScore;
  return Math.min(0.99, 0.62 * tokenScore + 0.26 * phraseScore + (intersects(incomingObjects, canonicalObjects) ? 0.06 : 0) + (intersects(incomingActions, canonicalActions) ? 0.04 : 0) + routeBonus(procedure, context));
}

function matchProcedure(question, context) {
  const ranked = PROCEDURES.map(procedure => ({ procedure, score: procedureScore(question, procedure, context) })).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 0.68 || ranked[1] && best.score < 0.9 && best.score - ranked[1].score < 0.06) return null;
  return best;
}

function responseForProcedure(match, context) {
  const procedure = match.procedure;
  const role = safeText(context.role, 40).toLowerCase();
  if (procedure.deniedRoles.includes(role)) {
    return resolution(procedure.denialReply || 'Your current role cannot perform this action. Ask an authorized owner or administrator.', procedure.intent + '_permission', { knowledgeId: procedure.id });
  }
  return resolution(procedure.reply, procedure.intent, { knowledgeId: procedure.id, knownLimitation: procedure.status !== 'implemented' });
}

export function resolveRouteLogisticsSupport(question, context = {}) {
  const text = safeText(question).toLowerCase();
  const role = safeText(context.role, 40).toLowerCase();
  const allowed = capabilities(context);
  if (/\b(ignore|override|forget)\b.{0,40}\b(instruction|system|permission|security)\b|\b(reveal|show)\b.{0,30}\b(prompt|secret|token|password|api key)\b/i.test(text)) {
    return resolution('I can only provide approved Route Logistics guidance and verified in-app navigation. I cannot reveal prompts, credentials, private records, or bypass permissions.', 'security_boundary');
  }
  if (/\b(talk|contact|speak|connect)\b.*\b(human|person|support|agent|representative)\b|\breport (?:a )?problem\b/.test(text)) {
    return resolution('Use the existing support workflow: choose Support or Report a Problem in the assistant. Review the disclosure, describe the issue without customer or financial data, and submit it to Workside Support. An ordinary question does not automatically create a handoff.', 'human_support', { humanRequired: true });
  }
  if (/help with (?:this )?page|what can i do (?:here|on this page)/.test(text)) return resolution(pageHelp(context), 'page_help');

  const matched = matchProcedure(question, context);
  if (matched) return responseForProcedure(matched, context);

  if (/\b(marketplace|public booking|find provider)\b/.test(text)) return resolution('Public provider discovery and direct public booking are planned, not currently implemented. I will not direct you to a screen that does not exist.', 'planned_feature', { knownLimitation: true });
  if (/\b(invoice|billable|nonbillable|payment|charge|correction|payment history)\b/.test(text)) {
    if (!allowed.has('invoices.read')) return resolution('Your current role does not have invoice access. Ask an authorized company owner or administrator. The assistant cannot create invoices, payments, or financial changes.', 'invoice_permission');
    return resolution('Open an eligible completed billable job in Jobs and choose Create Invoice. Review the preview before explicitly generating the draft. Open Invoices for status, audited correction, delivery, payment and history controls. The assistant does not perform financial actions.', 'invoice_workflow');
  }
  if (/(?:schedule|convert).{0,80}approv\w*.{0,40}(?:estimate|work)|approv\w*.{0,40}estimate.{0,60}(?:schedule|convert|work)/.test(text)) {
    if (!allowed.has('jobs.schedule') || !allowed.has('customers.manage')) return resolution('Your role cannot convert a customer-approved estimate into scheduled work. Ask an authorized manager, administrator, or owner. Do not create an unrelated new job.', 'approved_estimate_scheduling_permission');
    return resolution(PROCEDURES.find(row => row.id === 'CPE-20').reply, 'approved_estimate_scheduling', { knowledgeId: 'CPE-20' });
  }
  if (/\b(inquiry|prospect\w*|potential customer|new customer|service property|follow[- ]?up|convert.*customer)\b/.test(text)) return resolution(PROCEDURES.find(row => row.id === 'CPE-01').reply, 'customer_intake', { knowledgeId: 'CPE-01' });
  if (/\b(cancel|delete|pause|skip|resume)\b.*\b(job|appointment|recurring|service)\b/.test(text)) return resolution('Open Jobs for an individual appointment or Service Plans for recurring work. Cancellation retains history and cannot cancel in-progress/completed work; recurring plans support skip once, pause through a date, pause indefinitely, and resume.', 'scheduling_exception');
  if (/\b(schedule|appointment|assign|reassign|availability|late|overdue|dispatch|coverage|geographic)\b/.test(text)) {
    if (!allowed.has('jobs.schedule') && !allowed.has('dispatch.manage')) return resolution('Your role can review assigned work but cannot schedule or reassign company appointments. Ask an authorized manager, administrator, or owner. Use My Work for your assigned visits.', 'scheduling_permission');
    return resolution('Use Jobs to create or edit an appointment, select its service property and quarter-hour start time, then choose an eligible field worker and review conflicts. Use Dispatch for potentially late, overdue, or reassignment-requested work.', 'scheduling_dispatch');
  }
  if (/\b(assigned work|arrival|departure|photo|work note|complete.*job|offline|sync|reassignment|shift)\b/.test(text)) return resolution('Open My Work and select the assigned visit. Record arrival/departure, photos, notes, checklist entries, and completion details. Offline drafts stay on the device until server synchronization is confirmed; do not discard a draft that is still waiting to sync.', 'technician_work');
  if (/\b(estimate|labor|material|management review|approve|decline|revision|approved work)\b/.test(text)) {
    if (!allowed.has('estimates.manage') && !allowed.has('estimates.prepareAssigned')) return resolution('Your current role does not have an authorized estimate workflow. Ask an owner or manager to assign the estimate visit or review the required access.', 'estimate_permission');
    const qualifier = role === 'technician' || !allowed.has('estimates.manage') ? 'You can prepare an assigned estimate and submit the exact version for management review, but you cannot approve or send it as management.' : 'Review the exact submitted version, request changes or approve it, send it to the customer, and schedule work only after customer approval.';
    return resolution('Open Estimates or the assigned estimate visit. Add labor, materials, notes, and photos, then save the versioned draft. ' + qualifier, 'estimate_workflow');
  }
  if (/\b(company|team|service area|services|field work|technician availability|integration|notification setting)\b/.test(text)) return resolution('Open Company for team roles, field-work eligibility, services, service areas, availability, and company settings. Integrations and Notifications have dedicated pages. Owner-reserved changes remain limited to the company owner.', 'company_administration');
  if (/\b(customer portal|customer login|service history|provider switching|portal document|portal photo)\b/.test(text)) return resolution('Customers use the Customer Portal email-code sign-in. After verification, they can switch among authorized providers and review tenant-scoped service history, documents, photos, invoices, and reviews. Staff access does not automatically grant customer-portal access.', 'customer_portal');
  return resolution(pageHelp(context) + ' I am not certain which workflow you mean; name the task, such as creating an inquiry, scheduling a job, completing field work, preparing an estimate, or reviewing an invoice.', 'route_logistics_clarification', { confidence: 'medium' });
}

export { PRODUCT_NAME, PROCEDURES };
