import { routeCapabilities } from '../../utils/routeAccess.js';

export const ROUTE_LOGISTICS_KNOWLEDGE_VERSION = '2026-11-18.1';

export const assistantActions = Object.freeze({
  dashboard: { id: 'dashboard', label: 'Go to Dashboard', route: '/', capability: 'jobs.read' },
  myWork: { id: 'myWork', label: 'Go to My Work', route: '/my-work', capability: 'jobs.work' },
  customers: { id: 'customers', label: 'Go to Customers', route: '/customers', capability: 'customers.manage' },
  dispatch: { id: 'dispatch', label: 'Go to Dispatch', route: '/dispatch', capability: 'dispatch.manage' },
  jobs: { id: 'jobs', label: 'Go to Jobs', route: '/jobs', capability: 'jobs.schedule' },
  calendar: { id: 'calendar', label: 'Go to Calendar', route: '/calendar', capability: 'jobs.schedule' },
  estimates: { id: 'estimates', label: 'Go to Estimates', route: '/estimates', capabilities: ['estimates.manage', 'estimates.prepareAssigned'] },
  invoices: { id: 'invoices', label: 'Go to Invoices', route: '/invoices', capability: 'invoices.read' },
  company: { id: 'company', label: 'Go to Company', route: '/company-setup', capability: 'company.read' },
  routes: { id: 'routes', label: 'Go to Daily Routes', route: '/routes', capability: 'routes.read' },
  teamLocations: { id: 'teamLocations', label: 'Go to Team Locations', route: '/team-locations', capability: 'locations.viewTeam' },
  servicePlans: { id: 'servicePlans', label: 'Go to Service Plans', route: '/service-plans', capability: 'plans.manage' },
  integrations: { id: 'integrations', label: 'Go to Integrations', route: '/integrations', capability: 'integrations.read' },
  notifications: { id: 'notifications', label: 'Go to Notifications', route: '/notifications', capability: 'company.read' },
});

