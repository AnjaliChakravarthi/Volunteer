import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateApplicationDto, ReviewApplicationDto } from './dto/recruitment.dto';

@Injectable()
export class RecruitmentService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(volunteerId: string, dto: CreateApplicationDto) {
    const opp = await this.prisma.opportunity.findUnique({
      where: { id: dto.opportunityId },
      select: { id: true, status: true },
    });
    
    if (!opp) throw new NotFoundException('Opportunity not found');
    if (opp.status !== 'OPEN') throw new ConflictException('Opportunity is not open for applications');

    // Check if already applied
    const existing = await this.prisma.application.findFirst({
      where: { volunteerId, opportunityId: dto.opportunityId },
    });

    if (existing) {
      throw new ConflictException('You have already applied for this opportunity');
    }

    const application = await this.prisma.application.create({
      data: {
        volunteerId,
        opportunityId: dto.opportunityId,
        formAnswersJson: dto.formAnswersJson ? (dto.formAnswersJson as Prisma.InputJsonValue) : Prisma.JsonNull,
        status: 'PENDING',
      },
    });

    return application;
  }

  async getApplications(filters: { opportunityId?: string; status?: string; volunteerId?: string }) {
    const where: Prisma.ApplicationWhereInput = {};
    if (filters.opportunityId) where.opportunityId = filters.opportunityId;
    if (filters.status) where.status = filters.status;
    if (filters.volunteerId) where.volunteerId = filters.volunteerId;

    return this.prisma.application.findMany({
      where,
      include: {
        volunteer: { select: { id: true, email: true, fullName: true } },
        opportunity: { select: { id: true, name: true, event: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewApplication(applicationId: string, reviewerId: string, dto: ReviewApplicationDto) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!application) throw new NotFoundException('Application not found');

    const updated = await this.prisma.application.update({
      where: { id: applicationId },
      data: {
        status: dto.status,
        notes: dto.notes ?? application.notes,
        reviewedByVolunteerId: reviewerId,
        reviewedAt: new Date(),
      },
    });

    // If APPROVED, we might need to emit an event or update the volunteer status if they were just a prospect, 
    // but the spec says "APPROVED automatically grant a baseline Approved Volunteer status allowing them to register for open shifts".
    // Since our system relies on credentials for restrictions, baseline approval is enough if there are no specific role credentials.
    // We can also ensure the volunteer is 'ACTIVE' if they aren't already.

    await this.prisma.auditLog.create({
      data: {
        entityType: 'APPLICATION',
        entityId: applicationId,
        actorId: reviewerId,
        action: 'REVIEWED',
        previousValueJson: { status: application.status },
        newValueJson: { status: updated.status },
      },
    });

    return updated;
  }
}
