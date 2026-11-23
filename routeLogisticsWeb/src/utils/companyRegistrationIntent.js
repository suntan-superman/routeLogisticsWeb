const KEY = 'rl-company-authorization';
const VALID = /^[A-Za-z0-9_-]{43}$/;

export function captureCompanyAuthorization() {
  if (typeof window === 'undefined') return;
  const code = new URLSearchParams(window.location.hash.slice(1)).get('authorization');
  if (!code) return;
  if (VALID.test(code)) window.sessionStorage.setItem(KEY, code);
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
}

export function companyAuthorization() {
  if (typeof window === 'undefined') return '';
  const code = window.sessionStorage.getItem(KEY) || '';
  return VALID.test(code) ? code : '';
}

export function clearCompanyAuthorization() {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(KEY);
}
