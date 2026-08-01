import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService } from '../attendance.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthenticatedUser } from '../../../common/types/jwt-payload.interface';
import { UserRole } from '../../../common/types/user-role.enum';
import { ConflictException, ForbiddenException, BadRequestException, UnprocessableEntityException } from '@nestjs/common';

describe('AttendanceService (Concurrency, Idempotency & Scope)', () => {
  let service: AttendanceService;
  let prisma: PrismaService;

  const mockSupervisor: AuthenticatedUser = {
    sub: 'sup-1',
    email: 'supervisor@example.com',
    role: UserRole.SITE_SUPERVISOR,
    orgId: 'org-1',
    scopeSiteId: 'site-alpha',
    mfaVerified: true,
    mfaEnabled: true,
    type: 'access',
  };

  const mockCoordinator: AuthenticatedUser = {
    sub: 'coord-1',
    email: 'coordinator@example.com',
    role: UserRole.COORDINATOR,
    orgId: 'org-1',
    scopeSiteId: null,
    mfaVerified: true,
    mfaEnabled: true,
    type: 'access',
  };

  beforeEach(async () => {
    const mockPrisma = {
      $transaction: jest.fn(),
      assignment: { findUnique: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), count: jest.fn() },
      attendance: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      participation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      registration: { create: jest.fn() },
      shift: { findUnique: jest.fn() },
      volunteer: { findUnique: jest.fn() },
      qrToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Check-in Idempotency (Critical Case 4)', () => {
    it('should return existing attendance record on duplicate check-in call (idempotent)', async () => {
      const mockAssignment = {
        id: 'assign-100',
        volunteerId: 'vol-1',
        status: 'ASSIGNED',
        shift: { siteId: 'site-alpha', startsAt: new Date('2026-08-01T09:00:00Z'), endsAt: new Date('2026-08-01T17:00:00Z') },
      };

      const existingAttendance = {
        id: 'att-100',
        assignmentId: 'assign-100',
        method: 'MANUAL',
        checkedInAt: new Date('2026-08-01T09:05:00Z'),
        status: 'CHECKED_IN',
        idempotencyKey: 'hash-key-1',
      };

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const mockTx = {
          assignment: { findUnique: jest.fn().mockResolvedValue(mockAssignment) },
          attendance: { findFirst: jest.fn().mockResolvedValue(existingAttendance) },
          auditLog: { create: jest.fn() },
        };
        return callback(mockTx);
      });

      const result = await service.checkIn({ assignmentId: 'assign-100', method: 'MANUAL' }, mockSupervisor);

      expect(result).toEqual(existingAttendance);
    });
  });

  describe('Supervisor Scope Guarding (Critical Case 5)', () => {
    it('should throw ForbiddenException if shift is outside supervisor site scope', async () => {
      const mockAssignmentOtherSite = {
        id: 'assign-200',
        volunteerId: 'vol-2',
        status: 'ASSIGNED',
        shift: { siteId: 'site-beta', startsAt: new Date(), endsAt: new Date() }, // Different site!
      };

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const mockTx = {
          assignment: { findUnique: jest.fn().mockResolvedValue(mockAssignmentOtherSite) },
        };
        return callback(mockTx);
      });

      await expect(
        service.checkIn({ assignmentId: 'assign-200', method: 'MANUAL' }, mockSupervisor),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Duplicate Check-out Idempotency', () => {
    it('should return existing record without error on repeated check-out', async () => {
      const mockAttendanceCheckedOut = {
        id: 'att-300',
        assignmentId: 'assign-300',
        checkedInAt: new Date('2026-08-01T09:00:00Z'),
        checkedOutAt: new Date('2026-08-01T17:00:00Z'),
        status: 'CHECKED_OUT',
        assignment: {
          id: 'assign-300',
          volunteerId: 'vol-3',
          startsAt: new Date('2026-08-01T09:00:00Z'),
          endsAt: new Date('2026-08-01T17:00:00Z'),
          shift: { siteId: 'site-alpha', role: { opportunity: { event: { id: 'evt-1' } } } },
        },
      };

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const mockTx = {
          attendance: { findUnique: jest.fn().mockResolvedValue(mockAttendanceCheckedOut) },
        };
        return callback(mockTx);
      });

      const result = await service.checkOut({ assignmentId: 'assign-300' }, mockSupervisor);
      expect(result).toEqual(mockAttendanceCheckedOut);
    });
  });

  describe('QR Token Expiry & Reuse Prevention (Atomic Concurrency)', () => {
    it('should throw ConflictException if QR token has already been used', async () => {
      const expiredOrUsedToken = {
        id: 'qr-1',
        assignmentId: 'assign-400',
        token: 'used-token-hash',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: new Date(), // Already used!
      };

      (prisma.qrToken.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.qrToken.findUnique as jest.Mock).mockResolvedValue(expiredOrUsedToken);

      await expect(
        service.checkIn({ assignmentId: 'assign-400', method: 'QR', qrToken: 'used-token-hash' }, mockSupervisor),
      ).rejects.toThrow(ConflictException);
    });

    it('should safely reject 1 of 2 simultaneous parallel check-in attempts using the same QR token (Promise.all)', async () => {
      const mockAssignment = {
        id: 'assign-parallel',
        volunteerId: 'vol-parallel',
        status: 'ASSIGNED',
        shift: { siteId: 'site-alpha', startsAt: new Date('2026-08-01T09:00:00Z'), endsAt: new Date('2026-08-01T17:00:00Z') },
      };

      // Mock updateMany to succeed ONCE (count=1), then fail (count=0) for second caller
      let callCount = 0;
      (prisma.qrToken.updateMany as jest.Mock).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return { count: 1 };
        return { count: 0 };
      });
      (prisma.qrToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'qr-parallel',
        assignmentId: 'assign-parallel',
        token: 'token-parallel',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: new Date(),
      });

      // Mock transaction execution for checkIn
      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const mockTx = {
          assignment: {
            findUnique: jest.fn().mockResolvedValue(mockAssignment),
            update: jest.fn().mockResolvedValue({ ...mockAssignment, status: 'CHECKED_IN' }),
          },
          attendance: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'att-parallel', ...data })),
          },
          auditLog: { create: jest.fn() },
        };
        return callback(mockTx);
      });

      // Fire 2 SIMULTANEOUS parallel requests
      const results = await Promise.allSettled([
        service.checkIn({ assignmentId: 'assign-parallel', method: 'QR', qrToken: 'token-parallel' }, mockSupervisor),
        service.checkIn({ assignmentId: 'assign-parallel', method: 'QR', qrToken: 'token-parallel' }, mockSupervisor),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      if (rejected.length > 0 && fulfilled.length === 0) {
        // Debug helper if error occurred
        const errors = rejected.map((r: any) => r.reason);
        throw new Error(`Both rejected unexpectedly: ${JSON.stringify(errors)}`);
      }

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    });
  });

  describe('Offline Conflict Flagging', () => {
    it('should flag offlineConflict=true when offline check-in is submitted after shift endsAt', async () => {
      const shiftEnded = new Date('2026-08-01T12:00:00Z');
      const mockAssignment = {
        id: 'assign-500',
        volunteerId: 'vol-5',
        status: 'ASSIGNED',
        shift: { siteId: 'site-alpha', startsAt: new Date('2026-08-01T08:00:00Z'), endsAt: shiftEnded },
      };

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const mockTx = {
          assignment: { findUnique: jest.fn().mockResolvedValue(mockAssignment) },
          attendance: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'att-offline-1', ...data })),
          },
          auditLog: { create: jest.fn() },
        };
        return callback(mockTx);
      });

      const res = await service.checkIn(
        {
          assignmentId: 'assign-500',
          method: 'OFFLINE_QUEUED',
          offlineQueuedAt: '2026-08-01T13:00:00Z', // 1 hour after shift ended!
        },
        mockSupervisor,
      );

      expect((res as any).offlineConflict).toBe(true);
      expect((res as any).status).toBe('OFFLINE_CONFLICT');
    });
  });

  describe('Walk-in Check-in Path', () => {
    it('should create a synthetic Registration + Assignment + Attendance record for unlisted walk-in', async () => {
      const mockShift = {
        id: 'shift-walkin',
        siteId: 'site-alpha',
        capacityMax: 20,
        startsAt: new Date('2026-08-01T09:00:00Z'),
        endsAt: new Date('2026-08-01T17:00:00Z'),
        status: 'PUBLISHED',
        role: { id: 'role-1' },
      };
      const mockVolunteer = { id: 'vol-walkin', fullName: 'Jordan Lee' };

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const mockTx = {
          shift: { findUnique: jest.fn().mockResolvedValue(mockShift) },
          volunteer: { findUnique: jest.fn().mockResolvedValue(mockVolunteer) },
          assignment: {
            findFirst: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(5),
            create: jest.fn().mockResolvedValue({ id: 'assign-walkin-1', status: 'CHECKED_IN' }),
          },
          registration: { create: jest.fn().mockResolvedValue({ id: 'reg-walkin-1' }) },
          attendance: { create: jest.fn().mockResolvedValue({ id: 'att-walkin-1', method: 'WALK_IN_MANUAL', status: 'CHECKED_IN' }) },
          auditLog: { create: jest.fn() },
        };
        return callback(mockTx);
      });

      const res = await service.checkIn(
        { method: 'WALK_IN_MANUAL', volunteerId: 'vol-walkin', shiftId: 'shift-walkin' },
        mockSupervisor,
      );

      expect(res).toHaveProperty('attendance');
      expect(res).toHaveProperty('assignment');
      expect(res).toHaveProperty('registration');
    });
  });
});
