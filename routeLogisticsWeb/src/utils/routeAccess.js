export const routeCapabilities = {
  '/': 'jobs.read', '/my-work': 'jobs.work', '/jobs': 'jobs.schedule', '/customers': 'customers.manage',
  '/company-setup': 'company.read', '/estimate-templates': 'estimates.manage', '/calendar': 'jobs.schedule',
  '/routes': 'routes.read', '/dispatch': 'dispatch.manage', '/team-locations': 'locations.viewTeam',
  '/service-plans': 'plans.manage', '/invoices': 'invoices.read', '/reports': 'reports.operations',
  '/integrations': 'integrations.read', '/notifications': 'company.read',
};
export const mayOpenRoute = (path, can) => !!routeCapabilities[path] && can(routeCapabilities[path]);
