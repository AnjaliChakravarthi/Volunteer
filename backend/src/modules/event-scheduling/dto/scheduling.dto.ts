import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsInt,
  Min,
  Max,
  ValidateNested,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

// ─── Event ────────────────────────────────────────────────────────────────

export class CreateEventDto {
  @IsUUID()
  programId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;
}

export class UpdateEventDto extends PartialType(CreateEventDto) {
  @IsOptional()
  @IsEnum(['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';
}

// ─── Opportunity ──────────────────────────────────────────────────────────

export class CreateOpportunityDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;
}

export class UpdateOpportunityDto extends PartialType(CreateOpportunityDto) {
  @IsOptional()
  @IsEnum(['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED'])
  status?: 'DRAFT' | 'OPEN' | 'CLOSED' | 'CANCELLED';
}

// ─── Role ─────────────────────────────────────────────────────────────────

/**
 * Eligibility rules shape stored as JSON (versioned per event per §4.2).
 * Validated at this DTO level; business enforcement is in SchedulingService.
 */
export class EligibilityRulesDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  minAge?: number;

  @IsOptional()
  @IsInt()
  @Max(120)
  maxAge?: number;

  /** List of credential types required (e.g. ['TRAINING', 'BACKGROUND_CHECK']) */
  @IsOptional()
  @IsString({ each: true })
  requiredCredentialTypes?: string[];

  /** Specific credential record IDs required */
  @IsOptional()
  @IsUUID('4', { each: true })
  requiredCredentialIds?: string[];
}

export class CreateRoleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EligibilityRulesDto)
  eligibilityRules?: EligibilityRulesDto;
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}

// ─── Shift ────────────────────────────────────────────────────────────────

export class CreateShiftDto {
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsInt()
  @Min(0)
  capacityMin: number;

  @IsInt()
  @Min(1)
  capacityMax: number;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EligibilityRulesDto)
  eligibilityRules?: EligibilityRulesDto;
}

export class UpdateShiftDto extends PartialType(CreateShiftDto) {
  @IsOptional()
  @IsEnum(['DRAFT', 'PUBLISHED', 'FULL', 'CANCELLED', 'COMPLETED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'FULL' | 'CANCELLED' | 'COMPLETED';
}

// ─── Registration ─────────────────────────────────────────────────────────

export class CreateRegistrationDto {
  @IsUUID()
  shiftId: string;
}

export class UpdateRegistrationStatusDto {
  @IsEnum(['ELIGIBLE', 'REGISTERED', 'WAITLISTED', 'ASSIGNED', 'CONFIRMED', 'CANCELLED'])
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
