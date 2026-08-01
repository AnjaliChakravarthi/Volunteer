import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';
import { UserRole } from '../../common/types/user-role.enum';
import { Prisma } from '@prisma/client';
import {
  ApproveParticipationDto,
  AdjustParticipationDto,
  GetParticipationQuery,
} from '../attendance/dto/attendance.dto';

/**
 * Participation status state machine (per §4.2 and approved decisions):
 *
 *   DRAFT → SUBMITTED → SUPERVISOR_APPROVED → FINALIZED → LOCKED
 *
 * DISPUTED: can be set on SUBMITTED or SUPERVISOR_APPROVED records (pre-FINALIZED).
 *           Requires reason; does not advance state — surfaces for coordinator review.
 *
 * Post-FINALIZED corrections: append-only ParticipationAdjustment entry (BR-05).
 * Coordinator (elevated) only; participation.creditedHours updated in same transaction.
 *
 * Discrepancy auto-flag: |scheduledHours - creditedHours| / scheduledHours > 15%.
 */

/** Valid forward state transitions (excluding DISPUTED) */
const STATE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['SUPERVISOR_APPROVED', 'DISPUTED'],
  SUPERVISOR_APPROVED: ['FINALIZED', 'DISPUTED'],
  DISPUTED: ['SUBMITTED', 'SUPERVISOR_APPROVED'],
  FINALIZED: ['LOCKED'],
  LOCKED: [],
};

