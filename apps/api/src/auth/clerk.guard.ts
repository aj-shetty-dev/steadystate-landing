import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyToken } from '@clerk/backend';
import type { Request } from 'express';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.config';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from './jwt.strategy';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  // Avoid a DB round-trip on every request by caching the resolved user for 5 minutes.
  // Role and tenantId almost never change; worst-case stale window is 5 min.
  private readonly userCache = new Map<string, { user: AuthenticatedUser; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }
    const token = authHeader.slice(7);

    let clerkId: string;
    try {
      const payload = await verifyToken(token, {
        secretKey: this.env.CLERK_SECRET_KEY,
      });
      clerkId = payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const cached = this.userCache.get(clerkId);
    if (cached && cached.expiresAt > Date.now()) {
      req.user = cached.user;
      return true;
    }

    const user = await this.prisma.user.findUnique({ where: { clerkId } });
    if (!user) {
      throw new UnauthorizedException('User not provisioned — complete onboarding');
    }

    const authenticatedUser: AuthenticatedUser = { id: user.id, tenantId: user.tenantId, role: user.role, email: user.email };
    this.userCache.set(clerkId, { user: authenticatedUser, expiresAt: Date.now() + this.CACHE_TTL_MS });
    req.user = authenticatedUser;
    return true;
  }
}
