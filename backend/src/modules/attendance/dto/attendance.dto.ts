import {
  IsString,
  IsOptional,
  IsDateString,
  IsUUID,
  IsIn,
  IsInt,
  Min,
  Max,
  IsNumber,
  MaxLength,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── Check-in ─────────────────────────────────────────────────────────────────

/**
 * Standard check-in: supervisor taps a volunteer on their roster.
 * Requires assignmentId OR (for walk-in) volunteerId + shiftId.
 * method discriminates QR | MANUAL | WALK_IN_MANUAL | OFFLINE_QUEUED.
 */
export class CheckInDto {
  @IsOptional()
  @IsUUID()
  assignmentId?: string;

  /** Walk-in: volunteer ID when there is no pre-existing assignment */
  @IsOptional()
  @IsUUID()
  volunteerId?: string;

  /** Walk-in: shift the volunteer is checking into */
  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @IsIn(['QR', 'MANUAL', 'WALK_IN_MANUAL', 'OFFLINE_QUEUED'])
  method: 'QR' | 'MANUAL' | 'WALK_IN_MANUAL' | 'OFFLINE_QUEUED';

  /**
   * ISO timestamp of the check-in event.
   * For online check-ins this is server-set; for OFFLINE_QUEUED this is the
   * locally recorded timestamp sent on sync.
   */
  @IsOptional()
  @IsDateString()
  checkedInAt?: string;

  /**
   * For QR method: the signed token string emitted by the volunteer's QR code.
   * Service validates signature and expiry before accepting.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  qrToken?: string;

  /**
   * For OFFLINE_QUEUED: timestamp when this record was created on the device.
   * Used to detect conflicts (e.g. shift already ended on server).
   */
  @IsOptional()
  @IsDateString()
  offlineQueuedAt?: string;
}

// ─── Check-out ────────────────────────────────────────────────────────────────

export class CheckOutDto {
  @IsUUID()
  assignmentId: string;

  @IsOptional()
  @IsDateString()
  checkedOutAt?: string;
}

// ─── QR Token Issue ───────────────────────────────────────────────────────────

export class IssueQrTokenDto {
  @IsUUID()
  assignmentId: string;
}

// ─── Roster Query ─────────────────────────────────────────────────────────────

export class GetRosterQuery {
  /** Filter by specific shift */
  @IsOptional()
  @IsUUID()
  shiftId?: string;

  /** Filter by site */
  @IsOptional()
  @IsString()
  siteId?: string;

  /** ISO date string — defaults to today UTC */
  @IsOptional()
  @IsDateString()
  date?: string;
}

// ─── Participation ────────────────────────────────────────────────────────────

/**
 * Approve participation hours.
 * Moves status: SUBMITTED → SUPERVISOR_APPROVED → FINALIZED.
 * Supervisors can only move to SUPERVISOR_APPROVED; Coordinators can FINALIZE.
 */
export class ApproveParticipationDto {
  /**
   * Override credited hours. If omitted, system computes from checkout-checkin-break.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  creditedHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  breakMinutes?: number;

  @IsOptional()
  @IsBoolean()
  certifiesEligible?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  /**
   * DISPUTED: sets status to DISPUTED (pre-FINALIZED only).
   * FINALIZE: moves SUPERVISOR_APPROVED → FINALIZED (Coordinator only).
   * LOCK: moves FINALIZED → LOCKED (Coordinator only).
   * Default action for supervisor: SUPERVISOR_APPROVE.
   */
  @IsOptional()
  @IsIn(['SUPERVISOR_APPROVE', 'FINALIZE', 'LOCK', 'DISPUTE'])
  action?: 'SUPERVISOR_APPROVE' | 'FINALIZE' | 'LOCK' | 'DISPUTE';
}

/**
 * Adjustment entry on a FINALIZED or LOCKED participation record.
 * Creates an append-only ParticipationAdjustment row (BR-05).
 * Only Coordinator (elevated) may call this endpoint.
 */
export class AdjustParticipationDto {
  /** Hours delta: positive = add, negative = subtract */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-24)
  @Max(24)
  deltaHours: number;

  @IsString()
  @MaxLength(2000)
  reason: string;
}

/**
 * Query params for listing a volunteer's participation ledger.
 */
export class GetParticipationQuery {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  page_size?: number;
}
