import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.config';
import { PrismaService } from '../prisma/prisma.service';
import { STRIPE_PROVIDER, type StripeProvider } from './stripe.provider';

const TRIAL_DAYS = 14;

const PLAN_PRICE_MAP: Record<string, keyof Pick<Env, 'STRIPE_PRICE_STARTER' | 'STRIPE_PRICE_GROWTH' | 'STRIPE_PRICE_SCALE'>> = {
  STARTER: 'STRIPE_PRICE_STARTER',
  GROWTH: 'STRIPE_PRICE_GROWTH',
  SCALE: 'STRIPE_PRICE_SCALE',
};

function mapStripeStatus(stripeStatus: string): 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED' {
  switch (stripeStatus) {
    case 'active': return 'ACTIVE';
    case 'trialing': return 'TRIALING';
    case 'past_due':
    case 'unpaid': return 'PAST_DUE';
    case 'canceled':
    case 'cancelled': return 'CANCELLED';
    default: return 'EXPIRED';
  }
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV_TOKEN) private readonly env: Env,
    @Inject(STRIPE_PROVIDER) private readonly stripe: StripeProvider,
  ) {}

  async startTrial(tenantId: string, plan: SubscriptionPlan = 'STARTER') {
    const existing = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (existing) return existing;
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    return this.prisma.subscription.create({
      data: {
        tenantId,
        plan,
        status: 'TRIALING',
        trialEndsAt,
        provider: this.env.BILLING_PROVIDER_MODE,
      },
    });
  }

  async getCurrent(tenantId: string) {
    return this.prisma.subscription.findUnique({ where: { tenantId } });
  }

  async syncStatusFromTrial(tenantId: string): Promise<SubscriptionStatus> {
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub) return 'EXPIRED';
    if (sub.status === 'TRIALING' && sub.trialEndsAt && sub.trialEndsAt.getTime() <= Date.now()) {
      await this.prisma.subscription.update({
        where: { tenantId },
        data: { status: 'EXPIRED' },
      });
      return 'EXPIRED';
    }
    return sub.status;
  }

  async createCheckoutSession(
    tenantId: string,
    tenantEmail: string,
    plan: SubscriptionPlan,
    successUrl: string,
    cancelUrl: string,
  ): Promise<{ url: string }> {
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });

    let stripeCustomerId = sub?.stripeCustomerId ?? null;
    if (!stripeCustomerId) {
      const { customerId } = await this.stripe.createCustomer(tenantEmail, tenantId);
      stripeCustomerId = customerId;
      if (sub) {
        await this.prisma.subscription.update({
          where: { tenantId },
          data: { stripeCustomerId },
        });
      }
    }

    const priceEnvKey = PLAN_PRICE_MAP[plan];
    if (!priceEnvKey) throw new BadRequestException(`Unknown plan: ${plan}`);
    const priceId = this.env[priceEnvKey];

    const { url } = await this.stripe.createCheckoutSession({
      tenantId,
      plan,
      stripeCustomerId,
      successUrl,
      cancelUrl,
      priceId,
    });

    return { url };
  }

  async createPortalSession(tenantId: string, returnUrl: string): Promise<{ url: string }> {
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub?.stripeCustomerId) {
      throw new NotFoundException('No Stripe customer found. Complete a checkout first.');
    }
    return this.stripe.createPortalSession({
      stripeCustomerId: sub.stripeCustomerId,
      returnUrl,
    });
  }

  async handleProviderWebhook(provider: string, rawBody: Buffer, signature: string): Promise<void> {
    if (this.env.BILLING_PROVIDER_MODE === 'mock') return;

    if (provider !== 'stripe') {
      this.logger.warn(`Unhandled webhook provider: ${provider}`);
      return;
    }

    let event: ReturnType<StripeProvider['constructWebhookEvent']>;
    try {
      event = this.stripe.constructWebhookEvent(rawBody, signature);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Stripe webhook signature verification failed: ${msg}`);
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    await this.processStripeEvent(event.type, event.data.object);
  }

  private async processStripeEvent(type: string, obj: Record<string, unknown>): Promise<void> {
    switch (type) {
      case 'checkout.session.completed': {
        const meta = obj['metadata'] as Record<string, string> | undefined;
        const tenantId = meta?.['tenantId'];
        const subscriptionId = obj['subscription'] as string | undefined;
        const customerId = obj['customer'] as string | undefined;
        if (!tenantId || !subscriptionId || !customerId) break;
        await this.prisma.subscription.upsert({
          where: { tenantId },
          create: { tenantId, status: 'ACTIVE', stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId, provider: 'stripe' },
          update: { status: 'ACTIVE', stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId, provider: 'stripe' },
        });
        this.logger.log(`checkout.session.completed → tenant=${tenantId} ACTIVE`);
        break;
      }

      case 'customer.subscription.updated': {
        const stripeSubId = obj['id'] as string;
        const status = mapStripeStatus(obj['status'] as string);
        const periodStart = obj['current_period_start'] as number | undefined;
        const periodEnd = obj['current_period_end'] as number | undefined;
        await this.prisma.subscription.updateMany({
          where: { stripeSubscriptionId: stripeSubId },
          data: {
            status,
            currentPeriodStart: periodStart ? new Date(periodStart * 1000) : undefined,
            currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : undefined,
          },
        });
        this.logger.log(`subscription.updated ${stripeSubId} → ${status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const stripeSubId = obj['id'] as string;
        await this.prisma.subscription.updateMany({
          where: { stripeSubscriptionId: stripeSubId },
          data: { status: 'CANCELLED' },
        });
        this.logger.log(`subscription.deleted ${stripeSubId} → CANCELLED`);
        break;
      }

      case 'invoice.payment_succeeded': {
        const stripeSubId = obj['subscription'] as string | undefined;
        if (!stripeSubId) break;
        await this.prisma.subscription.updateMany({
          where: { stripeSubscriptionId: stripeSubId },
          data: { status: 'ACTIVE' },
        });
        break;
      }

      case 'invoice.payment_failed': {
        const stripeSubId = obj['subscription'] as string | undefined;
        if (!stripeSubId) break;
        await this.prisma.subscription.updateMany({
          where: { stripeSubscriptionId: stripeSubId },
          data: { status: 'PAST_DUE' },
        });
        this.logger.warn(`invoice.payment_failed sub=${stripeSubId} → PAST_DUE`);
        break;
      }

      default:
        this.logger.debug(`Unhandled Stripe event: ${type}`);
    }
  }
}
