import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActiveSubscriptionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true;

    const sub = await this.prisma.subscription.findUnique({ where: { tenantId: user.tenantId } });
    if (!sub) {
      throw new HttpException('No subscription', HttpStatus.PAYMENT_REQUIRED);
    }
    if (sub.status === 'EXPIRED' || sub.status === 'CANCELLED') {
      throw new HttpException('Subscription inactive', HttpStatus.PAYMENT_REQUIRED);
    }
    if (sub.status === 'TRIALING' && sub.trialEndsAt && sub.trialEndsAt.getTime() <= Date.now()) {
      await this.prisma.subscription.update({
        where: { tenantId: user.tenantId },
        data: { status: 'EXPIRED' },
      });
      throw new HttpException('Trial expired', HttpStatus.PAYMENT_REQUIRED);
    }
    return true;
  }
}
