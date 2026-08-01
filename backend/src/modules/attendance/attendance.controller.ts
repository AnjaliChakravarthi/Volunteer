import {
  Controller,
  Post,
  Get,
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
import { AttendanceService } from './attendance.service';
import {
  CheckInDto,
  CheckOutDto,
  IssueQrTokenDto,
  GetRosterQuery,
} from './dto/attendance.dto';

/**
 * AttendanceController
 *
 * Role access:
 *   POST /checkin          — SITE_SUPERVISOR, COORDINATOR, SYSTEM_ADMIN
 *   POST /checkout         — SITE_SUPERVISOR, COORDINATOR, SYSTEM_ADMIN
 *   GET  /roster           — SITE_SUPERVISOR, COORDINATOR, SYSTEM_ADMIN
 *   POST /checkin/qr-token — SITE_SUPERVISOR, COORDINATOR, SYSTEM_ADMIN
 *
 * Volunteers do NOT have direct access to these endpoints (supervisors act on their behalf).
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  /**
   * GET /roster
   * Returns today's assignment list scoped to the requesting supervisor's site.
   * Coordinators may pass ?siteId= to filter; Supervisors always see their own scope only.
   */
  @Get('roster')
  @Roles(UserRole.SITE_SUPERVISOR, UserRole.COORDINATOR, UserRole.EVENT_MANAGER, UserRole.SYSTEM_ADMIN)
  async getRoster(
    @Query() query: GetRosterQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.attendanceService.getRoster(query, user);
    return { data };
  }

  /**
   * POST /checkin/qr-token
   * Issues a short-lived (5-min) QR token for a volunteer's assignment.
   * The token is displayed as a QR code on the volunteer's device and scanned by the supervisor.
   */
  @Post('checkin/qr-token')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.SITE_SUPERVISOR, UserRole.COORDINATOR, UserRole.SYSTEM_ADMIN)
  async issueQrToken(
    @Body() dto: IssueQrTokenDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.attendanceService.issueQrToken(dto.assignmentId, user);
    return { data };
  }

  /**
   * POST /checkin
   * Check a volunteer in.
   * Supports: QR scan, manual roster tap, walk-in (no assignment), offline-queued sync.
   */
  @Post('checkin')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SITE_SUPERVISOR, UserRole.COORDINATOR, UserRole.SYSTEM_ADMIN)
  async checkIn(
    @Body() dto: CheckInDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.attendanceService.checkIn(dto, user);
    return { data };
  }

  /**
   * POST /checkout
   * Record a volunteer's departure.
   * Creates or updates the draft Participation record with gross hours.
   */
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SITE_SUPERVISOR, UserRole.COORDINATOR, UserRole.SYSTEM_ADMIN)
  async checkOut(
    @Body() dto: CheckOutDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.attendanceService.checkOut(dto, user);
    return { data };
  }

  /**
   * GET /assignments/:id/attendance
   * Fetch the attendance record for a given assignment.
   */
  @Get('assignments/:id/attendance')
  @Roles(
    UserRole.SITE_SUPERVISOR,
    UserRole.COORDINATOR,
    UserRole.EVENT_MANAGER,
    UserRole.SYSTEM_ADMIN,
    UserRole.AUDITOR,
  )
  async getAttendanceForAssignment(
    @Param('id', ParseUUIDPipe) assignmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const roster = await this.attendanceService.getRoster({ shiftId: undefined }, user);
    const entry = roster.find((a) => a.id === assignmentId);
    if (!entry) {
      return { data: null };
    }
    return { data: entry.attendance };
  }
}
