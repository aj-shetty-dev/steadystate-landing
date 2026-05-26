import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.config';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  tid: string;
  role: UserRole;
}

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  role: UserRole;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(ENV_TOKEN) env: Env,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.JWT_ACCESS_SECRET,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.tenantId !== payload.tid) {
      throw new UnauthorizedException();
    }
    return { id: user.id, tenantId: user.tenantId, role: user.role, email: user.email ?? '' };
  }
}
