import { Body, Controller, Headers, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly stripe: StripeService,
  ) {}

  @Post('sales/:saleId/intent')
  @UseGuards(ClerkAuthGuard)
  createSaleIntent(@CurrentUser() user: AuthenticatedUser, @Param('saleId') saleId: string) {
    return this.payments.createSalePaymentIntent(user.tenantId, saleId);
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers('stripe-signature') signature: string | undefined,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(body));
    const event = this.stripe.constructEvent(raw, signature);
    return this.payments.handleWebhookEvent(event);
  }
}
