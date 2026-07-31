import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../../../common/types/jwt-payload.interface';

/**
 * JWT strategy — validates the access token and attaches its payload to request.user.
 * Tokens are extracted from the Authorization: Bearer header.
 * Refresh tokens are intentionally NOT JWTs and are NOT handled here.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    // Additional validation: reject tokens not of type 'access'
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type.');
    }
    return payload;
  }
}
