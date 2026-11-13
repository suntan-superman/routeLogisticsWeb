import { useState } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function EmailVerificationBanner() {
  const { currentUser, refreshSession, emailVerified } = useAuth();
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  if (!currentUser || emailVerified) return null;
  const run = async (resend) => {
    setBusy(true);
    try {
      if (resend) {
        if (Date.now() - sentAt < 60_000) throw new Error('Please wait a minute before requesting another email.');
        await sendEmailVerification(currentUser);
        setSentAt(Date.now());
        toast.success('Verification email sent. Check your inbox and spam folder.');
      } else {
        await refreshSession();
        if (!currentUser.emailVerified) toast.error('Your email has not been verified yet.');
      }
    } catch (error) { toast.error(error.message); }
    finally { setBusy(false); }
  };
  return <div role="status" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
    <p>Verify <strong>{currentUser.email}</strong> to accept invitations and manage your team.</p>
    <div className="mt-2 flex gap-4">
      <button disabled={busy} className="underline disabled:opacity-50" onClick={() => run(true)}>Resend verification email</button>
      <button disabled={busy} className="underline disabled:opacity-50" onClick={() => run(false)}>I’ve verified my email</button>
    </div>
  </div>;
}
