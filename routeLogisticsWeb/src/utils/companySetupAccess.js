export const mayReviewCompanySetup = role => ['owner', 'admin'].includes(role);

export const isInvitationReturn = path => typeof path === 'string' && path.startsWith('/accept-invite?');
