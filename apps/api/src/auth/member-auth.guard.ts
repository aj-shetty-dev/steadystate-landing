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

export interface AuthenticatedMember {
  memberId: string;
  tenantId: string;
  clerkId: string;
}

@Injectable()
export class MemberAuthGuard implements CanActivate {
  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { member?: AuthenticatedMember }>();
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }
    const token = authHeader.slice(7);

    let clerkId: string;
    try {
      const payload = await verifyToken(token, { secretKey: this.env.CLERK_SECRET_KEY });
      clerkId = payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const member = await this.prisma.member.findFirst({
      where: { clerkId },
      select: { id: true, tenantId: true },
    });
    if (!member) {
      throw new UnauthorizedException('Member not linked');
    }

    req.member = { memberId: member.id, tenantId: member.tenantId, clerkId };
    return true;
  }
}
