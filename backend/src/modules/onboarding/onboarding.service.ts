import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { SubmitCredentialDto, ReviewCredentialDto } from './dto/onboarding.dto';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getCredentials(volunteerId: string) {
    return this.prisma.credential.findMany({
      where: { volunteerId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async submitCredential(volunteerId: string, dto: SubmitCredentialDto) {
    // If a credential of this type already exists and is pending or approved, we shouldn't allow a new one easily,
    // but for simplicity, we'll allow multiple records or update an existing NOT_STARTED/REJECTED one.
    const existing = await this.prisma.credential.findFirst({
      where: { volunteerId, type: dto.type, status: { in: ['PENDING', 'SUBMITTED', 'APPROVED'] } },
    });

    if (existing) {
      throw new ConflictException(`You already have a credential of type ${dto.type} that is ${existing.status}`);
    }

    const credential = await this.prisma.credential.create({
      data: {
        volunteerId,
        type: dto.type,
        status: 'SUBMITTED',
        providerReference: dto.providerReference,
        notes: dto.notes,
      },
    });

    return credential;
  }

  async reviewCredential(credentialId: string, reviewerId: string, dto: ReviewCredentialDto) {
    const credential = await this.prisma.credential.findUnique({
      where: { id: credentialId },
    });

    if (!credential) throw new NotFoundException('Credential not found');

    const updated = await this.prisma.credential.update({
      where: { id: credentialId },
      data: {
        status: dto.status,
        notes: dto.notes ?? credential.notes,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : credential.issuedAt,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : credential.expiresAt,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'CREDENTIAL',
        entityId: credentialId,
        actorId: reviewerId,
        action: 'REVIEWED',
        previousValueJson: { status: credential.status },
        newValueJson: { status: updated.status },
      },
    });

    return updated;
  }
}
