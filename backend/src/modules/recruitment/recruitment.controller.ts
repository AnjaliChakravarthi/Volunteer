import { Controller, Post, Get, Patch, Body, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { RecruitmentService } from './recruitment.service';
import { CreateApplicationDto, ReviewApplicationDto } from './dto/recruitment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/types/user-role.enum';

@Controller('applications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecruitmentController {
  constructor(private readonly recruitmentService: RecruitmentService) {}

  @Post()
  async apply(@Body() dto: CreateApplicationDto, @CurrentUser('sub') volunteerId: string) {
    const data = await this.recruitmentService.apply(volunteerId, dto);
    return { data };
  }

  @Get()
  @Roles(UserRole.COORDINATOR, UserRole.SYSTEM_ADMIN)
  async getApplications(@Query() query: { opportunityId?: string; status?: string; volunteerId?: string }) {
    const data = await this.recruitmentService.getApplications(query);
    return { data };
  }

  @Patch(':id/review')
  @Roles(UserRole.COORDINATOR, UserRole.SYSTEM_ADMIN)
  async reviewApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewApplicationDto,
    @CurrentUser('sub') reviewerId: string
  ) {
    const data = await this.recruitmentService.reviewApplication(id, reviewerId, dto);
    return { data };
  }
}
