import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../types/user-role.enum';
import { AuthenticatedUser } from '../types/jwt-payload.interface';

/**
 * RBAC guard — enforces role-based access control (§5.2).
 * Must be applied AFTER JwtAuthGuard (request.user must already be set).
 *
 * Scope enforcement (site_id, org_id) is NOT done here — it is enforced
 * inside service/repository layers where DB queries are constructed,
 * preventing bypass via direct API calls (§5.3 — scope bypass threat).
 *
 * Usage: @Roles(UserRole.COORDINATOR, UserRole.SYSTEM_ADMIN)
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no @Roles() decorator, allow any authenticated user
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Access denied.');
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(
        'You do not have permission to perform this action.',
      );
    }

    return true;
  }
}
