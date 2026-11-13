import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import EmailVerificationBanner from './EmailVerificationBanner';
export default function WorkspaceGate() {
  const { workspace, currentUser, refreshSession, logout } = useAuth();
  const navigate = useNavigate();
  const [link, setLink] = useState(''), [error, setError] = useState('');
  const pending = workspace?.status === 'pending';
  return <main className="mx-auto max-w-xl space-y-5 p-8"><h1 className="text-2xl font-bold">Route Logistics</h1>
    <EmailVerificationBanner />
    <h2 className="text-xl font-semibold">{!currentUser?.emailVerified ? 'Verify your email to continue' : pending ? 'Join your company' : 'Workspace unavailable'}</h2>
    <p>{pending ? 'Accept the invitation from your company owner. Your role is already selected.' : 'Refresh your access, or ask your owner to check your membership.'}</p>
    {(workspace?.invitations || []).map(invite => <p key={invite.id}>{invite.companyName} · {invite.role}</p>)}
    {pending && <form className="space-y-3" onSubmit={event => { event.preventDefault(); try { const url = new URL(link); if (url.origin !== window.location.origin || url.pathname !== '/accept-invite') throw new Error('Use your Route Logistics invitation link.'); navigate(url.pathname + url.search + url.hash); } catch (e) { setError(e.message); } }}><label className="block">Invitation link<input className="input-field block w-full" type="url" value={link} onChange={e => setLink(e.target.value)} required /></label><button className="btn-primary">Open invitation</button></form>}
    <div className="flex gap-4"><button className="underline" onClick={() => refreshSession().catch(e => setError(e.message))}>Refresh access</button><button className="underline" onClick={logout}>Sign out</button></div>
    {error && <p role="alert">{error}</p>}
  </main>;
}
