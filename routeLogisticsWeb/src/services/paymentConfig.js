export function resolvePaymentConfiguration(environment = {}) {
  const mode = environment.VITE_STRIPE_MODE || 'test', key = environment.VITE_STRIPE_PUBLISHABLE_KEY || '';
  const liveApproved = environment.VITE_STRIPE_LIVE_APPROVED === 'true';
  const configured = ['test','live'].includes(mode) && key.startsWith('pk_' + mode + '_') && (mode === 'test' || liveApproved);
  return { mode, key, liveApproved, configured };
}
const configuration = resolvePaymentConfiguration(import.meta.env);
export const stripePublishableKey = configuration.key;
export const paymentMode = configuration.mode;
export const paymentsConfigured = configuration.configured;
export const testPaymentsConfigured = paymentsConfigured && paymentMode === 'test';
