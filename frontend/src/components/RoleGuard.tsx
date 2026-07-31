/**
 * RoleGuard — wraps a route/component and blocks access if the current user
 * does not have one of the required roles (per master_plan §7.5 role-scoping).
 *
 * Usage:
 *   <RoleGuard roles={['EVENT_MANAGER', 'SYSTEM_ADMIN']}>
 *     <EventBuilder />
 *   </RoleGuard>
 *
 * If the user is not logged in → shows a "sign in" prompt.
 * If logged in but wrong role → shows an "Access Denied" message.
 *
 * In Phase 2 the user can set their role via the dev switcher in the nav.
 * In Phase 3 the real login flow will set this automatically.
 */

import React from 'react';
import { ShieldOff, LogIn } from 'lucide-react';
import { useAuth, type UserRole } from '../context/AuthContext';

interface RoleGuardProps {
  roles: UserRole[];
  children: React.ReactNode;
}

export function RoleGuard({ roles, children }: RoleGuardProps) {
  const { user, hasRole } = useAuth();

  if (!user) {
    return (
      <div
        className="animate-fade-in"
        style={{
          maxWidth: '480px',
          margin: '4rem auto',
          textAlign: 'center',
        }}
      >
        <div className="card" style={{ padding: '3rem 2rem' }}>
          <LogIn size={48} style={{ margin: '0 auto 1.5rem', opacity: 0.5 }} />
          <h2 style={{ marginBottom: '0.75rem' }}>Sign In Required</h2>
          <p className="text-muted">
            You must be signed in to access this page. Use the role switcher
            in the navigation to set your session role for development.
          </p>
        </div>
      </div>
    );
  }

  if (!hasRole(...roles)) {
    return (
      <div
        className="animate-fade-in"
        style={{
          maxWidth: '480px',
          margin: '4rem auto',
          textAlign: 'center',
        }}
      >
        <div className="card" style={{ padding: '3rem 2rem' }}>
          <ShieldOff
            size={48}
            style={{ margin: '0 auto 1.5rem', color: 'var(--error, #ef4444)' }}
          />
          <h2 style={{ marginBottom: '0.75rem' }}>Access Denied</h2>
          <p className="text-muted">
            This page requires one of the following roles:{' '}
            <strong>{roles.join(', ')}</strong>. Your current role is{' '}
            <strong>{user.role}</strong>.
          </p>
          <p className="text-muted" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
            Use the role switcher (▼ in the navbar) to switch roles during development.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
