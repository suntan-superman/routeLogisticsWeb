export const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
export const testPaymentsConfigured = stripePublishableKey.startsWith('pk_test_');
