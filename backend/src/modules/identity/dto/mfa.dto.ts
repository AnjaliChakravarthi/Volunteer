import { IsString, Length } from 'class-validator';

export class MfaVerifyDto {
  /** 6-digit TOTP code from authenticator app */
  @IsString()
  @Length(6, 6)
  code: string;

  /**
   * Temporary token issued after successful password login for users with MFA enabled.
   * Exchanged for a full access+refresh token pair after MFA verification.
   */
  @IsString()
  pendingToken: string;
}

export class MfaSetupConfirmDto {
  /** 6-digit TOTP code to confirm the new secret is correctly configured */
  @IsString()
  @Length(6, 6)
  code: string;
}
