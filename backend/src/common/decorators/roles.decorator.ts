import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../types/user-role.enum';

export const ROLES_KEY = 'roles';

/**
 * Decorator that specifies which roles are allowed to access a route.
 * Used by RolesGuard. If multiple roles are passed, any one is sufficient.
 * Usage: @Roles(UserRole.COORDINATOR, UserRole.SYSTEM_ADMIN)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
