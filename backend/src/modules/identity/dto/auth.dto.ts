import { IsString } from 'class-validator';

export class RefreshTokenDto {
  /**
   * The raw refresh token value.
   * Clients should pass this via httpOnly cookie (handled by the controller's
   * cookie-parser setup). This DTO is used only when cookie is not available
   * (e.g., native mobile client that cannot use cookies).
   */
  @IsString()
  refreshToken: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  newPassword: string;
}
