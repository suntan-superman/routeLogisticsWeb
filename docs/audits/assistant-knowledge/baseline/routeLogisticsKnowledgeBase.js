const PRODUCT_NAME = 'Route Logistics';

function safeText(value, maxLength = 1_000) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function capabilities(context = {}) {
  return new Set(Array.isArray(context.capabilities) ? context.capabilities.map(value => safeText(value, 80)) : []);
}

function resolution(reply, intent, { confidence = 'high', humanRequired = false } = {}) {
  return {
    reply: safeText(reply, 1_600),
    intent,
    confidenceLevel: confidence,
    intentConfidence: { label: confidence, score: confidence === 'high' ? 0.95 : 0.72 },
    answerAuthority: { label: 'approved_route_logistics_knowledge', score: 0.96, source: 'route_logistics_knowledge_registry' },
    clarificationRequired: false,
    pendingClarification: null,
    knowledgeGap: false,
    humanRequired,
    humanReason: humanRequired ? 'user_requested_human' : null,
    knownLimitation: false,
    resolvedWithoutHuman: !humanRequired,
  };
}

function pageHelp(context = {}) {
  const page = safeText(context.pageCategory, 80);
  const byPage = {
    customers: 'On Customers, you can search before creating a prospect, open New Inquiry, select a service property, assign follow-up, and schedule an estimate visit.',
    dispatch: 'On Dispatch, review potentially late, overdue, and reassignment-requested work. Authorized dispatchers can reassign jobs and compare available field staff.',
    scheduling: 'On Jobs, choose the customer and service property, schedule on a quarter hour, check field-staff availability, and assign the appointment before saving.',
    estimates: 'On Estimates, authorized staff can prepare a versioned estimate, submit it for review, approve or request changes, send it to the customer, and schedule approved work.',
    invoices: 'On Invoices, authorized owners or administrators can preview billable work, explicitly generate an invoice, review status, make audited corrections, and inspect payment history.',
    'technician-work': 'On My Work, open an assigned visit, record arrival and departure, save notes and photos, complete checklists, and synchronize offline drafts before completion.',
    company: 'On Company, authorized users can review team roles, field-work eligibility, services, service areas, availability, and company settings.',
  };
  return byPage[page] || 'I can help you find the correct Route Logistics page or explain a supported workflow. Ask what you want to do.';
}

