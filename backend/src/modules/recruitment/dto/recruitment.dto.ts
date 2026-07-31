import { IsUUID, IsOptional, IsEnum, IsString, MaxLength } from 'class-validator';

export class CreateApplicationDto {
  @IsUUID()
  opportunityId: string;

  @IsOptional()
  formAnswersJson?: Record<string, any>;
}

export class ReviewApplicationDto {
  @IsEnum(['APPROVED', 'REJECTED', 'WAITLISTED', 'REQUEST_INFO'])
  status: 'APPROVED' | 'REJECTED' | 'WAITLISTED' | 'REQUEST_INFO';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
