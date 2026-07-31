/**
 * auth.service.lockout.spec.ts
 *
 * Unit tests for progressive login lockout (SEC-001):
 *   - 5 consecutive bad passwords locks the account
 *   - 6th attempt (even with correct password) returns 423 LOCKED while locked
 *   - After lockedUntil passes, login succeeds again
 *
 * Uses Jest fake timers to fast-forward past the 15-minute window; no real DB
 * or sleep required.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import * as argon2 from 'argon2';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal volunteer DB record with lockout fields. */
function makeVolunteer(overrides: Partial<{
  id: string;
  email: string;
  passwordHash: string;
  status: string;
  role: string;
  orgId: string;
  scopeSiteId: string | null;
  mfaEnabled: boolean;
  mfaSecret: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}> = {}) {
  return {
    id: 'vol-uuid-1',
    email: 'alice@example.com',
    passwordHash: 'PLACEHOLDER', // will be replaced with real hash per test
    status: 'ACTIVE',
    role: 'VOLUNTEER',
    orgId: 'org-uuid-1',
    scopeSiteId: null,
    mfaEnabled: false,
    mfaSecret: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    ...overrides,
  };
}

const CORRECT_PASSWORD = 'correct-password-123';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AuthService — progressive login lockout', () => {
  let service: AuthService;
  let prisma: jest.Mocked<PrismaService>;

  // Shared mutable volunteer state so tests can mutate it across calls
  let volunteerState: ReturnType<typeof makeVolunteer>;
  // Real argon2 hash of the correct password (computed once in beforeAll)
  let correctHash: string;

  beforeAll(async () => {
    correctHash = await argon2.hash(CORRECT_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  });

  beforeEach(async () => {
    // Reset volunteer state
    volunteerState = makeVolunteer({ passwordHash: correctHash });

    // Build a mock PrismaService where findFirst returns volunteerState
    // and update mutates volunteerState in place (simulating a real DB)
    const mockPrisma = {
      volunteer: {
        findFirst: jest.fn().mockImplementation(() =>
          Promise.resolve({ ...volunteerState }),
        ),
        update: jest.fn().mockImplementation(({ data }: { data: Partial<typeof volunteerState> }) => {
          Object.assign(volunteerState, data);
          return Promise.resolve(volunteerState);
        }),
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      organization: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-access-token'),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultVal?: unknown) => {
              const map: Record<string, unknown> = {
                JWT_ACCESS_EXPIRES_IN: '15m',
              };
              return map[key] ?? defaultVal;
            }),
            getOrThrow: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Each wrong password increments failedLoginAttempts
  // ─────────────────────────────────────────────────────────────────────────

  it('increments failedLoginAttempts on each bad password (attempts 1–4)', async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      await expect(
        service.login(volunteerState.email, 'wrong-password'),
      ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });

      expect(volunteerState.failedLoginAttempts).toBe(attempt);
      expect(volunteerState.lockedUntil).toBeNull();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: 5th failure locks the account for 15 minutes
  // ─────────────────────────────────────────────────────────────────────────

  it('locks account after 5th consecutive failure', async () => {
    const beforeLock = Date.now();

    for (let i = 0; i < 5; i++) {
      await expect(
        service.login(volunteerState.email, 'wrong-password'),
      ).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
    }

    expect(volunteerState.failedLoginAttempts).toBe(5);
    expect(volunteerState.lockedUntil).not.toBeNull();

    const lockDurationMs = volunteerState.lockedUntil!.getTime() - beforeLock;
    // Should be ~15 minutes (allow ±5 s for test overhead)
    expect(lockDurationMs).toBeGreaterThanOrEqual(14 * 60 * 1000 + 55_000);
    expect(lockDurationMs).toBeLessThanOrEqual(15 * 60 * 1000 + 5_000);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: 6th attempt (correct password) still returns 423 while locked
  // ─────────────────────────────────────────────────────────────────────────

  it('returns 423 Locked on 6th attempt even with correct password', async () => {
    // Drive 5 failures to engage lock
    for (let i = 0; i < 5; i++) {
      await expect(
        service.login(volunteerState.email, 'wrong-password'),
      ).rejects.toBeDefined();
    }
    expect(volunteerState.lockedUntil).not.toBeNull();

    // 6th attempt with CORRECT password — must still be rejected with 423
    let caughtError: unknown;
    try {
      await service.login(volunteerState.email, CORRECT_PASSWORD);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError).toBeInstanceOf(HttpException);
    expect((caughtError as HttpException).getStatus()).toBe(423); // 423 Locked
    expect((caughtError as HttpException).getResponse()).toMatchObject({
      code: 'ACCOUNT_LOCKED',
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: After lockedUntil passes, login succeeds and counters reset
  // ─────────────────────────────────────────────────────────────────────────

  it('allows login again after lockedUntil passes (fast-forwarded via test hook)', async () => {
    jest.useFakeTimers();

    try {
      // Drive 5 failures to engage lock
      for (let i = 0; i < 5; i++) {
        await expect(
          service.login(volunteerState.email, 'wrong-password'),
        ).rejects.toBeDefined();
      }
      expect(volunteerState.lockedUntil).not.toBeNull();

      // Fast-forward 16 minutes — past the 15-minute lock window
      jest.setSystemTime(new Date(Date.now() + 16 * 60 * 1000));

      // Mock findFirst to reflect the still-locked DB state (lockedUntil is in the past NOW)
      // The service will compare lockedUntil > new Date(), which should be false
      (prisma.volunteer.findFirst as jest.Mock).mockResolvedValue({ ...volunteerState });

      // Login with correct password should now succeed
      const result = await service.login(volunteerState.email, CORRECT_PASSWORD);

      // Should return a token pair (not MFA pending)
      expect(result).toHaveProperty('access_token');

      // failedLoginAttempts should be reset to 0
      expect(volunteerState.failedLoginAttempts).toBe(0);
      // lockedUntil should be reset to null
      expect(volunteerState.lockedUntil).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
