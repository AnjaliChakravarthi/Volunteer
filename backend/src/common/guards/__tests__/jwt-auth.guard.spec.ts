import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../jwt-auth.guard';

describe('JwtAuthGuard (Security check)', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  it('allows dev-token when NODE_ENV is development', () => {
    process.env.NODE_ENV = 'development';

    const mockRequest = {
      headers: {
        authorization: 'Bearer dev-token-VOLUNTEER',
      },
      user: null,
    };

    const mockContext = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;

    const result = guard.canActivate(mockContext);
    expect(result).toBe(true);
    expect(mockRequest.user).toEqual({
      sub: '00000000-0000-0000-0000-000000000000',
      email: 'dev@example.com',
      role: 'VOLUNTEER',
      mfaEnabled: false,
      mfaVerified: true,
    });
  });

  it('REJECTS dev-token with 401 Unauthorized when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';

    const mockRequest = {
      headers: {
        authorization: 'Bearer dev-token-EVENT_MANAGER',
      },
      user: null,
    };

    const mockContext = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;

    // Spy on super.canActivate to simulate passport's behavior when given a fake non-JWT token in production
    const superCanActivateSpy = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockImplementation(() => {
        // Real passport JWT strategy throws 401 Unauthorized for invalid/fake tokens like "dev-token-EVENT_MANAGER"
        throw new UnauthorizedException('Unauthorized');
      });

    // 1. Assert that invoking canActivate throws UnauthorizedException (401)
    expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException);
    
    // 2. Explicitly prove that super.canActivate WAS called (meaning dev-bypass did NOT grant access early)
    expect(superCanActivateSpy).toHaveBeenCalledWith(mockContext);

    // 3. Explicitly prove that request.user was NOT populated by the dev-bypass
    expect(mockRequest.user).toBeNull();
  });
});
