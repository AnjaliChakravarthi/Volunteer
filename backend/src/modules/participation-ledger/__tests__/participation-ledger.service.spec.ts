import { Test, TestingModule } from '@nestjs/testing';
import { ParticipationLedgerService } from '../participation-ledger.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthenticatedUser } from '../../../common/types/jwt-payload.interface';
import { UserRole } from '../../../common/types/user-role.enum';
import { ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';

describe('ParticipationLedgerService (State Machine & BR-05 Audit)', () => {
  let service: ParticipationLedgerService;
  let prisma: PrismaService;

  const mockSupervisor: AuthenticatedUser = {
    sub: 'sup-1',
    email: 'supervisor@example.com',
    role: UserRole.SITE_SUPERVISOR,
    orgId: 'org-1',
    scopeSiteId: 'site-1',
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
      participation: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn(), create: jest.fn() },
      participationAdjustment: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParticipationLedgerService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ParticipationLedgerService>(ParticipationLedgerService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('State Machine Transitions', () => {
    it('should allow Supervisor to advance SUBMITTED to SUPERVISOR_APPROVED', async () => {
      const mockRecord = {
        id: 'part-1',
        status: 'SUBMITTED',
        creditedHours: 8,
        scheduledHours: 8,
      };

      (prisma.participation.findUnique as jest.Mock).mockResolvedValue(mockRecord);
      (prisma.participation.update as jest.Mock).mockResolvedValue({ ...mockRecord, status: 'SUPERVISOR_APPROVED' });

      const res = await service.approveParticipation(
        'part-1',
        { action: 'SUPERVISOR_APPROVE' },
        mockSupervisor,
      );

      expect(res.status).toBe('SUPERVISOR_APPROVED');
    });

    it('should prevent Supervisor from calling FINALIZE (requires Coordinator)', async () => {
      const mockRecord = { id: 'part-2', status: 'SUPERVISOR_APPROVED' };
      (prisma.participation.findUnique as jest.Mock).mockResolvedValue(mockRecord);

      await expect(
        service.approveParticipation('part-2', { action: 'FINALIZE' }, mockSupervisor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException when attempting invalid transition (e.g. SUBMITTED directly to LOCKED)', async () => {
      const mockRecord = { id: 'part-3', status: 'SUBMITTED' };
      (prisma.participation.findUnique as jest.Mock).mockResolvedValue(mockRecord);

      await expect(
        service.approveParticipation('part-3', { action: 'LOCK' }, mockCoordinator),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('BR-05: Post-FINALIZED Adjustment Entries', () => {
    it('should create an append-only adjustment row and update creditedHours without silent overwrite', async () => {
      const mockFinalizedRecord = {
        id: 'part-finalized',
        status: 'FINALIZED',
        creditedHours: 5.0,
        scheduledHours: 8.0,
        breakMinutes: 0,
        certifiesEligible: true,
      };

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const mockTx = {
          participation: {
            findUnique: jest.fn().mockResolvedValue(mockFinalizedRecord),
            update: jest.fn().mockResolvedValue({ ...mockFinalizedRecord, creditedHours: 7.0 }),
          },
          participationAdjustment: {
            create: jest.fn().mockResolvedValue({
              id: 'adj-1',
              participationId: 'part-finalized',
              deltaHours: 2.0,
              reason: 'Coordinator verified late check-in was system issue',
              previousSnapshotJson: { creditedHours: 5.0 },
              newSnapshotJson: { creditedHours: 7.0 },
              actorId: mockCoordinator.sub,
            }),
          },
          auditLog: { create: jest.fn() },
        };
        return callback(mockTx);
      });

      const result = await service.adjustParticipation(
        'part-finalized',
        { deltaHours: 2.0, reason: 'Coordinator verified late check-in was system issue' },
        mockCoordinator,
      );

      expect(result.participation.creditedHours).toBe(7.0);
      expect(result.adjustment.deltaHours).toBe(2.0);
      expect(result.adjustment.reason).toContain('Coordinator verified');
    });

    it('should reject adjustment on non-finalized record (must use approve endpoint)', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const mockTx = {
          participation: {
            findUnique: jest.fn().mockResolvedValue({ id: 'part-draft', status: 'SUBMITTED' }),
          },
        };
        return callback(mockTx);
      });

      await expect(
        service.adjustParticipation(
          'part-draft',
          { deltaHours: 1.0, reason: 'Test' },
          mockCoordinator,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