const registry = [
  {
    id: 'customer-intake', route: '/customers', displayName: 'Customers and inquiries', category: 'customers',
    description: 'Capture estimate requests from existing customers or new prospects before scheduling an estimate visit.',
    requiredCapability: 'customers.read', supportedRoles: ['owner', 'admin', 'manager', 'technician'], status: 'implemented',
    keywords: ['customer', 'prospect', 'prospective customer', 'potential customer', 'new customer', 'inquiry', 'estimate request', 'request an estimate', 'follow-up', 'follow up', 'service property'],
    steps: ['Open Customers.', 'Choose New Inquiry.', 'Search for an existing customer first; if this is a new contact, choose Create inquiry for a new prospect.', 'Enter the prospect contact information, service property, requested service, and follow-up details, then save the inquiry.', 'From the saved inquiry, choose Schedule Estimate and select the date, quarter-hour time, and eligible field worker.', 'The contact remains a prospect until conversion is appropriate; do not create an unrelated job from Schedule New Job.'],
    commonProblems: ['Schedule New Job requires an established customer and is not the starting point for a new prospect.', 'Save remains disabled when a required service description or contact field is missing.', 'A property must be selected before an estimate visit can be scheduled.'],
    actionIds: ['customers'],
  },
  {
    id: 'scheduling-dispatch', route: '/jobs', displayName: 'Scheduling and dispatch', category: 'scheduling',
    description: 'Create appointments, check availability, assign staff, and review dispatch exceptions.',
    requiredCapability: 'jobs.schedule', supportedRoles: ['owner', 'admin', 'manager'], status: 'implemented',
    keywords: ['schedule', 'appointment', 'assign', 'reassign', 'availability', 'late', 'overdue', 'dispatch', 'geographic', 'coverage'],
    steps: ['Open Jobs to create or edit an appointment.', 'Choose the service property, date and quarter-hour start time.', 'Select an eligible field worker and review any conflict or coverage warning.', 'Use Dispatch for overdue, potentially late, or reassignment-requested work.'],
    commonProblems: ['Off-duty status does not erase an assignment, but it affects availability guidance.', 'Address and coverage warnings are advisory for authorized internal scheduling unless policy requires approval.'],
    actionIds: ['jobs', 'dispatch', 'calendar'],
  },
  {
    id: 'technician-work', route: '/my-work', displayName: 'Assigned field work', category: 'technician-work',
    description: 'Handle assigned visits, offline drafts, arrival/departure evidence, photos, notes, completion, and reassignment requests.',
    requiredCapability: 'jobs.work', supportedRoles: ['owner', 'admin', 'manager', 'technician'], status: 'implemented',
    keywords: ['assigned work', 'arrival', 'departure', 'photo', 'work note', 'complete job', 'offline', 'sync', 'reassignment', 'shift'],
    steps: ['Open My Work and select the assigned visit.', 'Start the shift when location sharing is appropriate.', 'Record arrival/departure, photos, work notes, checklist entries, and completion details.', 'Offline drafts remain on the device until synchronization is confirmed.'],
    commonProblems: ['Do not discard a draft that is still waiting to sync.', 'A completion can be blocked when required drafts have not been saved or explicitly discarded.'],
    actionIds: ['myWork', 'routes'],
  },
  {
    id: 'approved-estimate-scheduling', route: null, displayName: 'Approved estimate scheduling', category: 'estimates',
    description: 'Convert a customer-approved estimate into its linked service job without creating an unrelated appointment or changing approved pricing.',
    requiredCapabilities: ['customers.manage', 'jobs.schedule'], supportedRoles: ['owner', 'admin', 'manager'], status: 'implemented',
    keywords: ['approved estimate', 'schedule approved work', 'schedule work', 'scheduling needed', 'customer approves', 'customer approved'],
    steps: ['Open Estimates and locate the customer-approved estimate with Approved — scheduling needed status.', 'Open the estimate and use Convert approved estimate.', 'Confirm the approved service property and category; supply only required missing property, category, or prospect-to-customer information.', 'Choose the service date and quarter-hour time, then select Convert approved estimate to job and explicitly confirm job conversion.', 'The conversion creates one unassigned job linked to the immutable approved estimate; verify the Converted job reference.', 'Open Jobs or Dispatch to select an eligible technician and review conflicts or alternatives. Technician selection is not currently part of the conversion dialog.'],
    commonProblems: ['Do not create an unrelated new job when an approved estimate is waiting for conversion.', 'Approved pricing and property/category terms cannot be silently changed during conversion.', 'Conversion is idempotent and geographic checks still apply.'],
    actionIds: ['estimates'],
  },
  {
    id: 'estimate-workflow', route: '/estimates', displayName: 'Estimates', category: 'estimates',
    description: 'Schedule and complete estimate visits, build versioned estimates, review them, send them, and schedule approved work.',
    requiredCapabilities: ['estimates.manage', 'estimates.prepareAssigned'], supportedRoles: ['owner', 'admin', 'manager', 'technician'], status: 'implemented',
    keywords: ['estimate', 'labor', 'material', 'management review', 'approve', 'decline', 'revision', 'approved work'],
    steps: ['Start an estimate visit from the inquiry or assigned work.', 'Add labor, materials, notes, and photos, then save the draft.', 'A technician submits the exact version for management review; an authorized manager can request changes or send it to the customer.', 'After customer approval, use the estimate conversion workflow rather than creating an unrelated job.'],
    commonProblems: ['Approval applies to an exact estimate version; editing creates a newer version.', 'Technicians can prepare assigned estimates but do not receive unrestricted management access.'],
    actionIds: ['estimates', 'customers'],
  },
  {
    id: 'invoice-workflow', route: '/invoices', displayName: 'Invoices and payments', category: 'invoices',
    description: 'Review billable work, preview and explicitly generate invoices, correct invoices, and review payment history.',
    requiredCapability: 'invoices.read', supportedRoles: ['owner', 'admin'], status: 'implemented',
    keywords: ['invoice', 'billable', 'nonbillable', 'payment', 'charge', 'correction', 'payment history'],
    steps: ['Open Invoices to review eligible billable work.', 'Preview before explicitly authorizing invoice generation.', 'Use revision/correction controls rather than silently changing issued financial history.', 'Open the customer payment history from the authorized invoice/customer workflow.'],
    commonProblems: ['Technicians and managers without invoice capability cannot generate or inspect financial records.', 'The assistant provides guidance only and never creates invoices or payments.'],
    actionIds: ['invoices'],
  },
  {
    id: 'company-administration', route: '/company-setup', displayName: 'Company administration', category: 'company',
    description: 'Manage the team, services, service areas, field-work eligibility, availability, settings, integrations, and notifications.',
    requiredCapability: 'company.read', supportedRoles: ['owner', 'admin', 'manager', 'technician'], status: 'implemented',
    keywords: ['company', 'team', 'service area', 'services', 'technician availability', 'integration', 'notification setting'],
    steps: ['Open Company for business settings and the team list.', 'Owners/managers can manage supported operational settings according to their capability.', 'Use Integrations and Notifications for their dedicated configuration pages.'],
    commonProblems: ['Role and field-work eligibility are separate: office staff may be managers without accepting field assignments.', 'Only company owners can perform owner-reserved changes.'],
    actionIds: ['company', 'integrations', 'notifications', 'teamLocations'],
  },
  {
    id: 'customer-portal', route: '/portal', displayName: 'Customer portal', category: 'portal',
    description: 'Customers use email codes to switch authorized providers and review service history, documents, photos, invoices, and reviews.',
    requiredCapability: null, supportedRoles: ['customer'], status: 'implemented',
    keywords: ['customer portal', 'customer login', 'service history', 'provider switching', 'portal document'],
    steps: ['Customers open the Customer Portal and request a fresh email code.', 'After verification they can switch among authorized provider associations.', 'Each provider view remains tenant-scoped.'],
    commonProblems: ['The staff assistant does not grant customer-portal access.', 'Expired or consumed codes must be replaced with a fresh code.'],
    actionIds: [],
  },
  {
    id: 'public-marketplace', route: null, displayName: 'Public provider marketplace', category: 'planned',
    description: 'Public homeowner discovery and direct public booking are planned and are not an implemented authenticated staff workflow.',
    requiredCapability: null, supportedRoles: [], status: 'planned', keywords: ['marketplace', 'public booking', 'find provider'],
    steps: [], commonProblems: ['Do not promise a public booking workflow that is not deployed.'], actionIds: [],
  },
];

