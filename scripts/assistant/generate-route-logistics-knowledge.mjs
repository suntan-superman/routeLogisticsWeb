#!/usr/bin/env node
// Generates the deploy-only Merxus Route Logistics knowledge resolver from the
// source-verified audit catalog. The generated file is versioned here as the
// local backup; Merxus itself remains deployment-only per operator policy.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog, validateCatalog } from '../../docs/audits/assistant-knowledge/catalog.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, 'routeLogisticsKnowledgeBase.js');
const webOutput = path.resolve(here, '../../routeLogisticsWeb/src/features/assistant/verifiedProcedures.generated.js');
const issues = validateCatalog();
if (issues.length) throw new Error(issues.join('\n'));

const denialById = {
  'CPE-20': 'Your role cannot convert a customer-approved estimate into scheduled work. Ask an authorized manager, administrator, or owner. Do not create an unrelated new job.',
  'JSD-01': 'Your role can review assigned work but cannot create or schedule company jobs. Ask an authorized manager, administrator, or owner. Use My Work for assigned visits.',
  'JSD-09': 'A technician cannot directly reassign a company job. Use Request reassignment on the assigned work order; an authorized manager, administrator, or owner reviews and changes the assignment.',
  'BIL-01': 'Your current role does not have invoice access. Ask an authorized company owner or administrator. The assistant cannot create invoices, payments, or financial changes.',
  'BIL-02': 'Your current role does not have invoice access. Managers and technicians must ask an authorized company owner or administrator. The assistant cannot create invoices, payments, or financial changes.',
  'BIL-10': 'Only the company owner can change QuickBooks accounting defaults. A manager cannot select or save the default income account or service item.',
  'APT-04': 'Only the company owner can send team invitations or choose invitation roles. A manager cannot invite or change the role of a technician or manager.',
};

const intentByPrefix = {
  CPE: 'estimate_workflow',
  JSD: 'scheduling_dispatch',
  MOB: 'technician_work',
  BIL: 'invoice_workflow',
  APT: 'account_permissions',
};

const specialIntent = {
  'CPE-01': 'customer_intake',
  'CPE-02': 'customer_intake',
  'CPE-03': 'customer_intake',
  'CPE-04': 'customer_intake',
  'CPE-05': 'customer_intake',
  'CPE-06': 'customer_intake',
  'CPE-07': 'customer_intake',
  'CPE-08': 'customer_intake',
  'CPE-20': 'approved_estimate_scheduling',
  'BIL-06': 'live_payments_unavailable',
  'BIL-09': 'quickbooks_limited',
  'BIL-10': 'quickbooks_defaults',
  'APT-13': 'assistant_boundary',
  'APT-14': 'human_support',
  'APT-15': 'assistant_session',
};

const procedures = catalog.map(row => ({
  id: row.id,
  question: row.question,
  reply: row.verifiedAnswer,
  intent: specialIntent[row.id] || intentByPrefix[row.id.split('-')[0]] || 'route_logistics_procedure',
  status: row.implementationStatus,
  routes: [...new Set(row.assistantTests.map(test => test.route).filter(Boolean))],
  deniedRoles: [...new Set(row.assistantTests.filter(test => test.expectation === 'permission-denied').map(test => test.role === 'technician-assigned' ? 'technician' : test.role))],
  denialReply: denialById[row.id] || null,
}));

