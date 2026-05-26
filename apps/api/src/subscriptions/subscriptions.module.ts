import { Module } from '@nestjs/common';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.config';
import { PrismaModule } from '../prisma/prisma.module';
import { LiveStripeProvider } from './live-stripe.provider';
import { MockStripeProvider } from './mock-stripe.provider';
import { STRIPE_PROVIDER } from './stripe.provider';
import { ActiveSubscriptionGuard } from './active-subscription.guard';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';

@Module({
  imports: [PrismaModule],
  controllers: [SubscriptionController],
  providers: [
    MockStripeProvider,
    LiveStripeProvider,
    {
      provide: STRIPE_PROVIDER,
      inject: [ENV_TOKEN, MockStripeProvider, LiveStripeProvider],
      useFactory: (env: Env, mock: MockStripeProvider, live: LiveStripeProvider) =>
        env.STRIPE_MODE === 'live' ? live : mock,
    },
    SubscriptionService,
    ActiveSubscriptionGuard,
  ],
  exports: [SubscriptionService, ActiveSubscriptionGuard],
})
export class SubscriptionsModule {}
