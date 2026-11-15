export const reviewButton = 'min-h-11 rounded-lg bg-primary-700 px-4 py-2 font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50';
export const reviewSecondary = 'min-h-11 rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-900 disabled:opacity-50';
export const reviewField = 'mt-1 block w-full rounded-lg border-gray-300 bg-white px-3 py-2 text-gray-900 focus:ring-primary-500';
export function reviewResponse(value) { return typeof value === 'string' ? value : value?.text || value?.response || ''; }
