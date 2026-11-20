import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { mayOpenRoute } from '../utils/routeAccess';
import WorkspaceGate from './WorkspaceGate';

const ProtectedRoute = ({ children }) => {
  const { currentUser, loading, workspace, can, sessionVersion } = useAuth();
  const { pathname, search } = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!currentUser) {
    const next = pathname === '/onboarding' ? `?next=${encodeURIComponent(pathname + search)}` : '';
    return <Navigate to={`/login${next}`} replace />;
  }

  if (!currentUser.emailVerified) return <WorkspaceGate />;
  if (pathname === '/onboarding' && workspace?.status === 'solo') return <React.Fragment key={`${currentUser.uid}:onboarding`}>{children}</React.Fragment>;
  if (!['company', 'solo'].includes(workspace?.status)) return <WorkspaceGate />;
  if (!mayOpenRoute(pathname, can)) return <main className="p-8"><h1 className="text-2xl font-bold">Access unavailable</h1><p className="my-4">Your role does not allow this screen.</p><Link className="underline" to="/">Return to your workspace</Link></main>;

  // Activation refreshes the owner's tenancy claims. Keep the onboarding tree
  // mounted through that one authorized transition so a locally validated CSV
  // preview is not discarded before the owner can explicitly import it.
  const contentKey = pathname === '/onboarding' ? `${currentUser.uid}:onboarding` : `${currentUser.uid}:${sessionVersion}`;
  return <React.Fragment key={contentKey}>{children}</React.Fragment>;
};

export default ProtectedRoute;
