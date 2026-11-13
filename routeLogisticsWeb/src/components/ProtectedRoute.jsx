import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { mayOpenRoute } from '../utils/routeAccess';
import WorkspaceGate from './WorkspaceGate';

const ProtectedRoute = ({ children }) => {
  const { currentUser, loading, workspace, can, sessionVersion } = useAuth();
  const { pathname } = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (!currentUser.emailVerified || !['company', 'solo'].includes(workspace?.status)) return <WorkspaceGate />;
  if (!mayOpenRoute(pathname, can)) return <main className="p-8"><h1 className="text-2xl font-bold">Access unavailable</h1><p className="my-4">Your role does not allow this screen.</p><Link className="underline" to="/">Return to your workspace</Link></main>;

  return <React.Fragment key={`${currentUser.uid}:${sessionVersion}`}>{children}</React.Fragment>;
};

export default ProtectedRoute;
