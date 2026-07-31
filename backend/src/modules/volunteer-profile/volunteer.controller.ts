import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';
import { UserRole } from '../../common/types/user-role.enum';
import { VolunteerService } from './volunteer.service';
import { UpdateVolunteerDto, UpdateContactDetailDto } from './dto/volunteer.dto';
import { VolunteerQueryDto } from './dto/volunteer-query.dto';

/**
 * Volunteer profile controller — §3.4 API table:
 *  GET  /api/v1/volunteers            (coordinator+)
 *  GET  /api/v1/volunteers/:id        (self or coordinator+, scope-enforced in repository)
 *  PATCH /api/v1/volunteers/:id       (self or coordinator)
 *  PATCH /api/v1/volunteers/:id/contact (self or coordinator)
 *  DELETE /api/v1/volunteers/:id      (self or admin)
 */
@Controller('volunteers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VolunteerController {
  constructor(private readonly volunteerService: VolunteerService) {}

  @Get()
  @Roles(
    UserRole.COORDINATOR,
    UserRole.EVENT_MANAGER,
    UserRole.SITE_SUPERVISOR,
    UserRole.SYSTEM_ADMIN,
    UserRole.AUDITOR,
    UserRole.LEADERSHIP,
  )
  async list(
    @Query() query: VolunteerQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.volunteerService.listVolunteers(query, user);
  }

  @Get(':id')
  async getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Additional scope enforcement in repository layer
    const data = await this.volunteerService.getProfile(id, user);
    return { data };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVolunteerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.volunteerService.updateProfile(id, dto, user);
    return { data };
  }

  @Patch(':id/contact')
  async updateContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDetailDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.volunteerService.updateContactDetail(id, dto, user);
    return { data };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.volunteerService.deactivate(id, user);
    return { data };
  }
}
