import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Logger,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from '../../common/types/jwt-payload.interface';
import { UserRole } from '../../common/types/user-role.enum';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

/**
 * Token pair returned on successful authentication.
 * access_token: short-lived JWT (15 min).
 * refresh_token: opaque random token (7 days); stored as Argon2 hash in DB.
 */
export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: 'Bearer';
}

/**
 * Intermediate result when password auth succeeds but MFA is still required.
 * The pending_token is a short-lived JWT that carries the user identity but
 * has mfaVerified=false and a 5-minute expiry.
 */
export interface MfaPendingResult {
  requires_mfa: true;
  pending_token: string;
}

type AuthResult = TokenPair | MfaPendingResult;

/**
 * Core authentication service (SEC-001).
 * Responsibilities:
 *  - Volunteer registration with duplicate detection
 *  - Password login with progressive lockout defence (via DB timestamp, not in-memory)
 *  - JWT access token issuance (15 min, HS256)
 *  - Rotating refresh token issuance (opaque random UUID, Argon2-hashed in DB)
 *  - MFA setup (TOTP via otplib) and verification
 *  - Token refresh and logout
 *  - Password change
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // REGISTRATION
  // ─────────────────────────────────────────────────────────────────────────

  async register(dto: RegisterDto, orgId: string): Promise<{ id: string; email: string }> {
    // Check for existing account (email is already lowercased by DTO transform)
    const existing = await this.prisma.volunteer.findFirst({
      where: {
        email: dto.email,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'An account with this email already exists.',
      });
    }

    // Verify org exists
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    });
    if (!org) {
      throw new BadRequestException({
        code: 'INVALID_ORGANIZATION',
        message: 'Organization not found.',
      });
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64MB
      timeCost: 3,
      parallelism: 4,
    });

    const volunteer = await this.prisma.volunteer.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        orgId,
        status: 'ACTIVE',
        role: 'VOLUNTEER',
      },
      select: { id: true, email: true },
    });

    // Emit audit log for registration (actor = self, common pattern for self-service actions)
    await this.emitAuditLog({
      entityType: 'VOLUNTEER',
      entityId: volunteer.id,
      actorId: volunteer.id,
      action: 'REGISTERED',
      newValueJson: { email: volunteer.email },
    });

    this.logger.log(`Volunteer registered: id=${volunteer.id}`);
    return volunteer;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<AuthResult> {
    const volunteer = await this.prisma.volunteer.findFirst({
      where: { email, deletedAt: null },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        status: true,
        role: true,
        orgId: true,
        scopeSiteId: true,
        mfaEnabled: true,
        mfaSecret: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });

    // Check lockout before any password work (fail fast, still constant-time for non-existent accounts)
    if (volunteer?.lockedUntil && volunteer.lockedUntil > new Date()) {
      throw new HttpException(
        {
          code: 'ACCOUNT_LOCKED',
          message: 'Account is temporarily locked due to too many failed login attempts. Try again later.',
          locked_until: volunteer.lockedUntil.toISOString(),
        },
        423, // 423 Locked
      );
    }

    // Constant-time: always verify a hash to prevent timing-based user enumeration
    const dummyHash =
      '$argon2id$v=19$m=65536,t=3,p=4$dummysalt0000000000000$dummyhash000000000000000000000000000000000';
    const passwordValid = volunteer
      ? await argon2.verify(volunteer.passwordHash, password)
      : await argon2.verify(dummyHash, 'dummy').catch(() => false);

    if (!volunteer || !passwordValid) {
      // Increment failed attempt counter; lock on 5th consecutive failure
      if (volunteer) {
        const attempts = (volunteer.failedLoginAttempts ?? 0) + 1;
        const shouldLock = attempts >= 5;
        await this.prisma.volunteer.update({
          where: { id: volunteer.id },
          data: {
            failedLoginAttempts: attempts,
            ...(shouldLock ? { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) } : {}),
          },
        });
        this.logger.warn(
          `Failed login attempt ${attempts} for id=${volunteer.id}${
            shouldLock ? ' — account locked for 15 minutes' : ''
          }`,
        );
      }
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.',
      });
    }

    if (volunteer.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: 'ACCOUNT_INACTIVE',
        message: 'Your account is not active. Please contact support.',
      });
    }

    // Successful auth — reset lockout counters
    await this.prisma.volunteer.update({
      where: { id: volunteer.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    this.logger.log(`Login: id=${volunteer.id} role=${volunteer.role}`);

    // If MFA is enabled, issue a pending token requiring TOTP verification
    if (volunteer.mfaEnabled) {
      const pendingToken = this.jwtService.sign(
        {
          sub: volunteer.id,
          email: volunteer.email,
          role: volunteer.role as UserRole,
          orgId: volunteer.orgId,
          scopeSiteId: volunteer.scopeSiteId,
          mfaVerified: false,
          mfaEnabled: true,
          type: 'access',
        } satisfies JwtPayload,
        { expiresIn: '5m' }, // short window for MFA challenge
      );
      return { requires_mfa: true, pending_token: pendingToken };
    }

    return this.issueTokenPair(volunteer);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MFA SETUP
  // ─────────────────────────────────────────────────────────────────────────

  async setupMfa(volunteerId: string): Promise<{ otpauth_url: string; qr_data_url: string; secret: string }> {
    const volunteer = await this.prisma.volunteer.findUnique({
      where: { id: volunteerId },
      select: { email: true, mfaEnabled: true },
    });
    if (!volunteer) throw new NotFoundException('Volunteer not found.');
    if (volunteer.mfaEnabled) {
      throw new ConflictException({
        code: 'MFA_ALREADY_ENABLED',
        message: 'MFA is already enabled for this account.',
      });
    }

    const secret = authenticator.generateSecret(32);
    const appName =
      this.config.get<string>('MFA_ISSUER_NAME') ??
      this.config.get<string>('APP_NAME') ??
      this.config.get<string>('MFA_APP_NAME') ??
      'VolunteerPlatform';
    const otpauthUrl = authenticator.keyuri(volunteer.email, appName, secret);

    // Store the secret (not yet active — requires confirmation)
    // In production, encrypt secret at rest using a KMS-derived key
    await this.prisma.volunteer.update({
      where: { id: volunteerId },
      data: { mfaSecret: secret },
    });

    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);
    return { otpauth_url: otpauthUrl, qr_data_url: qrDataUrl, secret };
  }

  async confirmMfaSetup(volunteerId: string, code: string): Promise<void> {
    const volunteer = await this.prisma.volunteer.findUnique({
      where: { id: volunteerId },
      select: { mfaSecret: true, mfaEnabled: true },
    });
    if (!volunteer?.mfaSecret) {
      throw new BadRequestException({
        code: 'MFA_SETUP_NOT_STARTED',
        message: 'MFA setup has not been initiated.',
      });
    }
    if (volunteer.mfaEnabled) {
      throw new ConflictException({ code: 'MFA_ALREADY_ENABLED', message: 'MFA already enabled.' });
    }

    const isValid = authenticator.verify({ token: code, secret: volunteer.mfaSecret });
    if (!isValid) {
      throw new UnauthorizedException({ code: 'INVALID_MFA_CODE', message: 'Invalid or expired TOTP code.' });
    }

    await this.prisma.volunteer.update({
      where: { id: volunteerId },
      data: { mfaEnabled: true },
    });

    await this.emitAuditLog({
      entityType: 'VOLUNTEER',
      entityId: volunteerId,
      actorId: volunteerId,
      action: 'MFA_ENABLED',
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MFA VERIFICATION (completes the two-step login)
  // ─────────────────────────────────────────────────────────────────────────

  async verifyMfa(pendingToken: string, code: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(pendingToken);
    } catch {
      throw new UnauthorizedException({ code: 'INVALID_PENDING_TOKEN', message: 'Invalid or expired pending token.' });
    }

    if (payload.type !== 'access' || payload.mfaVerified) {
      throw new UnauthorizedException({ code: 'INVALID_PENDING_TOKEN', message: 'Invalid pending token.' });
    }

    const volunteer = await this.prisma.volunteer.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        status: true,
        role: true,
        orgId: true,
        scopeSiteId: true,
        mfaEnabled: true,
        mfaSecret: true,
      },
    });

    if (!volunteer?.mfaSecret || !volunteer.mfaEnabled) {
      throw new UnauthorizedException({ code: 'MFA_NOT_CONFIGURED', message: 'MFA not configured.' });
    }

    const isValid = authenticator.verify({ token: code, secret: volunteer.mfaSecret });
    if (!isValid) {
      throw new UnauthorizedException({ code: 'INVALID_MFA_CODE', message: 'Invalid or expired TOTP code.' });
    }

    this.logger.log(`MFA verified: id=${volunteer.id}`);
    return this.issueTokenPair({ ...volunteer, mfaVerified: true });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TOKEN REFRESH
  // ─────────────────────────────────────────────────────────────────────────

  async refreshTokens(volunteerId: string, rawRefreshToken: string): Promise<TokenPair> {
    const volunteer = await this.prisma.volunteer.findUnique({
      where: { id: volunteerId, deletedAt: null },
      select: {
        id: true,
        email: true,
        status: true,
        role: true,
        orgId: true,
        scopeSiteId: true,
        mfaEnabled: true,
        refreshTokenHash: true,
      },
    });

    if (!volunteer?.refreshTokenHash) {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH_TOKEN', message: 'Session expired. Please log in again.' });
    }

    const tokenValid = await argon2.verify(volunteer.refreshTokenHash, rawRefreshToken);
    if (!tokenValid) {
      // Token mismatch — may indicate token theft; invalidate session
      await this.prisma.volunteer.update({
        where: { id: volunteerId },
        data: { refreshTokenHash: null },
      });
      await this.emitAuditLog({
        entityType: 'VOLUNTEER',
        entityId: volunteerId,
        actorId: volunteerId,
        action: 'REFRESH_TOKEN_MISMATCH',
        reason: 'Possible token theft — session invalidated',
      });
      throw new UnauthorizedException({ code: 'INVALID_REFRESH_TOKEN', message: 'Session expired. Please log in again.' });
    }

    return this.issueTokenPair(volunteer);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────────────────────────────────────

  async logout(volunteerId: string): Promise<void> {
    await this.prisma.volunteer.update({
      where: { id: volunteerId },
      data: { refreshTokenHash: null },
    });
    this.logger.log(`Logout: id=${volunteerId}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private async issueTokenPair(volunteer: {
    id: string;
    email: string;
    role: string;
    orgId: string;
    scopeSiteId?: string | null;
    mfaEnabled: boolean;
    mfaVerified?: boolean;
  }): Promise<TokenPair> {
    const accessExpiresIn = this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');
    const expiresInSeconds = this.parseExpiryToSeconds(accessExpiresIn);

    const payload: JwtPayload = {
      sub: volunteer.id,
      email: volunteer.email,
      role: volunteer.role as UserRole,
      orgId: volunteer.orgId,
      scopeSiteId: volunteer.scopeSiteId ?? null,
      mfaVerified: volunteer.mfaVerified ?? !volunteer.mfaEnabled,
      mfaEnabled: volunteer.mfaEnabled,
      type: 'access',
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: accessExpiresIn });

    // Generate opaque refresh token — UUID v4 (cryptographically random)
    const rawRefreshToken = uuidv4() + '-' + uuidv4(); // 72 random chars
    const refreshHash = await argon2.hash(rawRefreshToken, {
      type: argon2.argon2id,
      memoryCost: 19456, // 19MB — lighter for refresh token since it's not auth-critical
      timeCost: 2,
      parallelism: 1,
    });

    await this.prisma.volunteer.update({
      where: { id: volunteer.id },
      data: { refreshTokenHash: refreshHash },
    });

    return {
      access_token: accessToken,
      refresh_token: rawRefreshToken,
      expires_in: expiresInSeconds,
      token_type: 'Bearer',
    };
  }

  private parseExpiryToSeconds(expiry: string): number {
    const match = /^(\d+)([smhd])$/.exec(expiry);
    if (!match) return 900;
    const value = parseInt(match[1]);
    const unit = match[2];
    const multiplier: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * (multiplier[unit] ?? 60);
  }

  private async emitAuditLog(params: {
    entityType: string;
    entityId: string;
    actorId?: string;
    action: string;
    previousValueJson?: Record<string, unknown>;
    newValueJson?: Record<string, unknown>;
    reason?: string;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          entityType: params.entityType,
          entityId: params.entityId,
          actorId: params.actorId,
          action: params.action,
          previousValueJson: params.previousValueJson as Prisma.InputJsonValue,
          newValueJson: params.newValueJson as Prisma.InputJsonValue,
          reason: params.reason,
        },
      });
    } catch (err) {
      // Audit log failures must never crash the main operation (log and continue)
      this.logger.error(`Audit log write failed: ${String(err)}`);
    }
  }
}
