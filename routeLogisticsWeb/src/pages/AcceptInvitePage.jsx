import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import EmailVerificationBanner from '../components/EmailVerificationBanner';

export default function AcceptInvitePage() {
  const { currentUser, emailVerified, refreshSession, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inviteId = new URLSearchParams(location.search).get('id');
  const code = new URLSearchParams(location.hash.slice(1)).get('code');
  const returnTo = encodeURIComponent(location.pathname + location.search + location.hash);
  const accept = async () => {
    setBusy(true); setError('');
    try {
      await httpsCallable(functions, 'acceptTeamInvite')({ inviteId, code });
      await refreshSession();
      navigate('/', { replace: true });
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto max-w-lg p-6 pt-20">
    <Link to="/" className="text-primary-700">Route Logistics</Link>
    <h1 className="my-6 text-3xl font-bold">Join your company</h1>
    <p className="mb-6">Use the email address your company owner invited. Your owner has already selected your role and permissions.</p>
    {!currentUser && <>
      <p className="mb-4 text-sm text-gray-600">Already have an account? Sign in with your existing password, or use “Forgot password?” on the sign-in page.</p>
      <p className="mb-6 text-sm text-gray-600">New to Route Logistics? Create your personal login, verify your email, then accept this invitation. This joins the existing company; it does not create a company or let you choose a role.</p>
    </>}
    {!inviteId || !code ? <p role="alert">This invitation link is incomplete. Ask the owner to send a new invitation.</p> : !currentUser ? <div className="flex gap-5">
      <Link className="text-primary-700 underline" to={`/login?next=${returnTo}`}>Sign in</Link>
      <Link className="text-primary-700 underline" to={`/signup?next=${returnTo}`}>Create your login</Link>
    </div> : <>
      <EmailVerificationBanner />
      <p className="mb-4">Signed in as {currentUser.email}</p>
      <button disabled={busy || !emailVerified} onClick={accept} className="rounded bg-primary-600 px-5 py-2 text-white disabled:opacity-50">{busy ? 'Joining…' : 'Accept invitation'}</button>
      <button onClick={logout} className="ml-4 underline">Use another account</button>
    </>}
    {error && <p role="alert" className="mt-5 text-red-700">{error}</p>}
  </main>;
}
