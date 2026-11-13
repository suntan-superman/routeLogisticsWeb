// Only known internal destinations are allowed; invitation fragments survive signup/sign-in.
export function returnPath(search) {
  const next = new URLSearchParams(search).get('next');
  return next && /^\/accept-invite\?id=[a-zA-Z0-9_-]+#code=[a-f0-9]{64}$/.test(next) ? next : null;
}
