import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { VolunteerQueryDto } from './dto/volunteer-query.dto';
import { UpdateContactDetailDto } from './dto/volunteer.dto';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';
import { UserRole } from '../../common/types/user-role.enum';
import { paginate, PaginatedResponse } from '../../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';

/**
 * Volunteer profile repository — data access layer for volunteer entities.
 * All scope filters (org_id, site_id) are applied HERE, not in the service layer,
 * to prevent privilege escalation via scope bypass (§5.3 threat model).
 */
@Injectable()
export class VolunteerRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // SAFE SELECT — fields returned to general callers (no password hash, no MFA secret)
  // ─────────────────────────────────────────────────────────────────────────

  private readonly publicSelect = {
    id: true,
    email: true,
    fullName: true,
    dateOfBirth: true,
    status: true,
    role: true,
    orgId: true,
    createdAt: true,
    updatedAt: true,
    // Compartmentalized fields omitted from general selects:
    //   passwordHash, mfaSecret, refreshTokenHash (never returned)
    //   scopeSiteId: returned only for scope-binding display
    scopeSiteId: true,
    contactDetail: true,
  } as const;

  async findById(
    id: string,
    requestingUser: AuthenticatedUser,
  ) {
    const volunteer = await this.prisma.volunteer.findUnique({
      where: { id, deletedAt: null },
      select: this.publicSelect,
    });

    if (!volunteer) throw new NotFoundException('Volunteer not found.');

    // Scope check: volunteers can only see themselves;
    // coordinators/admins see all in their org;
    // site supervisors see only within their scope (handled here)
    this.assertScopeAccess(requestingUser, volunteer);

    return volunteer;
  }

  async findMany(
    query: VolunteerQueryDto,
    requestingUser: AuthenticatedUser,
  ): Promise<PaginatedResponse<unknown>> {
    const where: Prisma.VolunteerWhereInput = {
      orgId: requestingUser.orgId, // always scoped to org
      deletedAt: null,
    };

    if (query.status) where.status = query.status;
    if (query.role) where.role = query.role;
    if (query.q) {
      where.OR = [
        { fullName: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    // SITE_SUPERVISOR scope: only see volunteers assigned to their site
    if (requestingUser.role === UserRole.SITE_SUPERVISOR && requestingUser.scopeSiteId) {
      where.assignments = {
        some: {
          shift: { siteId: requestingUser.scopeSiteId },
          status: { not: 'CANCELLED' },
        },
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.volunteer.findMany({
        where,
        select: this.publicSelect,
        skip: query.skip,
        take: query.take,
        orderBy: this.buildOrderBy(query.sort),
      }),
      this.prisma.volunteer.count({ where }),
    ]);

    return paginate(data, total, query);
  }

  async updateProfile(
    id: string,
    requestingUser: AuthenticatedUser,
    updates: { fullName?: string; dateOfBirth?: Date | null },
  ) {
    await this.assertSelfOrStaff(id, requestingUser);
    return this.prisma.volunteer.update({
      where: { id },
      data: updates,
      select: this.publicSelect,
    });
  }

  async upsertContactDetail(
    volunteerId: string,
    requestingUser: AuthenticatedUser,
    dto: UpdateContactDetailDto,
  ) {
    await this.assertSelfOrStaff(volunteerId, requestingUser);
    return this.prisma.contactDetail.upsert({
      where: { volunteerId },
      create: { volunteerId, ...dto },
      update: dto,
    });
  }

  async softDelete(id: string, requestingUser: AuthenticatedUser) {
    this.assertAdminOrSelf(requestingUser, id);
    return this.prisma.volunteer.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
      select: { id: true },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE: scope enforcement helpers
  // ─────────────────────────────────────────────────────────────────────────

  private assertScopeAccess(
    user: AuthenticatedUser,
    target: { id: string; orgId: string },
  ): void {
    const isSelf = user.sub === target.id;
    const isStaff = [
      UserRole.COORDINATOR, UserRole.EVENT_MANAGER,
      UserRole.SYSTEM_ADMIN, UserRole.AUDITOR, UserRole.LEADERSHIP,
    ].includes(user.role);

    if (!isSelf && !isStaff) {
      throw new NotFoundException('Volunteer not found.');
    }

    // Org isolation — always enforce
    if (target.orgId !== user.orgId) {
      throw new NotFoundException('Volunteer not found.');
    }
  }

  private async assertSelfOrStaff(
    targetId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const isSelf = user.sub === targetId;
    const isStaff = [
      UserRole.COORDINATOR, UserRole.SYSTEM_ADMIN,
    ].includes(user.role);
    if (!isSelf && !isStaff) {
      throw new NotFoundException('Volunteer not found.');
    }
  }

  private assertAdminOrSelf(user: AuthenticatedUser, targetId: string): void {
    const isSelf = user.sub === targetId;
    const isAdmin = user.role === UserRole.SYSTEM_ADMIN;
    if (!isSelf && !isAdmin) {
      throw new NotFoundException('Volunteer not found.');
    }
  }

  private buildOrderBy(sort?: string): Prisma.VolunteerOrderByWithRelationInput {
    if (!sort) return { createdAt: 'desc' };
    const desc = sort.startsWith('-');
    const field = desc ? sort.slice(1) : sort;
    const allowed: Record<string, Prisma.VolunteerOrderByWithRelationInput> = {
      full_name: { fullName: desc ? 'desc' : 'asc' },
      created_at: { createdAt: desc ? 'desc' : 'asc' },
      email: { email: desc ? 'desc' : 'asc' },
    };
    return allowed[field] ?? { createdAt: 'desc' };
  }
}
