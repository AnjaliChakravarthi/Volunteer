import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';
import { UserRole } from '../../common/types/user-role.enum';
import { ParticipationLedgerService } from './participation-ledger.service';
import {
  ApproveParticipationDto,
  AdjustParticipationDto,
  GetParticipationQuery,
} from '../attendance/dto/attendance.dto';

/**
 * ParticipationLedgerController (Phase 3 — BE-PART)
 *
 * Endpoints:
 *   GET   /participation/:volunteerId       — View volunteer participation history
 *   GET   /participation/record/:id         — View single participation record
 *   PATCH /participation/:id/approve        — Advance approval state / update hours
 *   POST  /participation/:id/adjust         — Create append-only adjustment on finalized record (BR-05)
 */
@Controller('participation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ParticipationLedgerController {
  constructor(private readonly ledgerService: ParticipationLedgerService) {}

  /**
   * GET /participation/:volunteerId
   * Query participation records for a volunteer.
   * Volunteer sees only own records; staff roles see org-wide.
   */
  @Get(':volunteerId')
  async getVolunteerParticipation(
    @Param('volunteerId', ParseUUIDPipe) volunteerId: string,
    @Query() query: GetParticipationQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.ledgerService.getVolunteerParticipation(volunteerId, query, user);
    return data;
  }

  /**
   * GET /participation/record/:id
   * Fetch single participation record with its adjustment audit trail.
   */
  @Get('record/:id')
  async getParticipationById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.ledgerService.getParticipationById(id, user);
    return { data };
  }

  /**
   * PATCH /participation/:id/approve
   * Advance participation state (SUBMITTED → SUPERVISOR_APPROVED → FINALIZED).
   * Site Supervisors can approve up to SUPERVISOR_APPROVED; Coordinators can FINALIZE.
   */
  @Patch(':id/approve')
  @Roles(UserRole.SITE_SUPERVISOR, UserRole.COORDINATOR, UserRole.SYSTEM_ADMIN)
  async approveParticipation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveParticipationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.ledgerService.approveParticipation(id, dto, user);
    return { data };
  }

  /**
   * POST /participation/:id/adjust
   * Append-only adjustment entry on a FINALIZED or LOCKED record (BR-05).
   * Elevated Coordinator action only. Never silent overwrites.
   */
  @Post(':id/adjust')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.COORDINATOR, UserRole.SYSTEM_ADMIN)
  async adjustParticipation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustParticipationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.ledgerService.adjustParticipation(id, dto, user);
    return { data };
  }
}
