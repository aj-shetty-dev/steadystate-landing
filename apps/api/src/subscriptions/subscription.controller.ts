import { Body, Controller, Get, Param, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { SubscriptionService } from './subscription.service';

const checkoutBodySchema = z.object({
  plan: z.enum(['STARTER', 'GROWTH', 'SCALE']).default('STARTER'),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const portalBodySchema = z.object({
  returnUrl: z.string().url(),
});

@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  @UseGuards(ClerkAuthGuard)
  @Post('start-trial')
  startTrial(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptions.startTrial(user.tenantId);
  }

  @UseGuards(ClerkAuthGuard)
  @Get('current')
  async current(@CurrentUser() user: AuthenticatedUser) {
    const status = await this.subscriptions.syncStatusFromTrial(user.tenantId);
    const subscription = await this.subscriptions.getCurrent(user.tenantId);
    return { status, subscription };
  }

  @UseGuards(ClerkAuthGuard)
  @Post('checkout')
  async checkout(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { plan, successUrl, cancelUrl } = checkoutBodySchema.parse(body);
    return this.subscriptions.createCheckoutSession(
      user.tenantId,
      user.email,
      plan,
      successUrl,
      cancelUrl,
    );
  }

  @UseGuards(ClerkAuthGuard)
  @Post('portal')
  async portal(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { returnUrl } = portalBodySchema.parse(body);
    return this.subscriptions.createPortalSession(user.tenantId, returnUrl);
  }

  @Post('webhook/:provider')
  async webhook(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    const signature = (req.headers['stripe-signature'] as string) ?? '';
    await this.subscriptions.handleProviderWebhook(provider, rawBody, signature);
    return { received: true };
  }
}
