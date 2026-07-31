import { Test, TestingModule } from '@nestjs/testing';
import { SchedulingService } from '../scheduling.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthenticatedUser } from '../../../common/types/jwt-payload.interface';
import { UserRole } from '../../../common/types/user-role.enum';
import { ConflictException } from '@nestjs/common';

describe('SchedulingService (Capacity & Overlap)', () => {
  let service: SchedulingService;
  let prisma: PrismaService;

  beforeEach(async () => {
    // Mock PrismaService for unit testing
    // Note: Concurrency lock tests (FOR UPDATE) are best tested in integration tests
    // with a real DB. This unit test mocks the transaction and the repository layers.
    const mockPrisma = {
      $transaction: jest.fn(),
      shift: { findUnique: jest.fn() },
      role: { findUnique: jest.fn() },
      volunteer: { findUnique: jest.fn() },
      registration: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn() },
      assignment: { findFirst: jest.fn(), create: jest.fn() },
      auditLog: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SchedulingService>(SchedulingService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerForShift', () => {
    const mockUser: AuthenticatedUser = {
      sub: 'vol-1',
      email: 'test@example.com',
      role: UserRole.VOLUNTEER,
      orgId: 'org-1',
      scopeSiteId: null,
      mfaVerified: true,
      mfaEnabled: true,
      type: 'access',
    };

    it('should throw ConflictException if volunteer has overlapping assignment', async () => {
      // Mock the transaction implementation
      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const mockTx = {
          $queryRaw: jest.fn().mockResolvedValue([{
            id: 'shift-1',
            capacity_max: 10,
            starts_at: new Date('2026-08-01T10:00:00Z'),
            ends_at: new Date('2026-08-01T14:00:00Z'),
            status: 'PUBLISHED',
            role_id: 'role-1',
          }]),
          role: { findUnique: jest.fn().mockResolvedValue({ eligibilityRulesJson: null }) },
          shift: { findUnique: jest.fn().mockResolvedValue({ eligibilityRulesJson: null }) },
          volunteer: { findUnique: jest.fn().mockResolvedValue({ dateOfBirth: null, credentials: [] }) },
          registration: {
            findFirst: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(5),
          },
          assignment: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'assign-1',
              shiftId: 'shift-overlap',
              startsAt: new Date('2026-08-01T12:00:00Z'),
              endsAt: new Date('2026-08-01T16:00:00Z'),
            }),
          },
        };
        return callback(mockTx);
      });

      await expect(service.registerForShift('vol-1', 'shift-1', mockUser))
        .rejects.toThrow(ConflictException);
    });
  });
});
