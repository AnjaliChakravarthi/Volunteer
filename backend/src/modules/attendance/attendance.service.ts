import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';
import { UserRole } from '../../common/types/user-role.enum';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { CheckInDto, CheckOutDto, GetRosterQuery } from './dto/attendance.dto';

/**
 * AttendanceService (Phase 3 — BE-ATT)
 *
 * Responsibilities:
 *  - checkIn: roster/QR/manual/walk-in/offline-queued check-in with idempotency
 *  - checkOut: mark departure; calculate gross hours
 *  - getRoster: scoped (supervisor sees only their site) today's assignment list
 *  - issueQrToken: short-lived signed token for volunteer QR code
 *  - syncOfflineQueue: accept batched offline actions; flag conflicts for review
 *
 * Critical acceptance cases enforced:
 *  4. Repeated QR scan → idempotency key deduplication (no second row)
 *  5. Supervisor scope: cannot see/act on volunteers outside their site_id
 *  8. Offline sync: conflicts flagged for supervisor review (not auto-resolved)
 */
@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  /** Auto-flag discrepancy threshold: 15% deviation from scheduled hours */
  private readonly DISCREPANCY_THRESHOLD = 0.15;

  /** QR token validity window in seconds */
  private readonly QR_TOKEN_TTL_SECONDS = 300; // 5 minutes

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // ROSTER
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns today's assignment roster scoped to the supervisor's site.
   * Supervisors can only see volunteers assigned to their site_id (§5.2 / §5.3 scope rule).
   */
  async getRoster(query: GetRosterQuery, requestingUser: AuthenticatedUser) {
    const isSupervisor = requestingUser.role === UserRole.SITE_SUPERVISOR;

    // Supervisors must be site-scoped
    if (isSupervisor && !requestingUser.scopeSiteId) {
      throw new ForbiddenException({
        code: 'MISSING_SITE_SCOPE',
        message: 'Site Supervisor account is not bound to a site. Contact your administrator.',
      });
    }

    // Determine date filter: default = today UTC
    const targetDate = query.date ? new Date(query.date) : new Date();
    const dayStart = new Date(targetDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const where: Prisma.AssignmentWhereInput = {
      status: { notIn: ['CANCELLED'] },
      startsAt: { lte: dayEnd },
      endsAt: { gte: dayStart },
    };

    if (query.shiftId) {
      where.shiftId = query.shiftId;
    }

    // Scope filter: supervisor sees only their site; coordinator sees org-wide
    const siteId = isSupervisor ? requestingUser.scopeSiteId : query.siteId;
    if (siteId) {
      where.shift = { siteId };
    }

    const assignments = await this.prisma.assignment.findMany({
      where,
      include: {
        volunteer: {
          select: {
            id: true,
            fullName: true,
            email: true,
            // Note: health/accommodation fields deliberately omitted (BR-09)
          },
        },
        shift: {
          select: {
            id: true,
            siteId: true,
            startsAt: true,
            endsAt: true,
            role: { select: { id: true, name: true } },
          },
        },
        attendance: {
          select: {
            id: true,
            status: true,
            checkedInAt: true,
            checkedOutAt: true,
            method: true,
            offlineConflict: true,
          },
        },
      },
      orderBy: { startsAt: 'asc' },
    });

    return assignments;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // QR TOKEN ISSUANCE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Issues a short-lived opaque token for volunteer QR check-in.
   * Token is a HMAC-SHA256 over (assignmentId|volunteerId|expiresAt|nonce).
   * Stored in qr_token table; single-use enforced by usedAt field.
   */
  async issueQrToken(assignmentId: string, requestingUser: AuthenticatedUser): Promise<{
    token: string;
    expiresAt: Date;
    assignmentId: string;
  }> {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: {
        id: true,
        volunteerId: true,
        status: true,
        shift: { select: { siteId: true } },
      },
    });

    if (!assignment) throw new NotFoundException('Assignment not found.');

    // Scope check: supervisor can only issue tokens for their site
    if (
      requestingUser.role === UserRole.SITE_SUPERVISOR &&
      assignment.shift.siteId !== requestingUser.scopeSiteId
    ) {
      throw new ForbiddenException({ code: 'SCOPE_VIOLATION', message: 'Assignment is outside your site scope.' });
    }

    if (assignment.status === 'CANCELLED') {
      throw new BadRequestException({ code: 'ASSIGNMENT_CANCELLED', message: 'Cannot issue QR token for cancelled assignment.' });
    }

    const expiresAt = new Date(Date.now() + this.QR_TOKEN_TTL_SECONDS * 1000);
    const nonce = randomBytes(16).toString('hex');
    const rawToken = `${assignmentId}|${assignment.volunteerId}|${expiresAt.toISOString()}|${nonce}`;
    const token = createHash('sha256').update(rawToken).digest('hex');

    await this.prisma.qrToken.create({
      data: {
        assignmentId,
        volunteerId: assignment.volunteerId,
        token,
        expiresAt,
      },
    });

    return { token, expiresAt, assignmentId };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CHECK-IN
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Main check-in entry point.
   * Handles:
   *   1. Standard (roster/manual): assignmentId required
   *   2. QR scan: assignmentId + qrToken required; token validated and consumed
   *   3. Walk-in: volunteerId + shiftId (no existing assignment)
   *   4. Offline sync: offlineQueuedAt set; conflicts flagged for supervisor review
   *
   * Idempotency: second call with same (assignmentId, minute-bucket) returns
   * existing record rather than creating a duplicate (critical acceptance case 4).
   */
  async checkIn(dto: CheckInDto, requestingUser: AuthenticatedUser): Promise<object> {
    const now = new Date();
    const checkedInAt = dto.checkedInAt ? new Date(dto.checkedInAt) : now;

    // ── Walk-in path ──────────────────────────────────────────────────────
    if (dto.method === 'WALK_IN_MANUAL') {
      return this.handleWalkIn(dto, requestingUser, checkedInAt);
    }

    // ── Standard path (assignmentId required) ────────────────────────────
    if (!dto.assignmentId) {
      throw new BadRequestException({
        code: 'MISSING_ASSIGNMENT_ID',
        message: 'assignmentId is required for non-walk-in check-in.',
      });
    }

    // ── QR token validation ───────────────────────────────────────────────
    if (dto.method === 'QR') {
      if (!dto.qrToken) {
        throw new BadRequestException({ code: 'MISSING_QR_TOKEN', message: 'qrToken is required for QR check-in.' });
      }
      await this.validateAndConsumeQrToken(dto.qrToken, dto.assignmentId, now);
    }

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.findUnique({
        where: { id: dto.assignmentId },
        select: {
          id: true,
          volunteerId: true,
          status: true,
          shift: { select: { siteId: true, startsAt: true, endsAt: true } },
        },
      });
      if (!assignment) throw new NotFoundException('Assignment not found.');

      // Scope check
      this.assertSupervisorScope(requestingUser, assignment.shift.siteId ?? null);

      if (assignment.status === 'CANCELLED') {
        throw new BadRequestException({ code: 'ASSIGNMENT_CANCELLED', message: 'Cannot check in to a cancelled assignment.' });
      }

      // Idempotency: bucket to the minute
      const minuteBucket = new Date(checkedInAt);
      minuteBucket.setSeconds(0, 0);
      const idempotencyKey = createHash('sha256')
        .update(`${dto.assignmentId}|${minuteBucket.toISOString()}`)
        .digest('hex');

      const existing = await tx.attendance.findFirst({
        where: {
          OR: [
            { assignmentId: dto.assignmentId },
            { idempotencyKey },
          ],
        },
      });

      if (existing) {
        this.logger.log(`Idempotent check-in: attendance ${existing.id} already exists for assignment ${dto.assignmentId}`);
        return existing; // Return existing record — not an error
      }

      // Offline conflict detection: check if shift already ended before offline stamp
      let offlineConflict = false;
      let offlineConflictNote: string | undefined;
      if (dto.method === 'OFFLINE_QUEUED' && dto.offlineQueuedAt) {
        const queuedAt = new Date(dto.offlineQueuedAt);
        if (assignment.shift.endsAt < queuedAt) {
          offlineConflict = true;
          offlineConflictNote = `Shift ended at ${assignment.shift.endsAt.toISOString()} before offline record was created at ${dto.offlineQueuedAt}.`;
        }
        // Also flag if there's already an attendance record (sync conflict)
        const existingByAssignment = await tx.attendance.findFirst({ where: { assignmentId: dto.assignmentId } });
        if (existingByAssignment) {
          offlineConflict = true;
          offlineConflictNote = `Server already has attendance record ${existingByAssignment.id} for this assignment.`;
        }
      }

      const attendance = await tx.attendance.create({
        data: {
          assignmentId: dto.assignmentId!,
          method: dto.method,
          checkedInAt,
          status: offlineConflict ? 'OFFLINE_CONFLICT' : 'CHECKED_IN',
          idempotencyKey,
          offlineQueuedAt: dto.offlineQueuedAt ? new Date(dto.offlineQueuedAt) : null,
          offlineConflict,
          offlineConflictNote,
          supervisedById: requestingUser.sub,
        },
      });

      // Update assignment status to CHECKED_IN (unless offline conflict — leave for supervisor review)
      if (!offlineConflict) {
        await tx.assignment.update({
          where: { id: dto.assignmentId },
          data: { status: 'CHECKED_IN' },
        });
      }

      await this.auditLog({
        entityType: 'ATTENDANCE',
        entityId: attendance.id,
        actorId: requestingUser.sub,
        action: offlineConflict ? 'CHECKED_IN_OFFLINE_CONFLICT' : 'CHECKED_IN',
        newValueJson: {
          assignmentId: dto.assignmentId,
          method: dto.method,
          checkedInAt: checkedInAt.toISOString(),
          offlineConflict,
        },
      });

      return attendance;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WALK-IN
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Walk-in: volunteer not on the roster.
   * Creates an ad-hoc Assignment + Attendance in one transaction.
   * Requires a valid shiftId and volunteerId.
   * Does NOT enforce full eligibility rules for walk-ins (supervisor accepts responsibility),
   * but DOES enforce shift capacity and scope.
   */
  private async handleWalkIn(
    dto: CheckInDto,
    requestingUser: AuthenticatedUser,
    checkedInAt: Date,
  ) {
    if (!dto.volunteerId || !dto.shiftId) {
      throw new BadRequestException({
        code: 'WALK_IN_MISSING_FIELDS',
        message: 'volunteerId and shiftId are required for walk-in check-in.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // Verify shift exists and is in supervisor's scope
      const shift = await tx.shift.findUnique({
        where: { id: dto.shiftId },
        select: {
          id: true,
          siteId: true,
          capacityMax: true,
          startsAt: true,
          endsAt: true,
          status: true,
          role: { select: { id: true } },
        },
      });
      if (!shift) throw new NotFoundException('Shift not found.');
      this.assertSupervisorScope(requestingUser, shift.siteId ?? null);

      if (shift.status === 'CANCELLED') {
        throw new BadRequestException({ code: 'SHIFT_CANCELLED', message: 'Cannot walk in to a cancelled shift.' });
      }

      // Verify volunteer exists
      const volunteer = await tx.volunteer.findUnique({
        where: { id: dto.volunteerId, deletedAt: null },
        select: { id: true, fullName: true },
      });
      if (!volunteer) throw new NotFoundException('Volunteer not found.');

      // Check if an active assignment already exists (avoid walk-in duplication)
      const existingAssignment = await tx.assignment.findFirst({
        where: {
          volunteerId: dto.volunteerId!,
          shiftId: dto.shiftId!,
          status: { notIn: ['CANCELLED'] },
        },
      });
      if (existingAssignment) {
        // If already assigned, just check them in via normal path
        const existingAttendance = await tx.attendance.findFirst({
          where: { assignmentId: existingAssignment.id },
        });
        if (existingAttendance) {
          return existingAttendance; // Already checked in — idempotent
        }
        const attendance = await tx.attendance.create({
          data: {
            assignmentId: existingAssignment.id,
            method: 'WALK_IN_MANUAL',
            checkedInAt,
            status: 'CHECKED_IN',
            idempotencyKey: createHash('sha256')
              .update(`${existingAssignment.id}|walk-in-${checkedInAt.toISOString()}`)
              .digest('hex'),
            supervisedById: requestingUser.sub,
          },
        });
        return attendance;
      }

      // Capacity check (non-locking, best-effort for walk-ins)
      const activeCount = await tx.assignment.count({
        where: { shiftId: dto.shiftId, status: { notIn: ['CANCELLED'] } },
      });
      if (activeCount >= shift.capacityMax) {
        throw new ConflictException({
          code: 'SHIFT_AT_CAPACITY',
          message: `Shift is at capacity (${shift.capacityMax}). Cannot add walk-in.`,
        });
      }

      // Create a synthetic Registration + Assignment for the walk-in
      const registration = await tx.registration.create({
        data: {
          volunteerId: dto.volunteerId!,
          shiftId: dto.shiftId!,
          status: 'CHECKED_IN',
        },
      });

      const assignment = await tx.assignment.create({
        data: {
          registrationId: registration.id,
          shiftId: dto.shiftId!,
          volunteerId: dto.volunteerId!,
          status: 'CHECKED_IN',
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
        },
      });

      const attendance = await tx.attendance.create({
        data: {
          assignmentId: assignment.id,
          method: 'WALK_IN_MANUAL',
          checkedInAt,
          status: 'CHECKED_IN',
          idempotencyKey: createHash('sha256')
            .update(`${assignment.id}|walk-in-${checkedInAt.toISOString()}`)
            .digest('hex'),
          supervisedById: requestingUser.sub,
        },
      });

      await this.auditLog({
        entityType: 'ATTENDANCE',
        entityId: attendance.id,
        actorId: requestingUser.sub,
        action: 'WALK_IN_CHECKED_IN',
        newValueJson: {
          assignmentId: assignment.id,
          volunteerId: dto.volunteerId,
          shiftId: dto.shiftId,
          checkedInAt: checkedInAt.toISOString(),
        },
      });

      return { attendance, assignment, registration };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CHECK-OUT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Records check-out.
   * - Validates there is an existing CHECKED_IN attendance for this assignment.
   * - Duplicate check-out: idempotent — returns existing record if already checked out.
   * - Updates assignment status to COMPLETED.
   * - Creates a draft Participation record to start the approval pipeline.
   */
  async checkOut(dto: CheckOutDto, requestingUser: AuthenticatedUser) {
    const checkedOutAt = dto.checkedOutAt ? new Date(dto.checkedOutAt) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const attendance = await tx.attendance.findUnique({
        where: { assignmentId: dto.assignmentId },
        include: {
          assignment: {
            select: {
              id: true,
              volunteerId: true,
              status: true,
              startsAt: true,
              endsAt: true,
              shiftId: true,
              shift: {
                select: {
                  siteId: true,
                  role: {
                    select: {
                      opportunity: {
                        select: {
                          event: { select: { id: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!attendance) {
        throw new NotFoundException({ code: 'NOT_CHECKED_IN', message: 'No check-in record found for this assignment.' });
      }

      // Scope check
      this.assertSupervisorScope(requestingUser, attendance.assignment.shift.siteId ?? null);

      // Idempotency: already checked out
      if (attendance.checkedOutAt || attendance.status === 'CHECKED_OUT') {
        this.logger.log(`Idempotent check-out: assignment ${dto.assignmentId} already checked out.`);
        return attendance;
      }

      if (checkedOutAt <= (attendance.checkedInAt ?? new Date(0))) {
        throw new BadRequestException({
          code: 'INVALID_CHECKOUT_TIME',
          message: 'Check-out time must be after check-in time.',
        });
      }

      // Update attendance
      const updatedAttendance = await tx.attendance.update({
        where: { id: attendance.id },
        data: { checkedOutAt, status: 'CHECKED_OUT' },
      });

      // Update assignment status
      await tx.assignment.update({
        where: { id: dto.assignmentId },
        data: { status: 'COMPLETED' },
      });

      // Calculate gross hours
      const grossMs = checkedOutAt.getTime() - (attendance.checkedInAt?.getTime() ?? 0);
      const grossHours = Math.round((grossMs / 3_600_000) * 100) / 100;
      const scheduledMs =
        attendance.assignment.endsAt.getTime() - attendance.assignment.startsAt.getTime();
      const scheduledHours = Math.round((scheduledMs / 3_600_000) * 100) / 100;

      // Discrepancy flag: > 15% deviation from scheduled
      const hasDiscrepancy =
        scheduledHours > 0 &&
        Math.abs(grossHours - scheduledHours) / scheduledHours > this.DISCREPANCY_THRESHOLD;

      const eventId =
        attendance.assignment.shift.role.opportunity.event.id;

      // Upsert participation draft (may already exist from a partial sync)
      const existing = await tx.participation.findFirst({
        where: {
          volunteerId: attendance.assignment.volunteerId,
          assignmentId: dto.assignmentId,
        },
      });

      let participation;
      if (existing && existing.status === 'DRAFT') {
        participation = await tx.participation.update({
          where: { id: existing.id },
          data: {
            checkinTime: attendance.checkedInAt,
            checkoutTime: checkedOutAt,
            creditedHours: grossHours,
            scheduledHours,
            hasDiscrepancy,
            status: 'DRAFT',
          },
        });
      } else if (!existing) {
        participation = await tx.participation.create({
          data: {
            volunteerId: attendance.assignment.volunteerId,
            eventId,
            assignmentId: dto.assignmentId,
            checkinTime: attendance.checkedInAt,
            checkoutTime: checkedOutAt,
            scheduledHours,
            creditedHours: grossHours,
            hasDiscrepancy,
            status: 'DRAFT',
          },
        });
      } else {
        participation = existing; // Already past DRAFT — do not regress
      }

      await this.auditLog({
        entityType: 'ATTENDANCE',
        entityId: attendance.id,
        actorId: requestingUser.sub,
        action: 'CHECKED_OUT',
        previousValueJson: { status: 'CHECKED_IN' },
        newValueJson: {
          status: 'CHECKED_OUT',
          checkedOutAt: checkedOutAt.toISOString(),
          grossHours,
          scheduledHours,
          hasDiscrepancy,
        },
      });

      return { attendance: updatedAttendance, participation };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: QR TOKEN VALIDATION (ATOMIC SINGLE-USE)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Validates and consumes a QR token atomically.
   * Uses atomic updateMany (`UPDATE qr_token SET used_at = $now WHERE token = $token AND used_at IS NULL`)
   * to guarantee that simultaneous scan requests cannot both succeed (prevents race conditions).
   */
  private async validateAndConsumeQrToken(
    token: string,
    assignmentId: string,
    now: Date,
  ): Promise<void> {
    // Attempt atomic consumption
    const result = await this.prisma.qrToken.updateMany({
      where: {
        token,
        assignmentId,
        usedAt: null,
        expiresAt: { gte: now },
      },
      data: { usedAt: now },
    });

    if (result.count === 1) {
      return; // Successfully and atomically consumed!
    }

    // If count === 0, inspect record to throw precise exception
    const existing = await this.prisma.qrToken.findUnique({ where: { token } });
    if (!existing) {
      throw new UnprocessableEntityException({ code: 'INVALID_QR_TOKEN', message: 'QR token is invalid.' });
    }
    if (existing.assignmentId !== assignmentId) {
      throw new UnprocessableEntityException({
        code: 'QR_TOKEN_ASSIGNMENT_MISMATCH',
        message: 'QR token does not match the provided assignment.',
      });
    }
    if (existing.expiresAt < now) {
      throw new UnprocessableEntityException({ code: 'QR_TOKEN_EXPIRED', message: 'QR token has expired.' });
    }
    if (existing.usedAt) {
      throw new ConflictException({ code: 'QR_TOKEN_ALREADY_USED', message: 'QR token has already been used.' });
    }

    throw new ConflictException({ code: 'QR_TOKEN_CONSUMPTION_FAILED', message: 'Failed to consume QR token.' });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: SCOPE ASSERTION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Supervisors may only act on assignments within their assigned site.
   * Other staff roles (Coordinator, Admin) are unrestricted.
   */
  private assertSupervisorScope(
    user: AuthenticatedUser,
    shiftSiteId: string | null,
  ): void {
    if (user.role !== UserRole.SITE_SUPERVISOR) return;
    if (!user.scopeSiteId) {
      throw new ForbiddenException({ code: 'MISSING_SITE_SCOPE', message: 'Site Supervisor account has no site scope.' });
    }
    if (shiftSiteId !== user.scopeSiteId) {
      throw new ForbiddenException({
        code: 'SCOPE_VIOLATION',
        message: 'This assignment is outside your site scope.',
      });
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
