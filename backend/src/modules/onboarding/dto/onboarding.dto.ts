import { IsEnum, IsString, IsOptional, MaxLength, IsDateString } from 'class-validator';

export class SubmitCredentialDto {
  @IsEnum(['TRAINING', 'BACKGROUND_CHECK', 'LICENSE', 'CERTIFICATION'])
  type: 'TRAINING' | 'BACKGROUND_CHECK' | 'LICENSE' | 'CERTIFICATION';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  providerReference?: string;
  
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ReviewCredentialDto {
  @IsEnum(['APPROVED', 'REJECTED', 'WAIVED'])
  status: 'APPROVED' | 'REJECTED' | 'WAIVED';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
