import { UserRole } from './user-role.enum';

/**
 * Shape of the JWT access token payload.
 * Attached to every request by JwtStrategy after verification.
 */
export interface JwtPayload {
  /** Volunteer's immutable UUID (sub = subject, per JWT spec) */
  sub: string;
  /** Email — carried for convenience, auth decisions use sub */
  email: string;
  /** Role used for RBAC checks */
  role: UserRole;
  /** Org the volunteer belongs to */
  orgId: string;
  /**
   * Scope binding — null for most roles; non-null for SITE_SUPERVISOR
   * (scoped to one site_id) and potentially GROUP_LEADER in future.
   */
  scopeSiteId: string | null;
  /** Whether the user has completed MFA for this session */
  mfaVerified: boolean;
  /** Whether the user has MFA enabled */
  mfaEnabled: boolean;
  /** Token type — access tokens only; refresh tokens are not JWTs */
  type: 'access';
}

/**
 * Authenticated user object attached to request.user after JWT strategy runs.
 */
export type AuthenticatedUser = JwtPayload;
