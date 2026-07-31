import { Controller, Post, Get, Patch, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { SubmitCredentialDto, ReviewCredentialDto } from './dto/onboarding.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/types/user-role.enum';

@Controller('onboarding')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('credentials')
  async getMyCredentials(@CurrentUser('sub') volunteerId: string) {
    const data = await this.onboardingService.getCredentials(volunteerId);
    return { data };
  }

  @Post('credentials')
  async submitCredential(@Body() dto: SubmitCredentialDto, @CurrentUser('sub') volunteerId: string) {
    const data = await this.onboardingService.submitCredential(volunteerId, dto);
    return { data };
  }

  @Get('volunteers/:volunteerId/credentials')
  @Roles(UserRole.COORDINATOR, UserRole.SYSTEM_ADMIN)
  async getVolunteerCredentials(@Param('volunteerId', ParseUUIDPipe) volunteerId: string) {
    const data = await this.onboardingService.getCredentials(volunteerId);
    return { data };
  }

  @Patch('credentials/:id/review')
  @Roles(UserRole.COORDINATOR, UserRole.SYSTEM_ADMIN)
  async reviewCredential(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewCredentialDto,
    @CurrentUser('sub') reviewerId: string
  ) {
    const data = await this.onboardingService.reviewCredential(id, reviewerId, dto);
    return { data };
  }
}
