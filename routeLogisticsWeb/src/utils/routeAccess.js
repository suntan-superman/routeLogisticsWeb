export const routeCapabilities = {
  '/': 'jobs.read', '/my-work': 'jobs.work', '/jobs': 'jobs.schedule', '/customers': 'customers.manage', '/onboarding': 'company.read',
  '/company-setup': 'company.read', '/estimate-templates': 'estimates.manage', '/estimates': 'estimates.manage', '/calendar': 'jobs.schedule',
  '/routes': 'routes.read', '/dispatch': 'dispatch.manage', '/team-locations': 'locations.viewTeam', '/location-history': 'locations.viewTeam',
  '/service-plans': 'plans.manage', '/invoices': 'invoices.read', '/reports': 'reports.operations',
  '/integrations': 'integrations.read', '/notifications': 'company.read', '/reviews': 'reviews.manage',
};
export const mayOpenRoute = (path, can) => !!routeCapabilities[path] && can(routeCapabilities[path]);