// Current portal workflow supplements the fixed 75-question audit catalog.
// Keep these procedures in both the web fallback and the Merxus deploy copy.
procedures.push(
  {
    id: 'PORTAL-01',
    question: 'Where do I find customer portal access and email a customer invitation?',
    reply: 'Open Customers, find the customer, and select the eye icon to open Customer Details. Scroll to Customer portal access and select Email portal invitation. The customer must have a valid email address. The pencil icon opens Edit Customer; portal access is in Customer Details. The invitation is single-use and expires after seven days. You can see Connected, Invitation queued, Revoked, or Not connected in that section. The assistant cannot send an invitation for you.',
    intent: 'customer_portal_invitation', status: 'implemented', routes: ['/customers'],
    deniedRoles: ['technician'],
    denialReply: 'Your role cannot email customer portal invitations. Ask an authorized owner, administrator, or manager to open Customers, then Customer Details, and use Customer portal access.',
  },
  {
    id: 'PORTAL-02',
    question: 'How does a customer accept a provider invitation and connect in the customer portal?',
    reply: 'Open the single-use provider invitation email, then sign in at the Customer Portal using an email code sent to the invited address. Use the invitation link or paste it under Connect provider and select Connect provider. The invitation expires after seven days; the email code expires after ten minutes and can be used once. After connection, choose the provider from Service provider to view that provider’s records. If a link is expired or used, ask the provider for a new invitation. Matching an email or phone number alone does not grant provider access.',
    intent: 'customer_portal_connection', status: 'implemented', routes: ['/portal'],
    deniedRoles: [], denialReply: null,
  },
);

