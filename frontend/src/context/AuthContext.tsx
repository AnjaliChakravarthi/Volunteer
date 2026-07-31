/**
 * AuthContext — lightweight auth state for the frontend.
 * In Phase 3 this will be replaced by the real login flow from §7 of the master plan.
 * For Phase 2, it reads a dev token + role from localStorage so that role-based
 * route guards can function without a full login UI.
 *
 * Shape stored in localStorage:
 *   access_token : string   — JWT from POST /auth/login
 *   user_role    : UserRole — e.g. "VOLUNTEER", "COORDINATOR", "EVENT_MANAGER"
 *   user_id      : string   — volunteer UUID
 *   user_name    : string   — display name
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

export type UserRole =
  | 'VOLUNTEER'
  | 'GROUP_LEADER'
  | 'GUARDIAN'
  | 'COORDINATOR'
  | 'EVENT_MANAGER'
  | 'SITE_SUPERVISOR'
  | 'COMMUNICATIONS_TEAM'
  | 'LEADERSHIP'
  | 'SYSTEM_ADMIN'
  | 'AUDITOR';

export interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
  token: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => void;
  hasRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadFromStorage(): AuthUser | null {
  try {
    const token = localStorage.getItem('access_token');
    const role = localStorage.getItem('user_role') as UserRole | null;
    const id = localStorage.getItem('user_id');
    const name = localStorage.getItem('user_name');
    if (token && role && id && name) return { token, role, id, name };
  } catch {
    /* ignore */
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadFromStorage);

  const login = useCallback((u: AuthUser) => {
    localStorage.setItem('access_token', u.token);
    localStorage.setItem('user_role', u.role);
    localStorage.setItem('user_id', u.id);
    localStorage.setItem('user_name', u.name);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.clear();
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (...roles: UserRole[]) => !!user && roles.includes(user.role),
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
