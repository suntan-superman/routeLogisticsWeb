import React, { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { returnPath } from '../utils/returnPath';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../services/firebase';
import { requestPasswordReset } from '../services/passwordReset';
import { motion as Motion } from 'framer-motion';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [error, setError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const { signin, currentUser } = useAuth();
  const location = useLocation();

  // AuthProvider can remount the router while resolving a signed-in session.
  // Redirect from the current auth state instead of a stale submit callback.
  if (currentUser) return <Navigate to={returnPath(location.search) || '/'} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true); setError(''); setResetMessage('');
    try {
      if (resetMode) {
        setResetMessage(await requestPasswordReset(auth, email, window.location.origin));
      } else {
        const result = await signin(email, password);
        if (!result.success) setError(result.error);
      }
    } catch (failure) {
      const messages = {
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/too-many-requests': 'Too many attempts. Please wait before trying again.',
        'auth/network-request-failed': 'Check your connection and try again.',
      };
      setError(messages[failure.code] || 'Unable to send the password reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full space-y-8"
      >
        <div>
          <div className="mx-auto h-12 w-12 bg-primary-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xl">RL</span>
          </div>
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
            {resetMode ? 'Reset your password' : 'Sign in to Route Logistics'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {resetMode ? 'Choose a new password using the link sent to your email.' : 'Use your existing mi Factotum or Route Logistics account.'}
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                placeholder="Enter your email"
              />
            </div>
            
            {!resetMode && <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                placeholder="Enter your password"
              />
            </div>}
          </div>

          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {resetMessage && <div role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">
            <p>{resetMessage}</p>
            <p className="mt-2">After resetting your password, sign in again. If you were invited to a team, reopen that invitation to accept it.</p>
          </div>}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {resetMode ? 'Sending reset link…' : 'Signing in…'}
                </div>
              ) : (
                resetMode ? 'Send password reset link' : 'Sign in'
              )}
            </button>
          </div>

          <div className="text-center">
            <button type="button" disabled={isLoading} onClick={() => { setResetMode(!resetMode); setError(''); setResetMessage(''); setPassword(''); }} className="mb-4 font-medium text-primary-600 hover:text-primary-500">
              {resetMode ? 'Back to sign in' : 'Forgot password?'}
            </button>
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              <Link
                to={returnPath(location.search) ? `/signup?next=${encodeURIComponent(returnPath(location.search))}` : '/signup'}
                className="font-medium text-primary-600 hover:text-primary-500 transition-colors duration-200"
              >
                Sign up here
              </Link>
            </p>
          </div>
        </form>
      </Motion.div>
    </div>
  );
};

export default LoginPage;
