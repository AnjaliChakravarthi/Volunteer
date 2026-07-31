/**
 * App.tsx — Root router with AuthProvider, ToastProvider, RoleGuard,
 * and a dev role-switcher in the navbar (Phase 2 testing; Phase 3 = real login).
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import {
  Home, ClipboardList, CheckSquare, Calendar, LogOut, UserCircle, ChevronDown,
} from 'lucide-react';

import { AuthProvider, useAuth, type UserRole } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { RoleGuard } from './components/RoleGuard';

import OpportunityPortal    from './pages/OpportunityPortal';
import ApplicationForm      from './pages/ApplicationForm';
import OnboardingChecklist  from './pages/OnboardingChecklist';
import EventBuilder         from './pages/EventBuilder';

const ROLE_OPTIONS: { label: string; value: UserRole }[] = [
  { label: 'Volunteer',     value: 'VOLUNTEER'     },
  { label: 'Coordinator',   value: 'COORDINATOR'   },
  { label: 'Event Manager', value: 'EVENT_MANAGER' },
  { label: 'System Admin',  value: 'SYSTEM_ADMIN'  },
];

function RoleSwitcher() {
  const { user, login, logout } = useAuth();

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const role = e.target.value as UserRole;
    login({
      id:    user?.id   ?? '00000000-0000-0000-0000-000000000000',
      name:  user?.name ?? 'Dev User',
      role,
      token: `dev-token-${role}`,
    });
  };

  if (!user) {
    return (
      <button
        id="dev-login-btn"
        className="btn btn-primary btn-sm"
        onClick={() =>
          login({ id: '00000000-0000-0000-0000-000000000000', name: 'Dev User', role: 'VOLUNTEER', token: 'dev-token-VOLUNTEER' })
        }
      >
        Dev Sign In
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      {/* Role chip */}
      <div className="dev-role-chip">
        <UserCircle size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        <div style={{ position: 'relative' }}>
          <select
            id="dev-role-switcher"
            className="dev-role-select"
            value={user.role}
            onChange={handleRoleChange}
            aria-label="Switch dev role"
          >
            {ROLE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown
            size={10}
            style={{
              position: 'absolute', right: 0, top: '50%',
              transform: 'translateY(-50%)', pointerEvents: 'none',
              color: 'var(--primary-dark)',
            }}
          />
        </div>
      </div>

      {/* Sign out */}
      <button
        id="dev-logout-btn"
        className="btn btn-ghost btn-sm"
        onClick={logout}
        title="Sign out"
        aria-label="Sign out"
        style={{ padding: '0.35rem' }}
      >
        <LogOut size={14} />
      </button>
    </div>
  );
}

function Navigation() {
  const location  = useLocation();
  const { user }  = useAuth();
  const isActive  = (p: string) => location.pathname === p ? 'active' : '';

  return (
    <nav className="navbar">
      {/* Brand */}
      <Link to="/" className="navbar-brand">
        <Home size={20} />
        <span>VolunteerHub</span>
      </Link>

      {/* Nav links */}
      <div className="navbar-nav">
        <Link to="/" className={`nav-link ${isActive('/')}`}>
          <ClipboardList size={17} />
          <span>Opportunities</span>
        </Link>

        <Link to="/onboarding" className={`nav-link ${isActive('/onboarding')}`}>
          <CheckSquare size={17} />
          <span>Onboarding</span>
        </Link>

        {user && (user.role === 'EVENT_MANAGER' || user.role === 'SYSTEM_ADMIN') && (
          <Link to="/build-event" className={`nav-link ${isActive('/build-event')}`}>
            <Calendar size={17} />
            <span>Event Builder</span>
          </Link>
        )}
      </div>

      {/* Dev role switcher — right-aligned */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          DEV ROLE
        </span>
        <RoleSwitcher />
      </div>
    </nav>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<OpportunityPortal />} />
      <Route
        path="/apply/:opportunityId"
        element={
          <RoleGuard roles={['VOLUNTEER', 'COORDINATOR', 'SYSTEM_ADMIN']}>
            <ApplicationForm />
          </RoleGuard>
        }
      />
      <Route
        path="/onboarding"
        element={
          <RoleGuard roles={['VOLUNTEER', 'COORDINATOR', 'SYSTEM_ADMIN']}>
            <OnboardingChecklist />
          </RoleGuard>
        }
      />
      <Route
        path="/build-event"
        element={
          <RoleGuard roles={['EVENT_MANAGER', 'SYSTEM_ADMIN']}>
            <EventBuilder />
          </RoleGuard>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <div className="app-container">
            <Navigation />
            <main className="main-content">
              <AppRoutes />
            </main>
          </div>
        </Router>
      </ToastProvider>
    </AuthProvider>
  );
}
