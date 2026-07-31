/**
 * scheduling.service.eligibility.spec.ts
 *
 * Tests for Critical Acceptance Case 1: 
 * "A volunteer cannot register for a role without required credentials."
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { SchedulingService } from '../scheduling.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { UserRole } from '../../../common/types/user-role.enum';

describe('SchedulingService — Eligibility rules (Critical Acceptance Case 1)', () => {
  let service: SchedulingService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    // Create a mock Prisma transaction client
    const mockTx = {
      role: { findUnique: jest.fn() },
      shift: { findUnique: jest.fn() },
      volunteer: { findUnique: jest.fn() },
      registration: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn() },
      assignment: { findFirst: jest.fn(), create: jest.fn() },
      $queryRaw: jest.fn(),
    };

    const mockPrisma = {
      $transaction: jest.fn((callback) => callback(mockTx)),
      auditLog: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SchedulingService>(SchedulingService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    
    // We mock $transaction to inject our mockTx and spy on what happens inside
    prisma.$transaction.mockImplementation(async (callback: any, options: any) => {
      // If it's the raw query for locking, return a mock shift row
      mockTx.$queryRaw.mockResolvedValue([
        {
          id: 'shift-1',
          capacity_max: 10,
          starts_at: new Date('2027-04-15T09:00:00Z'),
          ends_at: new Date('2027-04-15T12:00:00Z'),
          status: 'PUBLISHED',
          eligibility_rules_json: { requiredCredentialTypes: ['BACKGROUND_CHECK'] },
          role_id: 'role-1'
        }
      ]);

      mockTx.role.findUnique.mockResolvedValue({ eligibilityRulesJson: null });
      mockTx.shift.findUnique.mockResolvedValue({ eligibilityRulesJson: { requiredCredentialTypes: ['BACKGROUND_CHECK'] } });
      
      return callback(mockTx);
    });
  });

  it('rejects registration if volunteer lacks required credentials (Case 1)', async () => {
    // Mock volunteer with no credentials
    const mockTx = await (prisma.$transaction as jest.Mock).mock.results[0]?.value;
    
    // In our test setup, $transaction executes immediately, but we need to intercept the inner calls
    // Let's redefine it specifically for this test
    prisma.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{
          id: 'shift-1', capacity_max: 10, starts_at: new Date('2027-04-15'), ends_at: new Date('2027-04-15'), status: 'PUBLISHED', role_id: 'role-1'
        }]),
        role: { findUnique: jest.fn().mockResolvedValue({ eligibilityRulesJson: null }) },
        shift: { findUnique: jest.fn().mockResolvedValue({ eligibilityRulesJson: { requiredCredentialTypes: ['BACKGROUND_CHECK'] } }) },
        volunteer: { findUnique: jest.fn().mockResolvedValue({
          id: 'vol-1', 
          dateOfBirth: null,
          credentials: [] // NO CREDENTIALS
        }) },
      };
      return callback(tx);
    });

    await expect(
      service.registerForShift('vol-1', 'shift-1', { sub: 'vol-1', role: UserRole.VOLUNTEER } as any)
    ).rejects.toThrow(UnprocessableEntityException);

    await expect(
      service.registerForShift('vol-1', 'shift-1', { sub: 'vol-1', role: UserRole.VOLUNTEER } as any)
    ).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({ code: 'ELIGIBILITY_NOT_MET' })
    });
  });

  it('rejects registration if credential exists but is not APPROVED', async () => {
    prisma.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{
          id: 'shift-1', capacity_max: 10, starts_at: new Date('2027-04-15'), ends_at: new Date('2027-04-15'), status: 'PUBLISHED', role_id: 'role-1'
        }]),
        role: { findUnique: jest.fn().mockResolvedValue(null) },
        shift: { findUnique: jest.fn().mockResolvedValue({ eligibilityRulesJson: { requiredCredentialTypes: ['BACKGROUND_CHECK'] } }) },
        volunteer: { findUnique: jest.fn().mockResolvedValue({
          id: 'vol-1', 
          dateOfBirth: null,
          credentials: [{ type: 'BACKGROUND_CHECK', status: 'PENDING' }] // Not approved
        }) },
      };
      return callback(tx);
    });

    await expect(
      service.registerForShift('vol-1', 'shift-1', { sub: 'vol-1', role: UserRole.VOLUNTEER } as any)
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('allows registration if volunteer has APPROVED required credentials', async () => {
    let createRegistrationCalled = false;
    
    prisma.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{
          id: 'shift-1', capacity_max: 10, starts_at: new Date('2027-04-15'), ends_at: new Date('2027-04-15'), status: 'PUBLISHED', role_id: 'role-1'
        }]),
        role: { findUnique: jest.fn().mockResolvedValue(null) },
        shift: { findUnique: jest.fn().mockResolvedValue({ eligibilityRulesJson: { requiredCredentialTypes: ['BACKGROUND_CHECK'] } }) },
        volunteer: { findUnique: jest.fn().mockResolvedValue({
          id: 'vol-1', 
          dateOfBirth: null,
          credentials: [{ type: 'BACKGROUND_CHECK', status: 'APPROVED' }] // APPROVED
        }) },
        registration: { 
          findFirst: jest.fn().mockResolvedValue(null),
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockImplementation(() => {
            createRegistrationCalled = true;
            return { id: 'reg-1' };
          })
        },
        assignment: { 
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn()
        }
      };
      return callback(tx);
    });

    // We also need to mock the service's private auditLog and assertNoOverlap methods 
    // or provide the mocked tx behavior they need
    // Since assertNoOverlap uses tx.assignment.findFirst, our mock covers it.
    // The class uses this.logger, and this.auditLog (which isn't fully mocked here unless we spy on it).
    // Let's spy on auditLog
    jest.spyOn(service as any, 'auditLog').mockResolvedValue(undefined);

    const result = await service.registerForShift('vol-1', 'shift-1', { sub: 'vol-1', role: UserRole.VOLUNTEER } as any);
    
    expect(createRegistrationCalled).toBe(true);
    expect(result).toBeDefined();
    expect(result.waitlisted).toBe(false);
  });
});
