import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MfaVerifyDto, MfaSetupConfirmDto } from './dto/mfa.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CORRELATION_ID_HEADER } from '../../common/middleware/correlation-id.middleware';

const REFRESH_TOKEN_COOKIE = 'refresh_token';

/**
 * Auth controller — §3.4 API table:
 *  POST /api/v1/auth/register
 *  POST /api/v1/auth/login
 *  POST /api/v1/auth/mfa/verify
 *  POST /api/v1/auth/mfa/setup
 *  POST /api/v1/auth/mfa/confirm
 *  POST /api/v1/auth/refresh
 *  POST /api/v1/auth/logout
 *
 * Refresh tokens are delivered as httpOnly, Secure, SameSite=Strict cookies (§5.1).
 */
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    const orgId = this.config.getOrThrow<string>('DEFAULT_ORG_ID');
    const result = await this.authService.register(dto, orgId);
    return { data: result };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto.email, dto.password);

    if ('requires_mfa' in result) {
      return { data: { requires_mfa: true, pending_token: result.pending_token } };
    }

    this.setRefreshCookie(res, result.refresh_token);
    return {
      data: {
        access_token: result.access_token,
        expires_in: result.expires_in,
        token_type: result.token_type,
      },
    };
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  async verifyMfa(
    @Body() dto: MfaVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyMfa(dto.pendingToken, dto.code);
    this.setRefreshCookie(res, result.refresh_token);
    return {
      data: {
        access_token: result.access_token,
        expires_in: result.expires_in,
        token_type: result.token_type,
      },
    };
  }

  @Get('mfa/setup')
  async setupMfa(@CurrentUser('sub') userId: string) {
    const result = await this.authService.setupMfa(userId);
    return { data: result };
  }

  @Post('mfa/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmMfa(
    @CurrentUser('sub') userId: string,
    @Body() dto: MfaSetupConfirmDto,
  ) {
    await this.authService.confirmMfaSetup(userId, dto.code);
    return { data: { message: 'MFA has been enabled successfully.' } };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Try cookie first, fall back to body (for native clients)
    const cookieToken = (req.cookies as Record<string, string>)?.[REFRESH_TOKEN_COOKIE];
    const bodyToken = (req.body as { refreshToken?: string }).refreshToken;
    const rawToken = cookieToken ?? bodyToken;

    if (!rawToken) {
      return res.status(HttpStatus.UNAUTHORIZED).json({
        error: {
          code: 'REFRESH_TOKEN_MISSING',
          message: 'No refresh token provided.',
          correlation_id: req.headers[CORRELATION_ID_HEADER],
        },
      });
    }

    // Volunteer ID must come from body or a short-lived indicator since this endpoint is @Public
    // Using the pending structure: client sends { volunteer_id, refresh_token }
    const volunteerId = (req.body as { volunteerId?: string }).volunteerId;
    if (!volunteerId) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: { code: 'VOLUNTEER_ID_REQUIRED', message: 'volunteerId is required.', correlation_id: req.headers[CORRELATION_ID_HEADER] },
      });
    }

    const result = await this.authService.refreshTokens(volunteerId, rawToken);
    this.setRefreshCookie(res, result.refresh_token);
    return {
      data: {
        access_token: result.access_token,
        expires_in: result.expires_in,
        token_type: result.token_type,
      },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser('sub') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(userId);
    res.clearCookie(REFRESH_TOKEN_COOKIE);
    return { data: { message: 'Logged out successfully.' } };
  }

  // ─────────────────────────────────────────────────────────────────────────

  private setRefreshCookie(res: Response, token: string): void {
    const secure = this.config.get<string>('COOKIE_SECURE') !== 'false';
    res.cookie(REFRESH_TOKEN_COOKIE, token, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
      path: '/api/v1/auth/refresh',
    });
  }
}
