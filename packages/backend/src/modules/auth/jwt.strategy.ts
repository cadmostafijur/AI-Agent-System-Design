import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
      issuer: 'replyforce.ai',
    });
  }

  /**
   * Validate JWT payload and return user context.
   * Called automatically by Passport on each authenticated request.
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Check if token is blacklisted (user logged out)
    const isBlacklisted = await this.redis.get(`blacklist:${payload.sub}`);
    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been invalidated');
    }

    // Verify user still exists and is active
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, tenantId: true, role: true, email: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    // Return enriched payload
    return {
      sub: user.id,
      tid: user.tenantId,
      role: user.role,
      email: user.email,
    };
  }
}
