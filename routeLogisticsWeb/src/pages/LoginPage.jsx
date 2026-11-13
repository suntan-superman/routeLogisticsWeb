import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { motion as Motion } from 'framer-motion';
import { returnPath } from '../utils/returnPath';
import { rememberedEmail, rememberEmail } from '../utils/rememberedEmail';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../services/firebase';
import { requestPasswordReset } from '../services/passwordReset';
import { requestStaffCode, signInWithStaffCode } from '../services/staffLogin';

export default function LoginPage() {
  const [email, setEmail] = useState(rememberedEmail);
  const [remember, setRemember] = useState(() => Boolean(email));
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState('password');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [resendAt, setResendAt] = useState(0);
  const [clock, setClock] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { signin, currentUser } = useAuth();
  const location = useLocation();
  useEffect(() => {
    if (!challenge || clock >= resendAt) return;
    const timer = setTimeout(() => setClock(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [challenge, clock, resendAt]);

  // A session refresh can remount the router; derive navigation from auth state.
  if (currentUser) return <Navigate to={returnPath(location.search) || '/'} replace />;

  const resetMode = mode === 'reset';
  const otpMode = mode === 'otp';
  const secondsUntilResend = Math.max(0, Math.ceil((resendAt - clock) / 1000));
  const fieldClass = 'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:bg-gray-50 disabled:text-gray-600';
  const changeMode = (next) => {
    setMode(next); setPassword(''); setShowPassword(false); setCode(''); setChallenge(null); setError(''); setNotice('');
  };
  const sendCode = async () => {
    const result = await requestStaffCode(email);
    setChallenge(result.challengeId); setCode(''); setNotice(result.message);
    const now = Date.now(); setClock(now); setResendAt(now + 60_000);
  };
  const showError = (failure) => {
    const messages = {
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/too-many-requests': 'Too many attempts. Please wait before trying again.',
      'auth/network-request-failed': 'Check your connection and try again.',
      'functions/resource-exhausted': 'Too many code requests or attempts. Wait 15 minutes, or use your password.',
      'functions/permission-denied': 'Code is invalid or expired. Request a new code or use your password.',
      'functions/failed-precondition': 'Email sign-in is unavailable. Use your password.',
      'functions/invalid-argument': 'Please enter a valid email address and six-digit code.',
      'functions/unavailable': 'Unable to connect. Check your connection and try again.',
    };
    setError(messages[failure.code] || (resetMode ? 'Unable to send the password reset email. Please try again.' : 'Unable to sign in. Please try again or use your password.'));
  };
  const handleSubmit = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    rememberEmail(email, remember);
    try {
      if (resetMode) setNotice(await requestPasswordReset(auth, email, window.location.origin));
      else if (otpMode && !challenge) await sendCode();
      else if (otpMode) await signInWithStaffCode(challenge, code);
      else {
        const result = await signin(email, password);
        if (!result.success) setError(result.error);
      }
    } catch (failure) { showError(failure); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    setBusy(true); setError(''); setNotice('');
    try { await sendCode(); } catch (failure) { showError(failure); }
    finally { setBusy(false); }
  };

  return <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6">
    <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="w-full max-w-md">
      <div className="mb-7 text-center">
        <Link to="/" aria-label="Route Logistics home" className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600 text-xl font-bold text-white">RL</Link>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-gray-900">{resetMode ? 'Reset your password' : 'Welcome back'}</h1>
        <p className="mt-2 text-sm text-gray-600">{resetMode ? 'Choose a new password using the link sent to your email.' : 'Sign in to Route Logistics with your existing account.'}</p>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        {!resetMode && <div role="group" aria-label="Sign-in method" className="mb-6 flex rounded-lg bg-gray-100 p-1">
          {[['password', 'Password'], ['otp', 'Email code']].map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} disabled={busy} onClick={() => changeMode(value)} className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${mode === value ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>{label}</button>)}
        </div>}
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email address</label>
            <input id="email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required disabled={busy || !!challenge} value={email} onChange={event => setEmail(event.target.value)} className={fieldClass} placeholder="you@company.com" />
          </div>
          {mode === 'password' && <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
              <button type="button" disabled={busy} onClick={() => changeMode('reset')} className="text-sm font-medium text-primary-600 hover:text-primary-700">Forgot password?</button>
            </div>
            <div className="relative">
              <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required disabled={busy} value={password} onChange={event => setPassword(event.target.value)} className={`${fieldClass} pr-12`} placeholder="Enter your password" />
              <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} disabled={busy} onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-gray-500 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500">
                {showPassword ? <EyeSlashIcon className="h-5 w-5" aria-hidden="true" /> : <EyeIcon className="h-5 w-5" aria-hidden="true" />}
              </button>
            </div>
          </div>}
          {otpMode && !challenge && <p className="text-sm text-gray-600">We’ll email a six-digit code to your verified account. Use your password if your account requires two-step verification.</p>}
          {otpMode && challenge && <div>
            <label htmlFor="login-code" className="block text-sm font-medium text-gray-700">Six-digit sign-in code</label>
            <input id="login-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus disabled={busy} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} className={`${fieldClass} text-center text-xl tracking-[0.35em]`} placeholder="000000" />
            <p className="mt-2 text-xs text-gray-500">Use the newest code. It expires in 10 minutes. Delivery may take a minute.</p>
            <div className="mt-3 flex flex-wrap justify-between gap-3 text-sm">
              <button type="button" disabled={busy || secondsUntilResend > 0} onClick={resend} className="font-medium text-primary-600 disabled:text-gray-400">{secondsUntilResend > 0 ? `Resend in ${secondsUntilResend}s` : 'Resend code'}</button>
              <button type="button" disabled={busy} onClick={() => changeMode('otp')} className="text-gray-600 underline">Use a different email</button>
            </div>
          </div>}
          <label className="flex items-start gap-3 text-sm text-gray-700">
            <input id="remember-email" type="checkbox" checked={remember} onChange={event => { setRemember(event.target.checked); if (!event.target.checked) rememberEmail('', false); }} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            <span>Remember me<span className="block text-xs text-gray-500">Save my email on this device.</span></span>
          </label>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {notice && <div role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
            <p>{notice}</p>
            {resetMode && <p className="mt-2">After resetting your password, sign in again. If you were invited to a team, reopen that invitation to accept it.</p>}
          </div>}
          <button type="submit" disabled={busy} className="flex w-full items-center justify-center rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? 'Please wait…' : resetMode ? 'Send password reset link' : otpMode && !challenge ? 'Email a sign-in code' : 'Sign in'}
          </button>
          {resetMode && <button type="button" disabled={busy} onClick={() => changeMode('password')} className="block w-full text-center text-sm font-medium text-primary-600">Back to sign in</button>}
        </form>
      </div>
      <p className="mt-6 text-center text-sm text-gray-600">New to Route Logistics?{' '}<Link to={returnPath(location.search) ? `/signup?next=${encodeURIComponent(returnPath(location.search))}` : '/signup'} className="font-semibold text-primary-600 hover:text-primary-700">Create an account</Link></p>
    </Motion.div>
  </main>;
}