export function resolveRouteLogisticsSupport(question, context = {}) {
  const text = safeText(question).toLowerCase();
  const role = safeText(context.role, 40).toLowerCase();
  const allowed = capabilities(context);
  if (/\b(ignore|override|forget)\b.{0,40}\b(instruction|system|permission|security)\b|\b(reveal|show)\b.{0,30}\b(prompt|secret|token|password|api key)\b/i.test(text)) {
    return resolution('I can only provide approved Route Logistics guidance and verified in-app navigation. I cannot reveal prompts, credentials, private records, or bypass permissions.', 'security_boundary');
  }
  if (/\b(talk|contact|speak|connect)\b.*\b(human|person|support|agent|representative)\b|\breport (?:a )?problem\b/.test(text)) {
    return resolution('Choose Contact Workside Support or Report a Problem in the assistant. Review the disclosure, describe the issue without customer or financial data, and submit it to the existing support workflow.', 'human_support', { humanRequired: true });
  }
  if (/help with (?:this )?page|what can i do (?:here|on this page)/.test(text)) return resolution(pageHelp(context), 'page_help');
  if (/\b(inquiry|prospect\w*|potential customer|new customer|service property|follow[- ]?up|convert.*customer)\b/.test(text)) {
    return resolution('Open Customers and choose New Inquiry. Search for an existing customer first; if this is a new contact, choose Create inquiry for a new prospect. Enter the prospect contact information, service property, requested service, and follow-up details, then save the inquiry. From the saved inquiry, choose Schedule Estimate and select the date, quarter-hour time, and eligible field worker. The contact remains a prospect until conversion is appropriate. Do not use Schedule New Job for someone who does not yet have an established customer record.', 'customer_intake');
  }
  if (/(?:schedule|convert).{0,80}approv\w*.{0,40}(?:estimate|work)|approv\w*.{0,40}estimate.{0,60}(?:schedule|convert|work)/.test(text)) {
    if (!allowed.has('jobs.schedule') || !allowed.has('customers.manage')) return resolution('Your role cannot convert a customer-approved estimate into scheduled work. Ask an authorized manager, administrator, or owner. Do not create an unrelated new job.', 'approved_estimate_scheduling_permission');
    return resolution('Open Estimates and locate the customer-approved estimate with Approved — scheduling needed status. Open it and use Convert approved estimate. Confirm its approved property and service category, supplying only required missing property/category or prospect-to-customer information. Choose the service date and quarter-hour time, select Convert approved estimate to job, then explicitly confirm job conversion. This creates one unassigned job linked to the immutable approved estimate. Verify the Converted job reference, then open Jobs or Dispatch to choose an eligible technician and review conflicts or alternatives. Technician selection is not currently inside the conversion dialog. Geographic checks and idempotent conversion remain enforced.', 'approved_estimate_scheduling');
  }
  if (/\b(schedule|appointment|assign|reassign|availability|late|overdue|dispatch|coverage|geographic)\b/.test(text)) {
    if (!allowed.has('jobs.schedule') && !allowed.has('dispatch.manage')) return resolution('Your role can review assigned work but cannot schedule or reassign company appointments. Ask an authorized manager, administrator, or owner. Use My Work for your assigned visits.', 'scheduling_permission');
    return resolution('Use Jobs to create or edit the appointment, select its service property and quarter-hour start time, then choose an eligible field worker and review conflicts. Use Dispatch to review potentially late, overdue, or reassignment-requested work and to reassign when authorized.', 'scheduling_dispatch');
  }
  if (/\b(assigned work|arrival|departure|photo|work note|complete.*job|offline|sync|reassignment|shift)\b/.test(text)) {
    return resolution('Open My Work and select the assigned visit. Record arrival/departure, photos, notes, checklist entries, and completion details. Offline drafts stay on the device until server synchronization is confirmed; do not discard a draft that is still waiting to sync.', 'technician_work');
  }
  if (/\b(estimate|labor|material|management review|approve|decline|revision|approved work)\b/.test(text)) {
    if (!allowed.has('estimates.manage') && !allowed.has('estimates.prepareAssigned')) return resolution('Your current role does not have an authorized estimate workflow. Ask an owner or manager to assign the estimate visit or review the required access.', 'estimate_permission');
    const qualifier = role === 'technician' || !allowed.has('estimates.manage')
      ? 'You can prepare an assigned estimate and submit the exact version for management review, but you cannot approve or send it as management.'
      : 'Review the exact submitted version, request changes or approve it, send it to the customer, and schedule work only after customer approval.';
    return resolution(`Open Estimates or the assigned estimate visit. Add labor, materials, notes, and photos, then save the versioned draft. ${qualifier}`, 'estimate_workflow');
  }
  if (/\b(invoice|billable|nonbillable|payment|charge|correction|payment history)\b/.test(text)) {
    if (!allowed.has('invoices.read')) return resolution('Your current role does not have invoice access. Ask an authorized company owner or administrator. The assistant cannot create invoices, payments, or financial changes.', 'invoice_permission');
    return resolution('Open Invoices to review billable work and preview the invoice. Explicitly authorize generation only after the preview is correct. Use audited correction/revision controls for changes and the authorized customer or invoice view for payment history. The assistant does not perform financial actions.', 'invoice_workflow');
  }
  if (/\b(company|team|service area|services|field work|technician availability|integration|notification setting)\b/.test(text)) {
    return resolution('Open Company for team roles, field-work eligibility, services, service areas, availability, and company settings. Integrations and Notifications have dedicated pages. Owner-reserved changes remain limited to the company owner.', 'company_administration');
  }
  if (/\b(customer portal|customer login|service history|provider switching|portal document|portal photo)\b/.test(text)) {
    return resolution('Customers use the Customer Portal email-code sign-in. After verification, they can switch among authorized providers and review tenant-scoped service history, documents, photos, invoices, and reviews. Staff access does not automatically grant customer-portal access.', 'customer_portal');
  }
  if (/\b(marketplace|public booking|find provider)\b/.test(text)) return resolution('Public provider discovery and direct public booking are planned, not currently implemented. I will not direct you to a screen that does not exist.', 'planned_feature');
  return resolution(`${pageHelp(context)} I am not certain which workflow you mean; name the task, such as creating an inquiry, scheduling a job, completing field work, preparing an estimate, or reviewing an invoice.`, 'route_logistics_clarification', { confidence: 'medium' });
}

export { PRODUCT_NAME };