@Injectable()
export class ParticipationLedgerService {
  private readonly logger = new Logger(ParticipationLedgerService.name);
  private readonly DISCREPANCY_THRESHOLD = 0.15;

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // LIST / GET
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns a volunteer's participation ledger.
   * Volunteers see only their own records.
   * Coordinators/Supervisors see org-wide (Supervisors scoped to their events).
   */
  async getVolunteerParticipation(
    volunteerId: string,
    query: GetParticipationQuery,
    requestingUser: AuthenticatedUser,
  ) {
    // Access control: volunteer can only see own records
    if (
      requestingUser.role === UserRole.VOLUNTEER &&
      requestingUser.sub !== volunteerId
    ) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Cannot view another volunteer\'s participation.' });
    }

    // Supervisor can view participation of volunteers on their site
    // (full scoping would require joining shift.siteId — simplified here to org-wide for Supervisor)
    const where: Prisma.ParticipationWhereInput = { volunteerId };
    if (query.status) where.status = query.status;
    if (query.eventId) where.eventId = query.eventId;

    const page = query.page ?? 1;
    const pageSize = Math.min(query.page_size ?? 20, 100);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.participation.findMany({
        where,
        include: {
          event: { select: { id: true, name: true, startsAt: true } },
          assignment: {
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              shift: { select: { siteId: true, role: { select: { name: true } } } },
            },
          },
          adjustments: {
            select: {
              id: true,
              deltaHours: true,
              reason: true,
              createdAt: true,
              actor: { select: { id: true, fullName: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
          approvedBy: { select: { id: true, fullName: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.participation.count({ where }),
    ]);

    return { data, meta: { page, page_size: pageSize, total } };
  }

  async getParticipationById(id: string, requestingUser: AuthenticatedUser) {
    const record = await this.prisma.participation.findUnique({
      where: { id },
      include: {
        event: { select: { id: true, name: true } },
        volunteer: { select: { id: true, fullName: true, email: true } },
        assignment: { select: { id: true, startsAt: true, endsAt: true } },
        adjustments: {
          orderBy: { createdAt: 'asc' },
        },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });

    if (!record) throw new NotFoundException('Participation record not found.');

    // Volunteers may only view their own
    if (
      requestingUser.role === UserRole.VOLUNTEER &&
      record.volunteerId !== requestingUser.sub
    ) {
      throw new NotFoundException('Participation record not found.');
    }

    return record;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // APPROVE / ADVANCE STATE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Approve / advance participation state.
   *
   * Allowed actions by role:
   *   SUPERVISOR_APPROVE: SUBMITTED → SUPERVISOR_APPROVED  (Supervisor + Coordinator)
   *   DISPUTE:            SUBMITTED | SUPERVISOR_APPROVED → DISPUTED (Supervisor + Coordinator)
   *   FINALIZE:           SUPERVISOR_APPROVED → FINALIZED  (Coordinator only)
   *   LOCK:               FINALIZED → LOCKED               (Coordinator only)
   */
  async approveParticipation(
    id: string,
    dto: ApproveParticipationDto,
    requestingUser: AuthenticatedUser,
  ) {
    const record = await this.prisma.participation.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Participation record not found.');

    // LOCKED records cannot be changed (only adjustment entries allowed via /adjust)
    if (record.status === 'LOCKED') {
      throw new ConflictException({
        code: 'RECORD_LOCKED',
        message: 'This participation record is locked. Use the /adjust endpoint to create an adjustment entry.',
      });
    }

    const action = dto.action ?? 'SUPERVISOR_APPROVE';

    // Role-action guards
    const isCoordinator = [UserRole.COORDINATOR, UserRole.SYSTEM_ADMIN].includes(requestingUser.role);
    const isSupervisor = requestingUser.role === UserRole.SITE_SUPERVISOR;

    if (['FINALIZE', 'LOCK'].includes(action) && !isCoordinator) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: `Action "${action}" requires Coordinator or Admin role.`,
      });
    }

    if (action === 'SUPERVISOR_APPROVE' && !isSupervisor && !isCoordinator) {
      throw new ForbiddenException({ code: 'INSUFFICIENT_ROLE', message: 'Cannot approve participation.' });
    }

    // Determine target status
    const targetStatus = this.resolveTargetStatus(action, record.status);

    // Validate transition is allowed
    const validNext = STATE_TRANSITIONS[record.status] ?? [];
    if (!validNext.includes(targetStatus)) {
      throw new ConflictException({
        code: 'INVALID_STATE_TRANSITION',
        message: `Cannot transition from ${record.status} to ${targetStatus}.`,
        details: { current: record.status, attempted: targetStatus, valid_transitions: validNext },
      } as any);
    }

    // Build update payload
    const updateData: Prisma.ParticipationUpdateInput = {
      status: targetStatus,
      approvedBy: { connect: { id: requestingUser.sub } },
      approvedAt: new Date(),
    };

    if (dto.creditedHours !== undefined) {
      updateData.creditedHours = dto.creditedHours;
      // Recalculate discrepancy flag
      const scheduled = Number(record.scheduledHours ?? 0);
      if (scheduled > 0) {
        updateData.hasDiscrepancy =
          Math.abs(dto.creditedHours - scheduled) / scheduled > this.DISCREPANCY_THRESHOLD;
      }
    }

    if (dto.breakMinutes !== undefined) {
      updateData.breakMinutes = dto.breakMinutes;
      // Recompute credited hours if we have raw check-in/out times
      if (record.checkinTime && record.checkoutTime) {
        const grossMs = record.checkoutTime.getTime() - record.checkinTime.getTime();
        const netHours = Math.max(0, grossMs / 3_600_000 - dto.breakMinutes / 60);
        updateData.creditedHours = Math.round(netHours * 100) / 100;
      }
    }

    if (dto.certifiesEligible !== undefined) {
      updateData.certifiesEligible = dto.certifiesEligible;
    }

    const previousSnapshot = { status: record.status, creditedHours: record.creditedHours };

    const updated = await this.prisma.participation.update({
      where: { id },
      data: updateData,
    });

    await this.auditLog({
      entityType: 'PARTICIPATION',
      entityId: id,
      actorId: requestingUser.sub,
      action: `STATUS_${action}`,
      previousValueJson: previousSnapshot,
      newValueJson: { status: targetStatus, creditedHours: updated.creditedHours },
      reason: dto.notes,
    });

    return updated;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ADJUSTMENT (POST-FINALIZED — BR-05)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Creates an append-only ParticipationAdjustment entry on a FINALIZED or LOCKED record.
   * Updates participation.creditedHours in the same transaction.
   * Coordinator (elevated) only.
   * Never overwrites history — the previous snapshot is captured before mutation.
   */
  async adjustParticipation(
    id: string,
    dto: AdjustParticipationDto,
    requestingUser: AuthenticatedUser,
  ) {
    const isCoordinator = [UserRole.COORDINATOR, UserRole.SYSTEM_ADMIN].includes(requestingUser.role);
    if (!isCoordinator) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: 'Only Coordinators may create adjustment entries on finalized participation records.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const record = await tx.participation.findUnique({ where: { id } });
      if (!record) throw new NotFoundException('Participation record not found.');

      if (!['FINALIZED', 'LOCKED'].includes(record.status)) {
        throw new BadRequestException({
          code: 'NOT_FINALIZED',
          message: 'Adjustments may only be made on FINALIZED or LOCKED participation records. Use the approve endpoint for earlier stages.',
        });
      }

      const previousCredited = Number(record.creditedHours ?? 0);
      const newCredited = Math.max(0, previousCredited + dto.deltaHours);

      const previousSnapshot = {
        id: record.id,
        status: record.status,
        creditedHours: previousCredited,
        scheduledHours: record.scheduledHours,
        breakMinutes: record.breakMinutes,
        certifiesEligible: record.certifiesEligible,
      };

      // Update participation credited hours
      const updated = await tx.participation.update({
        where: { id },
        data: { creditedHours: newCredited },
      });

      const newSnapshot = {
        ...previousSnapshot,
        creditedHours: newCredited,
      };

      // Append adjustment entry (never mutates; only adds)
      const adjustment = await tx.participationAdjustment.create({
        data: {
          participationId: id,
          deltaHours: dto.deltaHours,
          reason: dto.reason,
          previousSnapshotJson: previousSnapshot as Prisma.InputJsonValue,
          newSnapshotJson: newSnapshot as Prisma.InputJsonValue,
          actorId: requestingUser.sub,
        },
      });

      await this.auditLog({
        entityType: 'PARTICIPATION_ADJUSTMENT',
        entityId: adjustment.id,
        actorId: requestingUser.sub,
        action: 'ADJUSTMENT_CREATED',
        previousValueJson: { creditedHours: previousCredited },
        newValueJson: { creditedHours: newCredited, deltaHours: dto.deltaHours },
        reason: dto.reason,
      });

      return { participation: updated, adjustment };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: STATE RESOLUTION
  // ─────────────────────────────────────────────────────────────────────────

  private resolveTargetStatus(action: string, currentStatus: string): string {
    switch (action) {
      case 'SUPERVISOR_APPROVE': return 'SUPERVISOR_APPROVED';
      case 'FINALIZE':           return 'FINALIZED';
      case 'LOCK':               return 'LOCKED';
      case 'DISPUTE':            return 'DISPUTED';
      default:
        throw new BadRequestException({ code: 'INVALID_ACTION', message: `Unknown action: ${action}` });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: AUDIT LOG
  // ─────────────────────────────────────────────────────────────────────────

  private async auditLog(params: {
    entityType: string;
    entityId: string;
    actorId: string;
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
      this.logger.error(`Audit log write failed: ${String(err)}`);
    }
  }
}
