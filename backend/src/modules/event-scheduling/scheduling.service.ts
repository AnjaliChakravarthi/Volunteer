import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  BadRequestException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';
import { UserRole } from '../../common/types/user-role.enum';
import { Prisma } from '@prisma/client';

// Shape of the eligibility_rules_json stored on role/shift
interface EligibilityRules {
  minAge?: number;
  maxAge?: number;
  requiredCredentialTypes?: string[];
  requiredCredentialIds?: string[];
}

/**
 * SchedulingService (BE-002 + BE-003):
 *   - Event / Opportunity / Role / Shift CRUD with capacity management
 *   - Registration with transactional capacity check + overlap prevention
 *   - Eligibility enforcement (BR-03, BR-11)
 *   - Waitlist management
 *   - Assignment creation
 */
@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // BE-002a: EVENT CRUD
  // ─────────────────────────────────────────────────────────────────────────

  async createEvent(dto: {
    programId: string;
    name: string;
    description?: string;
    startsAt: string;
    endsAt: string;
    timezone?: string;
  }, actorId: string) {
    if (new Date(dto.endsAt) <= new Date(dto.startsAt)) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'endsAt must be after startsAt.',
      });
    }
    const program = await this.prisma.program.findUnique({
      where: { id: dto.programId },
      select: { id: true },
    });
    if (!program) throw new NotFoundException('Program not found.');

    const event = await this.prisma.event.create({
      data: {
        programId: dto.programId,
        name: dto.name,
        description: dto.description,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        timezone: dto.timezone ?? 'UTC',
        createdByVolunteerId: actorId,
      },
    });

    await this.auditLog({
      entityType: 'EVENT', entityId: event.id,
      actorId, action: 'CREATED',
      newValueJson: { name: event.name, status: event.status },
    });

    return event;
  }

  async getEvent(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        program: { select: { id: true, name: true } },
        opportunities: {
          include: {
            roles: { include: { shifts: true } },
          },
        },
      },
    });
    if (!event) throw new NotFoundException('Event not found.');
    return event;
  }

  async listEvents(params: {
    programId?: string;
    status?: string;
    page: number;
    page_size: number;
  }) {
    const where: Prisma.EventWhereInput = {};
    if (params.programId) where.programId = params.programId;
    if (params.status) where.status = params.status as 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';

    const [data, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        include: { program: { select: { id: true, name: true } } },
        skip: (params.page - 1) * params.page_size,
        take: params.page_size,
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.event.count({ where }),
    ]);
    return { data, meta: { page: params.page, page_size: params.page_size, total } };
  }

  async updateEvent(id: string, dto: Partial<{
    name: string; description: string; startsAt: string;
    endsAt: string; timezone: string; status: string;
  }>, actorId: string) {
    const existing = await this.prisma.event.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!existing) throw new NotFoundException('Event not found.');

    const data: Prisma.EventUpdateInput = {};
    if (dto.name) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.startsAt) data.startsAt = new Date(dto.startsAt);
    if (dto.endsAt) data.endsAt = new Date(dto.endsAt);
    if (dto.timezone) data.timezone = dto.timezone;
    if (dto.status) data.status = dto.status as 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';

    const updated = await this.prisma.event.update({ where: { id }, data });

    await this.auditLog({
      entityType: 'EVENT', entityId: id, actorId, action: 'UPDATED',
      previousValueJson: { status: existing.status },
      newValueJson: { status: updated.status },
    });

    return updated;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BE-002b: OPPORTUNITY CRUD
  // ─────────────────────────────────────────────────────────────────────────

  async createOpportunity(eventId: string, dto: {
    name: string; description?: string; location?: string; siteId?: string;
  }, _actorId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) throw new NotFoundException('Event not found.');

    return this.prisma.opportunity.create({
      data: { eventId, ...dto },
    });
  }

  async getOpportunity(id: string) {
    const opp = await this.prisma.opportunity.findUnique({
      where: { id },
      include: { roles: { include: { shifts: true } }, event: { select: { id: true, name: true } } },
    });
    if (!opp) throw new NotFoundException('Opportunity not found.');
    return opp;
  }

  async listOpportunities(params: { eventId?: string; status?: string }) {
    const where: Prisma.OpportunityWhereInput = {};
    if (params.eventId) where.eventId = params.eventId;
    if (params.status) where.status = params.status as any;

    const data = await this.prisma.opportunity.findMany({
      where,
      include: {
        event: { select: { name: true, startsAt: true } },
        roles: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return data;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BE-002c: ROLE CRUD
  // ─────────────────────────────────────────────────────────────────────────

  async createRole(opportunityId: string, dto: {
    name: string; description?: string; eligibilityRules?: EligibilityRules;
  }, _actorId: string) {
    const opp = await this.prisma.opportunity.findUnique({ where: { id: opportunityId }, select: { id: true } });
    if (!opp) throw new NotFoundException('Opportunity not found.');

    return this.prisma.role.create({
      data: {
        opportunityId,
        name: dto.name,
        description: dto.description,
        eligibilityRulesJson: dto.eligibilityRules
          ? (dto.eligibilityRules as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BE-002d: SHIFT CRUD
  // ─────────────────────────────────────────────────────────────────────────

  async createShift(roleId: string, dto: {
    siteId?: string; capacityMin: number; capacityMax: number;
    startsAt: string; endsAt: string; timezone?: string;
    eligibilityRules?: EligibilityRules;
  }, _actorId: string) {
    if (dto.capacityMin > dto.capacityMax) {
      throw new BadRequestException({ code: 'INVALID_CAPACITY', message: 'capacityMin cannot exceed capacityMax.' });
    }
    if (new Date(dto.endsAt) <= new Date(dto.startsAt)) {
      throw new BadRequestException({ code: 'INVALID_DATE_RANGE', message: 'endsAt must be after startsAt.' });
    }

    const role = await this.prisma.role.findUnique({ where: { id: roleId }, select: { id: true } });
    if (!role) throw new NotFoundException('Role not found.');

    return this.prisma.shift.create({
      data: {
        roleId,
        siteId: dto.siteId,
        capacityMin: dto.capacityMin,
        capacityMax: dto.capacityMax,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        timezone: dto.timezone ?? 'UTC',
        eligibilityRulesJson: dto.eligibilityRules
          ? (dto.eligibilityRules as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }

  async getShift(id: string) {
    const shift = await this.prisma.shift.findUnique({
      where: { id },
      include: {
        role: {
          include: {
            opportunity: { select: { id: true, name: true, eventId: true } },
          },
        },
        _count: {
          select: {
            registrations: {
              where: { status: { notIn: ['CANCELLED'] } },
            },
          },
        },
      },
    });
    if (!shift) throw new NotFoundException('Shift not found.');
    return {
      ...shift,
      capacityRemaining: shift.capacityMax - shift._count.registrations,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BE-003: REGISTRATION — transactional capacity + eligibility + overlap
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a volunteer for a shift.
   *
   * Enforces (all inside a single serializable transaction):
   *  1. Eligibility rules from role + shift (BR-03, critical acceptance case 1)
   *  2. Shift capacity with row-level lock (BR-11, critical acceptance case 2)
   *  3. Shift overlap for the same volunteer (BR-11, critical acceptance case 3)
   *  4. Duplicate registration prevention
   *
   * Returns 201-equivalent data with status REGISTERED or WAITLISTED.
   */
  async registerForShift(
    volunteerId: string,
    shiftId: string,
    requestingUser: AuthenticatedUser,
  ): Promise<{ registration: unknown; waitlisted: boolean }> {
    // Only volunteers register themselves; coordinators can register others
    if (
      volunteerId !== requestingUser.sub &&
      ![UserRole.COORDINATOR, UserRole.SYSTEM_ADMIN].includes(requestingUser.role)
    ) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Cannot register another volunteer.' });
    }

    return this.prisma.$transaction(
      async (tx) => {
        // ── STEP 1: Lock the shift row to prevent concurrent capacity races ──
        const shifts = await tx.$queryRaw<Array<{
          id: string; capacity_max: number; starts_at: Date; ends_at: Date;
          status: string; eligibility_rules_json: string | null;
          role_id: string;
        }>>`
          SELECT id, capacity_max, starts_at, ends_at, status,
                 eligibility_rules_json, role_id
          FROM "shift"
          WHERE id = ${shiftId}::uuid
          FOR UPDATE
        `;

        if (!shifts.length) throw new NotFoundException('Shift not found.');
        const shift = shifts[0];

        if (shift.status !== 'PUBLISHED') {
          throw new UnprocessableEntityException({
            code: 'SHIFT_NOT_OPEN',
            message: 'This shift is not open for registration.',
          });
        }

        // ── STEP 2: Eligibility check — role + shift rules (BR-03) ──
        await this.assertEligibility(tx, volunteerId, shift.role_id, shiftId, shift.starts_at);

        // ── STEP 3: Duplicate registration check ──
        const existing = await tx.registration.findFirst({
          where: {
            volunteerId,
            shiftId,
            status: { notIn: ['CANCELLED'] },
          },
          select: { id: true, status: true },
        });

        if (existing) {
          throw new ConflictException({
            code: 'ALREADY_REGISTERED',
            message: 'You are already registered for this shift.',
            details: { registration_id: existing.id, status: existing.status },
          });
        }

        // ── STEP 4: Capacity check — count active non-cancelled registrations ──
        const activeCount = await tx.registration.count({
          where: {
            shiftId,
            status: { notIn: ['CANCELLED'] },
          },
        });

        const isFull = activeCount >= shift.capacity_max;

        // ── STEP 5: Overlap check — no concurrent shift assignment for this volunteer ──
        if (!isFull) {
          await this.assertNoOverlap(tx, volunteerId, shift.starts_at, shift.ends_at);
        }

        // ── STEP 6: Create the registration ──
        const status = isFull ? 'WAITLISTED' : 'REGISTERED';
        const waitlistPosition = isFull ? activeCount - shift.capacity_max + 1 : null;

        const registration = await tx.registration.create({
          data: {
            volunteerId,
            shiftId,
            status: status as 'REGISTERED' | 'WAITLISTED',
            waitlistPosition,
          },
        });

        // ── STEP 7: If registered (not waitlisted), create assignment ──
        if (status === 'REGISTERED') {
          await tx.assignment.create({
            data: {
              registrationId: registration.id,
              shiftId,
              volunteerId,
              status: 'ASSIGNED',
              startsAt: shift.starts_at,
              endsAt: shift.ends_at,
            },
          });
        }

        await this.auditLog({
          entityType: 'REGISTRATION',
          entityId: registration.id,
          actorId: requestingUser.sub,
          action: isFull ? 'WAITLISTED' : 'REGISTERED',
          newValueJson: { shiftId, status, volunteerId },
        });

        this.logger.log(
          `Registration: volunteer=${volunteerId} shift=${shiftId} status=${status}`,
        );

        return { registration, waitlisted: isFull };
      },
      {
        // Serializable isolation to prevent race conditions on capacity
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async getRegistration(id: string, requestingUser: AuthenticatedUser) {
    const reg = await this.prisma.registration.findUnique({
      where: { id },
      include: {
        shift: { include: { role: { select: { name: true, opportunityId: true } } } },
        volunteer: { select: { id: true, fullName: true, email: true } },
        assignment: { select: { id: true, status: true } },
      },
    });
    if (!reg) throw new NotFoundException('Registration not found.');

    // Volunteers can only see own; staff can see all in org
    if (
      reg.volunteerId !== requestingUser.sub &&
      ![UserRole.COORDINATOR, UserRole.EVENT_MANAGER, UserRole.SITE_SUPERVISOR,
        UserRole.SYSTEM_ADMIN, UserRole.AUDITOR].includes(requestingUser.role)
    ) {
      throw new NotFoundException('Registration not found.');
    }

    return reg;
  }

  async listRegistrationsForShift(
    shiftId: string,
    params: { status?: string; page: number; page_size: number },
    requestingUser: AuthenticatedUser,
  ) {
    // Site supervisors may only query shifts in their scope
    if (requestingUser.role === UserRole.SITE_SUPERVISOR) {
      const shift = await this.prisma.shift.findUnique({
        where: { id: shiftId },
        select: { siteId: true },
      });
      if (shift?.siteId !== requestingUser.scopeSiteId) {
        throw new ForbiddenException({ code: 'SCOPE_VIOLATION', message: 'Shift is outside your site scope.' });
      }
    }

    const where: Prisma.RegistrationWhereInput = { shiftId };
    if (params.status) where.status = params.status as 'REGISTERED';

    const [data, total] = await this.prisma.$transaction([
      this.prisma.registration.findMany({
        where,
        include: { volunteer: { select: { id: true, fullName: true, email: true } } },
        skip: (params.page - 1) * params.page_size,
        take: params.page_size,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.registration.count({ where }),
    ]);

    return { data, meta: { page: params.page, page_size: params.page_size, total } };
  }

  async cancelRegistration(
    registrationId: string,
    reason: string | undefined,
    requestingUser: AuthenticatedUser,
  ) {
    const reg = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      select: { id: true, volunteerId: true, shiftId: true, status: true },
    });
    if (!reg) throw new NotFoundException('Registration not found.');

    const isSelf = reg.volunteerId === requestingUser.sub;
    const isStaff = [UserRole.COORDINATOR, UserRole.SYSTEM_ADMIN].includes(requestingUser.role);
    if (!isSelf && !isStaff) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Cannot cancel this registration.' });

    if (reg.status === 'CANCELLED') {
      throw new ConflictException({ code: 'ALREADY_CANCELLED', message: 'Registration is already cancelled.' });
    }

    // Cancel assignment if exists
    await this.prisma.$transaction([
      this.prisma.registration.update({
        where: { id: registrationId },
        data: { status: 'CANCELLED' },
      }),
      this.prisma.assignment.updateMany({
        where: { registrationId, status: { not: 'CANCELLED' } },
        data: { status: 'CANCELLED' },
      }),
    ]);

    await this.auditLog({
      entityType: 'REGISTRATION',
      entityId: registrationId,
      actorId: requestingUser.sub,
      action: 'CANCELLED',
      previousValueJson: { status: reg.status },
      newValueJson: { status: 'CANCELLED' },
      reason,
    });

    // Promote first waitlisted volunteer (async in production — here done synchronously for MVP)
    await this.promoteWaitlist(reg.shiftId, requestingUser.sub);

    return { id: registrationId, status: 'CANCELLED' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: ELIGIBILITY CHECK (critical acceptance case 1)
  // ─────────────────────────────────────────────────────────────────────────

  private async assertEligibility(
    tx: Prisma.TransactionClient,
    volunteerId: string,
    roleId: string,
    shiftId: string,
    shiftStartsAt: Date,
  ): Promise<void> {
    const [role, shift, volunteer] = await Promise.all([
      tx.role.findUnique({
        where: { id: roleId },
        select: { eligibilityRulesJson: true },
      }),
      tx.shift.findUnique({
        where: { id: shiftId },
        select: { eligibilityRulesJson: true },
      }),
      tx.volunteer.findUnique({
        where: { id: volunteerId },
        select: { dateOfBirth: true, credentials: true },
      }),
    ]);

    if (!volunteer) throw new NotFoundException('Volunteer not found.');

    // Merge role and shift eligibility rules (shift overrides role for same keys)
    const roleRules = (role?.eligibilityRulesJson ?? {}) as EligibilityRules;
    const shiftRules = (shift?.eligibilityRulesJson ?? {}) as EligibilityRules;
    const rules: EligibilityRules = { ...roleRules, ...shiftRules };

    const violations: string[] = [];

    // ── Age check ──
    if ((rules.minAge !== undefined || rules.maxAge !== undefined) && volunteer.dateOfBirth) {
      const ageMs = shiftStartsAt.getTime() - volunteer.dateOfBirth.getTime();
      const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);

      if (rules.minAge !== undefined && ageYears < rules.minAge) {
        violations.push(`Minimum age is ${rules.minAge}; volunteer is ${Math.floor(ageYears)}.`);
      }
      if (rules.maxAge !== undefined && ageYears > rules.maxAge) {
        violations.push(`Maximum age is ${rules.maxAge}.`);
      }
    }

    // ── Required credential types (e.g. TRAINING, BACKGROUND_CHECK) ──
    if (rules.requiredCredentialTypes?.length) {
      for (const credType of rules.requiredCredentialTypes) {
        const cred = volunteer.credentials.find(
          (c) => c.type === credType && c.status === 'APPROVED' &&
            (!c.expiresAt || c.expiresAt > shiftStartsAt),
        );
        if (!cred) {
          violations.push(`Missing required credential: ${credType}.`);
        }
      }
    }

    // ── Specific credential IDs ──
    if (rules.requiredCredentialIds?.length) {
      for (const credId of rules.requiredCredentialIds) {
        const cred = volunteer.credentials.find(
          (c) => c.id === credId && c.status === 'APPROVED' &&
            (!c.expiresAt || c.expiresAt > shiftStartsAt),
        );
        if (!cred) {
          violations.push(`Missing required credential ID: ${credId}.`);
        }
      }
    }

    if (violations.length > 0) {
      throw new UnprocessableEntityException({
        code: 'ELIGIBILITY_NOT_MET',
        message: 'Volunteer does not meet the eligibility requirements for this shift.',
        details: { violations },
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: OVERLAP CHECK (critical acceptance case 3)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Checks that the volunteer has no active assignment overlapping
   * the proposed shift window [shiftStart, shiftEnd).
   * Uses a half-open interval check consistent with the DB GIST constraint.
   */
  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    volunteerId: string,
    shiftStart: Date,
    shiftEnd: Date,
  ): Promise<void> {
    const overlapping = await tx.assignment.findFirst({
      where: {
        volunteerId,
        status: { notIn: ['CANCELLED'] },
        // Half-open interval: [A.start, A.end) overlaps [B.start, B.end)
        // iff A.start < B.end AND A.end > B.start
        AND: [
          { startsAt: { lt: shiftEnd } },
          { endsAt: { gt: shiftStart } },
        ],
      },
      select: { id: true, shiftId: true, startsAt: true, endsAt: true },
    });

    if (overlapping) {
      throw new ConflictException({
        code: 'SHIFT_OVERLAP',
        message: 'This shift overlaps with an existing assignment.',
        details: {
          conflicting_assignment_id: overlapping.id,
          conflicting_shift_id: overlapping.shiftId,
          starts_at: overlapping.startsAt,
          ends_at: overlapping.endsAt,
        },
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: WAITLIST PROMOTION
  // ─────────────────────────────────────────────────────────────────────────

  private async promoteWaitlist(shiftId: string, actorId: string): Promise<void> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      select: { id: true, capacityMax: true, startsAt: true, endsAt: true },
    });
    if (!shift) return;

    const activeCount = await this.prisma.registration.count({
      where: { shiftId, status: { notIn: ['CANCELLED'] } },
    });

    if (activeCount >= shift.capacityMax) return; // still full

    const nextWaitlisted = await this.prisma.registration.findFirst({
      where: { shiftId, status: 'WAITLISTED' },
      orderBy: { waitlistPosition: 'asc' },
      select: { id: true, volunteerId: true },
    });

    if (!nextWaitlisted) return;

    // Check overlap still valid for promoted volunteer
    const overlapping = await this.prisma.assignment.findFirst({
      where: {
        volunteerId: nextWaitlisted.volunteerId,
        status: { notIn: ['CANCELLED'] },
        AND: [
          { startsAt: { lt: shift.endsAt } },
          { endsAt: { gt: shift.startsAt } },
        ],
      },
    });

    if (overlapping) {
      // Can't promote — skip to next (simplified for MVP)
      this.logger.warn(`Waitlist promotion skipped: overlap conflict for registration=${nextWaitlisted.id}`);
      return;
    }

    await this.prisma.$transaction([
      this.prisma.registration.update({
        where: { id: nextWaitlisted.id },
        data: { status: 'REGISTERED', waitlistPosition: null },
      }),
      this.prisma.assignment.create({
        data: {
          registrationId: nextWaitlisted.id,
          shiftId,
          volunteerId: nextWaitlisted.volunteerId,
          status: 'ASSIGNED',
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
        },
      }),
    ]);

    await this.auditLog({
      entityType: 'REGISTRATION',
      entityId: nextWaitlisted.id,
      actorId,
      action: 'PROMOTED_FROM_WAITLIST',
      newValueJson: { status: 'REGISTERED' },
    });
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
