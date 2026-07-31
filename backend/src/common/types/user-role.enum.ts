// UserRole enum — mirrors Prisma schema enum.
// Duplicated here to avoid importing Prisma types into non-data layers.
export enum UserRole {
  VOLUNTEER = 'VOLUNTEER',
  GROUP_LEADER = 'GROUP_LEADER',
  GUARDIAN = 'GUARDIAN',
  COORDINATOR = 'COORDINATOR',
  EVENT_MANAGER = 'EVENT_MANAGER',
  SITE_SUPERVISOR = 'SITE_SUPERVISOR',
  COMMUNICATIONS_TEAM = 'COMMUNICATIONS_TEAM',
  LEADERSHIP = 'LEADERSHIP',
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  AUDITOR = 'AUDITOR',
}

// Roles that require MFA (§5.1)
export const MFA_REQUIRED_ROLES = new Set<UserRole>([
  UserRole.COORDINATOR,
  UserRole.EVENT_MANAGER,
  UserRole.SITE_SUPERVISOR,
  UserRole.COMMUNICATIONS_TEAM,
  UserRole.LEADERSHIP,
  UserRole.SYSTEM_ADMIN,
  UserRole.AUDITOR,
]);

// Roles that have staff-level access (internal users)
export const STAFF_ROLES = new Set<UserRole>([
  UserRole.COORDINATOR,
  UserRole.EVENT_MANAGER,
  UserRole.SITE_SUPERVISOR,
  UserRole.COMMUNICATIONS_TEAM,
  UserRole.LEADERSHIP,
  UserRole.SYSTEM_ADMIN,
  UserRole.AUDITOR,
]);
