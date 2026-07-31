import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../types/jwt-payload.interface';
import { MFA_REQUIRED_ROLES } from '../types/user-role.enum';

/**
 * Global JWT authentication guard.
 *  - Skips auth for @Public() routes.
 *  - Validates JWT access token via JwtStrategy.
 *  - Enforces MFA verification for roles that require it (§5.1).
 *    If mfaEnabled=true but mfaVerified=false on the token, the request
 *    is rejected with 401 so the client must complete the MFA challenge.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // DEV BYPASS: Allow 'dev-token-{ROLE}' in development to fake sessions
    if (process.env.NODE_ENV === 'development') {
      const request = context.switchToHttp().getRequest();
      const authHeader = request.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer dev-token-')) {
        const role = authHeader.replace('Bearer dev-token-', '');
        request.user = {
          sub: '00000000-0000-0000-0000-000000000000',
          email: 'dev@example.com',
          role: role as any,
          mfaEnabled: false,
          mfaVerified: true,
        };
        return true;
      }
    }

    return super.canActivate(context);
  }

  handleRequest<T extends JwtPayload>(
    err: Error | null,
    user: T | false,
    _info: unknown,
    _context: ExecutionContext,
  ): T {
    if (err || !user) {
      throw err ?? new UnauthorizedException('Invalid or expired token.');
    }

    // MFA enforcement: if role requires MFA, user.mfaEnabled=true,
    // but this token was issued before MFA verification, block the request.
    if (
      MFA_REQUIRED_ROLES.has(user.role) &&
      user.mfaEnabled &&
      !user.mfaVerified
    ) {
      throw new UnauthorizedException('MFA verification required.');
    }

    return user;
  }
}