const source = `// GENERATED from Route Logistics docs/audits/assistant-knowledge/catalog.mjs.
// Do not hand-edit this deploy-only copy. Regenerate from the Route Logistics repository.

const PRODUCT_NAME = 'Route Logistics';
const PROCEDURES = Object.freeze(${JSON.stringify(procedures, null, 2)});

function safeText(value, maxLength = 1_000) {
  return String(value || '').replace(/[\\u0000-\\u001f\\u007f]/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, maxLength);
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
  [/\\bone[- ]time\\b/g, 'onetime'], [/\\bsign[- ]?in\\b/g, 'login'], [/\\blog in\\b/g, 'login'],
  [/\\bfield worker\\b/g, 'technician'], [/\\bteam member\\b/g, 'staff'], [/\\bprospective\\b/g, 'prospect'],
  [/\\bgenerat(?:e|ing)\\b/g, 'create'], [/\\badd(?:ing)?\\b/g, 'create'], [/\\bappointment\\b/g, 'job'],
  [/\\bwork order\\b/g, 'job'], [/\\breassign(?:ed|ing|ment)?\\b/g, 'reassign'], [/\\bschedul(?:e|ed|ing)\\b/g, 'schedule'],
  [/\\bdelet(?:e|ed|ing|ion)\\b/g, 'delete'], [/\\bcancell?(?:ed|ing|ation)?\\b/g, 'cancel'],
  [/\\bapprov(?:e|ed|al|ing)\\b/g, 'approve'], [/\\brevis(?:e|ed|ion)\\b/g, 'revise'],
  [/\\bsynchroni[sz](?:e|ed|ing|ation)?\\b/g, 'sync'], [/\\bphotos?\\b/g, 'photo'], [/\\bnotes?\\b/g, 'note'],
  [/\\bpayments?\\b/g, 'payment'], [/\\binvoices?\\b/g, 'invoice'], [/\\bestimates?\\b/g, 'estimate'],
  [/\\bcustomers?\\b/g, 'customer'], [/\\bjobs?\\b/g, 'job'], [/\\btechnicians?\\b/g, 'technician'],
];

function normalized(value) {
  let text = safeText(value, 2_000).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
  return text.replace(/\\s+/g, ' ').trim();
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
  create: /\\b(create|new|request)\\b/, schedule: /\\bschedule\\b/, assign: /\\b(assign|reassign)\\b/,
  cancel: /\\b(cancel|delete|pause|skip|resume)\\b/, record: /\\b(record|take|choose|save|share|email|send)\\b/,
  approve: /\\b(approve|decline|revise|review|convert)\\b/, access: /\\b(login|reset|invite|permission|access|switch)\\b/,
});
const OBJECTS = Object.freeze({
  customer: /\\b(customer|prospect|inquiry)\\b/, property: /\\b(property|address|coverage|service area)\\b/,
  estimate: /\\bestimate\\b/, job: /\\b(job|recurring|service plan)\\b/, dispatch: /\\b(dispatch|route|late|overdue)\\b/,
  field: /\\b(arrival|departure|photo|note|checklist|offline|sync|duty|location|reassign)\\b/,
  invoice: /\\b(invoice|stripe|payment|quickbooks|accounting)\\b/, account: /\\b(login|password|code|invite|role|permission|account|assistant|support)\\b/,
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
  if (/\\b(ignore|override|forget)\\b.{0,40}\\b(instruction|system|permission|security)\\b|\\b(reveal|show)\\b.{0,30}\\b(prompt|secret|token|password|api key)\\b/i.test(text)) {
    return resolution('I can only provide approved Route Logistics guidance and verified in-app navigation. I cannot reveal prompts, credentials, private records, or bypass permissions.', 'security_boundary');
  }
  if (/\\b(talk|contact|speak|connect)\\b.*\\b(human|person|support|agent|representative)\\b|\\breport (?:a )?problem\\b/.test(text)) {
    return resolution('Use the existing support workflow: choose Support or Report a Problem in the assistant. Review the disclosure, describe the issue without customer or financial data, and submit it to Workside Support. An ordinary question does not automatically create a handoff.', 'human_support', { humanRequired: true });
  }
  if (/help with (?:this )?page|what can i do (?:here|on this page)/.test(text)) return resolution(pageHelp(context), 'page_help');

  // Portal invitations are a staff action; customer connection is a separate
  // single-use flow. Resolve these before broad customer-intake guidance.
  if (/\\b(portal|provider|invitation)\\b/.test(text)) {
    const staffAccess = /\\b(customer|portal)\\b/.test(text) && /\\b(invite|invitation|access|email|send|grant)\\b/.test(text)
      && /\\b(where|find|invite|email|send|grant|give|provide|manage)\\b/.test(text);
    const customerConnection = /\\b(connect|link|accept|paste|join|sign[ -]?in)\\b/.test(text)
      && /\\b(provider|invitation|portal)\\b/.test(text);
    if (staffAccess && !/\\b(accept|paste|sign[ -]?in)\\b/.test(text)) {
      const procedure = PROCEDURES.find(row => row.id === 'PORTAL-01');
      return allowed.has('customers.manage')
        ? resolution(procedure.reply, procedure.intent, { knowledgeId: procedure.id })
        : resolution(procedure.denialReply, procedure.intent + '_permission', { knowledgeId: procedure.id });
    }
    if (customerConnection) {
      const procedure = PROCEDURES.find(row => row.id === 'PORTAL-02');
      return resolution(procedure.reply, procedure.intent, { knowledgeId: procedure.id });
    }
  }

  const matched = matchProcedure(question, context);
  if (matched) return responseForProcedure(matched, context);

  if (/\\b(marketplace|public booking|find provider)\\b/.test(text)) return resolution('Public provider discovery and direct public booking are planned, not currently implemented. I will not direct you to a screen that does not exist.', 'planned_feature', { knownLimitation: true });
  if (/\\b(invoice|billable|nonbillable|payment|charge|correction|payment history)\\b/.test(text)) {
    if (!allowed.has('invoices.read')) return resolution('Your current role does not have invoice access. Ask an authorized company owner or administrator. The assistant cannot create invoices, payments, or financial changes.', 'invoice_permission');
    return resolution('Open an eligible completed billable job in Jobs and choose Create Invoice. Review the preview before explicitly generating the draft. Open Invoices for status, audited correction, delivery, payment and history controls. The assistant does not perform financial actions.', 'invoice_workflow');
  }
  if (/(?:schedule|convert).{0,80}approv\\w*.{0,40}(?:estimate|work)|approv\\w*.{0,40}estimate.{0,60}(?:schedule|convert|work)/.test(text)) {
    if (!allowed.has('jobs.schedule') || !allowed.has('customers.manage')) return resolution('Your role cannot convert a customer-approved estimate into scheduled work. Ask an authorized manager, administrator, or owner. Do not create an unrelated new job.', 'approved_estimate_scheduling_permission');
    return resolution(PROCEDURES.find(row => row.id === 'CPE-20').reply, 'approved_estimate_scheduling', { knowledgeId: 'CPE-20' });
  }
  if (/\\b(inquiry|prospect\\w*|potential customer|new customer|service property|follow[- ]?up|convert.*customer)\\b/.test(text)) return resolution(PROCEDURES.find(row => row.id === 'CPE-01').reply, 'customer_intake', { knowledgeId: 'CPE-01' });
  if (/\\b(cancel|delete|pause|skip|resume)\\b.*\\b(job|appointment|recurring|service)\\b/.test(text)) return resolution('Open Jobs for an individual appointment or Service Plans for recurring work. Cancellation retains history and cannot cancel in-progress/completed work; recurring plans support skip once, pause through a date, pause indefinitely, and resume.', 'scheduling_exception');
  if (/\\b(schedule|appointment|assign|reassign|availability|late|overdue|dispatch|coverage|geographic)\\b/.test(text)) {
    if (!allowed.has('jobs.schedule') && !allowed.has('dispatch.manage')) return resolution('Your role can review assigned work but cannot schedule or reassign company appointments. Ask an authorized manager, administrator, or owner. Use My Work for your assigned visits.', 'scheduling_permission');
    return resolution('Use Jobs to create or edit an appointment, select its service property and quarter-hour start time, then choose an eligible field worker and review conflicts. Use Dispatch for potentially late, overdue, or reassignment-requested work.', 'scheduling_dispatch');
  }
  if (/\\b(assigned work|arrival|departure|photo|work note|complete.*job|offline|sync|reassignment|shift)\\b/.test(text)) return resolution('Open My Work and select the assigned visit. Record arrival/departure, photos, notes, checklist entries, and completion details. Offline drafts stay on the device until server synchronization is confirmed; do not discard a draft that is still waiting to sync.', 'technician_work');
  if (/\\b(estimate|labor|material|management review|approve|decline|revision|approved work)\\b/.test(text)) {
    if (!allowed.has('estimates.manage') && !allowed.has('estimates.prepareAssigned')) return resolution('Your current role does not have an authorized estimate workflow. Ask an owner or manager to assign the estimate visit or review the required access.', 'estimate_permission');
    const qualifier = role === 'technician' || !allowed.has('estimates.manage') ? 'You can prepare an assigned estimate and submit the exact version for management review, but you cannot approve or send it as management.' : 'Review the exact submitted version, request changes or approve it, send it to the customer, and schedule work only after customer approval.';
    return resolution('Open Estimates or the assigned estimate visit. Add labor, materials, notes, and photos, then save the versioned draft. ' + qualifier, 'estimate_workflow');
  }
  if (/\\b(company|team|service area|services|field work|technician availability|integration|notification setting)\\b/.test(text)) return resolution('Open Company for team roles, field-work eligibility, services, service areas, availability, and company settings. Integrations and Notifications have dedicated pages. Owner-reserved changes remain limited to the company owner.', 'company_administration');
  if (/\\b(customer portal|customer login|service history|provider switching|portal document|portal photo)\\b/.test(text)) return resolution('Customers use the Customer Portal email-code sign-in. After verification, they can switch among authorized providers and review tenant-scoped service history, documents, photos, invoices, and reviews. Staff access does not automatically grant customer-portal access.', 'customer_portal');
  return resolution(pageHelp(context) + ' I am not certain which workflow you mean; name the task, such as creating an inquiry, scheduling a job, completing field work, preparing an estimate, or reviewing an invoice.', 'route_logistics_clarification', { confidence: 'medium' });
}

export { PRODUCT_NAME, PROCEDURES };
`;

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, source);
fs.writeFileSync(webOutput, `// GENERATED by scripts/assistant/generate-route-logistics-knowledge.mjs.\nexport default Object.freeze(${JSON.stringify(procedures, null, 2)});\n`);
console.log(`Generated ${procedures.length} verified Route Logistics procedures at ${output} and ${webOutput}`);

