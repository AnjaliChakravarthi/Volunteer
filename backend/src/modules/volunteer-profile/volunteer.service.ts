import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { VolunteerRepository } from './volunteer.repository';
import { VolunteerQueryDto } from './dto/volunteer-query.dto';
import { UpdateContactDetailDto, UpdateVolunteerDto } from './dto/volunteer.dto';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';
import { Prisma } from '@prisma/client';

/**
 * Volunteer profile service (BE-001).
 * Service layer coordinates repository calls, audit logging, and business logic.
 * Pure data reads are thin pass-throughs; writes include audit trail creation.
 */
@Injectable()
export class VolunteerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: VolunteerRepository,
  ) {}

  async getProfile(id: string, requestingUser: AuthenticatedUser) {
    return this.repository.findById(id, requestingUser);
  }

  async listVolunteers(query: VolunteerQueryDto, requestingUser: AuthenticatedUser) {
    return this.repository.findMany(query, requestingUser);
  }

  async updateProfile(
    id: string,
    dto: UpdateVolunteerDto,
    requestingUser: AuthenticatedUser,
  ) {
    const updates: Prisma.VolunteerUpdateInput = {};
    if (dto.fullName !== undefined) updates.fullName = dto.fullName;
    if (dto.dateOfBirth !== undefined) {
      updates.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    }

    const before = await this.repository.findById(id, requestingUser);
    const updated = await this.repository.updateProfile(id, requestingUser, {
      fullName: dto.fullName,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'VOLUNTEER',
        entityId: id,
        actorId: requestingUser.sub,
        action: 'PROFILE_UPDATED',
        previousValueJson: { fullName: before.fullName, dateOfBirth: before.dateOfBirth } as Prisma.InputJsonValue,
        newValueJson: { fullName: updated.fullName, dateOfBirth: updated.dateOfBirth } as Prisma.InputJsonValue,
      },
    });

    return updated;
  }

  async updateContactDetail(
    volunteerId: string,
    dto: UpdateContactDetailDto,
    requestingUser: AuthenticatedUser,
  ) {
    return this.repository.upsertContactDetail(volunteerId, requestingUser, dto);
  }

  async deactivate(id: string, requestingUser: AuthenticatedUser) {
    const result = await this.repository.softDelete(id, requestingUser);

    await this.prisma.auditLog.create({
      data: {
        entityType: 'VOLUNTEER',
        entityId: id,
        actorId: requestingUser.sub,
        action: 'DEACTIVATED',
        reason: 'User account deactivated',
      },
    });

    return result;
  }
}