export const routeLogisticsKnowledge = Object.freeze(registry.map(entry => Object.freeze({ ...entry })));

export function actionIsAuthorized(action, can, workspaceReady = true) {
  const registered = Object.values(assistantActions).find(item => item.id === action?.id);
  if (!workspaceReady || !registered || action.route !== registered.route || !routeCapabilities[registered.route]) return false;
  const capabilities = registered.capabilities || (registered.capability ? [registered.capability] : []);
  return capabilities.length === 0 || capabilities.some(capability => can(capability));
}

export function authorizedActions(actionIds, can, workspaceReady = true) {
  const requested = new Set(actionIds || []);
  return Object.values(assistantActions).filter(action => requested.has(action.id) && actionIsAuthorized(action, can, workspaceReady));
}

export function availableKnowledge({ can, role }) {
  void can;
  void role;
  return routeLogisticsKnowledge;
}

export function pageKnowledge(pathname, context) {
  const exact = availableKnowledge(context).find(entry => entry.route === pathname);
  if (exact) return exact;
  if (pathname === '/dispatch' || pathname === '/calendar') return routeLogisticsKnowledge.find(entry => entry.id === 'scheduling-dispatch');
  if (pathname === '/routes' || pathname === '/team-locations') return routeLogisticsKnowledge.find(entry => entry.id === 'technician-work');
  if (pathname === '/integrations' || pathname === '/notifications') return routeLogisticsKnowledge.find(entry => entry.id === 'company-administration');
  return routeLogisticsKnowledge.find(entry => entry.id === 'scheduling-dispatch');
}

function scoreEntry(entry, question) {
  const normalized = question.toLowerCase();
  return entry.keywords.reduce((score, keyword) => score + (normalized.includes(keyword) ? Math.max(2, keyword.split(' ').length) : 0), 0);
}

export function resolveKnowledge(question, context) {
  const entries = availableKnowledge(context);
  const ranked = entries.map(entry => ({ entry, score: scoreEntry(entry, String(question || '')) })).sort((a, b) => b.score - a.score);
  return ranked[0]?.score > 0 ? ranked[0].entry : pageKnowledge(context.pathname || '/', context);
}

export function deterministicHelp(question, context) {
  const entry = resolveKnowledge(question, context);
  if (!entry) return { text: 'Choose a help topic or contact Workside Support.', actions: [] };
  if (entry.status === 'planned') return { text: `${entry.displayName} is planned, not currently implemented. I will not direct you to a screen that does not exist.`, actions: [] };
  const authorized = authorizedActions(entry.actionIds, context.can, context.workspaceReady);
  const restriction = entry.id === 'invoice-workflow' && !context.can('invoices.read')
    ? ' Your current role does not have invoice access; ask an authorized owner or administrator.'
    : '';
  return {
    text: `${entry.description}${restriction}${entry.steps.length ? ` ${entry.steps.join(' ')}` : ''}`,
    actions: authorized,
    knowledgeId: entry.id,
  };
}

export function suggestedQuestions(pathname, context) {
  const entry = pageKnowledge(pathname, context);
  const defaults = {
    customers: ['How do I create an inquiry for a new prospect?', 'How do I schedule an estimate visit?'],
    scheduling: ['How do I assign or reassign a technician?', 'Where do I review late appointments?'],
    dispatch: ['How do I review overdue work?', 'How do I find available field staff?'],
    estimates: ['How does management review an estimate?', 'How do I schedule approved work?'],
    invoices: ['How do I preview an invoice?', 'Who can generate an invoice?'],
    'technician-work': ['How do offline work notes synchronize?', 'How do I request reassignment?'],
    company: ['How do I manage field-work eligibility?', 'Where are service areas configured?'],
  };
  return defaults[entry?.category] || ['How do I create a new inquiry?', 'Where can I review assigned work?'];
}

export function containsSensitiveQuestion(value) {
  const text = String(value || '');
  return /(?:\b(?:password|passcode|api[_ -]?key|secret|access token|auth token|card number|cvv)\b\s*[:=]|\b\d{13,19}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\+?\d[\d\s().-]{8,}\d)/i.test(text);
}

export function validateRegistry() {
  const routeSet = new Set(Object.keys(routeCapabilities));
  const ids = new Set();
  const errors = [];
  for (const entry of routeLogisticsKnowledge) {
    if (ids.has(entry.id)) errors.push(`Duplicate knowledge id: ${entry.id}`);
    ids.add(entry.id);
    if (entry.route && entry.route !== '/portal' && !routeSet.has(entry.route)) errors.push(`Unknown route: ${entry.route}`);
    for (const actionId of entry.actionIds) if (!Object.values(assistantActions).some(action => action.id === actionId)) errors.push(`Unknown action: ${actionId}`);
  }
  return errors;
}
