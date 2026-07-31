import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  Delete,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';
import { UserRole } from '../../common/types/user-role.enum';
import { SchedulingService } from './scheduling.service';
import {
  CreateEventDto,
  UpdateEventDto,
  CreateOpportunityDto,
  CreateRoleDto,
  CreateShiftDto,
  CreateRegistrationDto,
} from './dto/scheduling.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  // ─── EVENT ──────────────────────────────────────────────────────────────

  @Post('events')
  @Roles(UserRole.EVENT_MANAGER, UserRole.SYSTEM_ADMIN)
  async createEvent(@Body() dto: CreateEventDto, @CurrentUser('sub') actorId: string) {
    const data = await this.schedulingService.createEvent(dto, actorId);
    return { data };
  }

  @Get('events')
  async listEvents(@Query() query: { programId?: string; status?: string; page?: string; page_size?: string }) {
    const data = await this.schedulingService.listEvents({
      programId: query.programId,
      status: query.status,
      page: query.page ? parseInt(query.page, 10) : 1,
      page_size: query.page_size ? parseInt(query.page_size, 10) : 20,
    });
    return data; // Returns { data, meta }
  }

  @Get('events/:id')
  async getEvent(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.schedulingService.getEvent(id);
    return { data };
  }

  @Patch('events/:id')
  @Roles(UserRole.EVENT_MANAGER, UserRole.SYSTEM_ADMIN)
  async updateEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser('sub') actorId: string,
  ) {
    const data = await this.schedulingService.updateEvent(id, dto, actorId);
    return { data };
  }

  // ─── OPPORTUNITY ────────────────────────────────────────────────────────

  @Post('events/:eventId/opportunities')
  @Roles(UserRole.EVENT_MANAGER, UserRole.SYSTEM_ADMIN)
  async createOpportunity(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateOpportunityDto,
    @CurrentUser('sub') actorId: string,
  ) {
    const data = await this.schedulingService.createOpportunity(eventId, dto, actorId);
    return { data };
  }

  @Get('opportunities/:id')
  async getOpportunity(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.schedulingService.getOpportunity(id);
    return { data };
  }

  // ─── ROLE ───────────────────────────────────────────────────────────────

  @Post('opportunities/:opportunityId/roles')
  @Roles(UserRole.EVENT_MANAGER, UserRole.SYSTEM_ADMIN)
  async createRole(
    @Param('opportunityId', ParseUUIDPipe) opportunityId: string,
    @Body() dto: CreateRoleDto,
    @CurrentUser('sub') actorId: string,
  ) {
    const data = await this.schedulingService.createRole(opportunityId, dto, actorId);
    return { data };
  }

  // ─── SHIFT ──────────────────────────────────────────────────────────────

  @Post('roles/:roleId/shifts')
  @Roles(UserRole.EVENT_MANAGER, UserRole.SYSTEM_ADMIN)
  async createShift(
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() dto: CreateShiftDto,
    @CurrentUser('sub') actorId: string,
  ) {
    const data = await this.schedulingService.createShift(roleId, dto, actorId);
    return { data };
  }

  @Get('shifts/:id')
  async getShift(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.schedulingService.getShift(id);
    return { data };
  }

  // ─── REGISTRATION ───────────────────────────────────────────────────────

  @Post('registrations')
  async register(
    @Body() dto: CreateRegistrationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Currently volunteers register themselves.
    const result = await this.schedulingService.registerForShift(user.sub, dto.shiftId, user);
    return { data: result };
  }

  @Get('registrations/:id')
  async getRegistration(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.schedulingService.getRegistration(id, user);
    return { data };
  }

  @Get('shifts/:shiftId/registrations')
  @Roles(UserRole.COORDINATOR, UserRole.EVENT_MANAGER, UserRole.SITE_SUPERVISOR, UserRole.SYSTEM_ADMIN, UserRole.AUDITOR)
  async listRegistrations(
    @Param('shiftId', ParseUUIDPipe) shiftId: string,
    @Query() query: { status?: string; page?: string; page_size?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.schedulingService.listRegistrationsForShift(
      shiftId,
      {
        status: query.status,
        page: query.page ? parseInt(query.page, 10) : 1,
        page_size: query.page_size ? parseInt(query.page_size, 10) : 20,
      },
      user,
    );
    return data;
  }

  @Delete('registrations/:id')
  @HttpCode(HttpStatus.OK)
  async cancelRegistration(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('reason') reason: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.schedulingService.cancelRegistration(id, reason, user);
    return { data };
  }
}
