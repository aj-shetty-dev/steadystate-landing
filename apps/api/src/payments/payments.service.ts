import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from './stripe.service';

export interface EnsureCustomerInput {
  tenantId: string;
  memberId: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  /** Idempotently provisions a Stripe Customer for the given member. */
  async ensureCustomer({ tenantId, memberId }: EnsureCustomerInput): Promise<{ stripeCustomerId: string }> {
    const existing = await this.prisma.stripeCustomer.findUnique({ where: { memberId } });
    if (existing) return { stripeCustomerId: existing.stripeCustomerId };

    const member = await this.prisma.member.findFirst({
      where: { id: memberId, tenantId },
      select: { id: true, fullName: true, email: true, phone: true },
    });
    if (!member) throw new Error('Member not found');

    const cust = await this.stripe.createCustomer({
      email: member.email ?? undefined,
      phone: member.phone ?? undefined,
      name: member.fullName,
      metadata: { tenantId, memberId: member.id },
    });

    const row = await this.prisma.stripeCustomer.create({
      data: { tenantId, memberId, stripeCustomerId: cust.id },
    });
    return { stripeCustomerId: row.stripeCustomerId };
  }

  /** Creates a one-off PaymentIntent for a Sale (POS / drop-in). */
  async createSalePaymentIntent(tenantId: string, saleId: string): Promise<{ clientSecret: string | null; paymentIntentId: string }> {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, tenantId },
      select: { id: true, totalAed: true, memberId: true, paymentStatus: true, stripePaymentIntentId: true, type: true },
    });
    if (!sale) throw new Error('Sale not found');
    if (sale.paymentStatus === PaymentStatus.PAID) throw new Error('Sale already paid');
    if (sale.stripePaymentIntentId) {
      // Idempotency: return existing
      return { clientSecret: null, paymentIntentId: sale.stripePaymentIntentId };
    }
    let customerId: string | undefined;
    if (sale.memberId) {
      const ensured = await this.ensureCustomer({ tenantId, memberId: sale.memberId });
      customerId = ensured.stripeCustomerId;
    }
    const intent = await this.stripe.createPaymentIntent({
      amountAed: sale.totalAed, // already fils
      description: `Sale ${sale.id} (${sale.type})`,
      customerId,
      metadata: { tenantId, saleId: sale.id, kind: 'sale' },
      idempotencyKey: `sale-${sale.id}`,
    });
    await this.prisma.sale.update({
      where: { id: sale.id },
      data: { stripePaymentIntentId: intent.id },
    });
    return { clientSecret: intent.clientSecret, paymentIntentId: intent.id };
  }

  /**
   * Process a verified Stripe webhook event. Idempotent via StripeEvent.eventId UNIQUE.
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<{ handled: boolean; duplicate: boolean }> {
    const dupe = await this.prisma.stripeEvent.findUnique({ where: { eventId: event.id } });
    if (dupe) return { handled: false, duplicate: true };

    await this.prisma.stripeEvent.create({
      data: { eventId: event.id, type: event.type, payload: event as unknown as object },
    });

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await this.markSalePaid(pi.id);
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await this.markSaleFailed(pi.id);
        break;
      }
      default:
        this.logger.log(`Unhandled stripe event ${event.type}`);
    }
    return { handled: true, duplicate: false };
  }

  /** Refund a sale — full or partial. */
  async refundSale(tenantId: string, saleId: string, amountAed?: number): Promise<{ refundId: string; status: string; refundedAed: number; salePaymentStatus: string }> {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, tenantId },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.paymentStatus !== PaymentStatus.PAID && sale.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED) {
      throw new BadRequestException('Only paid sales can be refunded');
    }
    if (!sale.stripePaymentIntentId) {
      throw new BadRequestException('No payment intent to refund');
    }

    const remaining = sale.totalAed - sale.refundedAed;
    const refundAmount = amountAed ?? remaining;
    if (refundAmount <= 0) throw new BadRequestException('Nothing to refund');
    if (refundAmount > remaining) throw new BadRequestException('Refund exceeds remaining amount');

    const refund = await this.stripe.refund(sale.stripePaymentIntentId, refundAmount);

    const newRefunded = sale.refundedAed + refundAmount;
    const newStatus = newRefunded >= sale.totalAed
      ? PaymentStatus.REFUNDED
      : PaymentStatus.PARTIALLY_REFUNDED;

    await this.prisma.sale.update({
      where: { id: saleId },
      data: { refundedAed: newRefunded, paymentStatus: newStatus },
    });

    return { refundId: refund.id, status: refund.status, refundedAed: refundAmount, salePaymentStatus: newStatus };
  }

  /** Creates a payment link for an invoice via Stripe (mock URL in dev). */
  async createCheckoutLink(tenantId: string, memberId: string, totalFils: number, description: string, invoiceId: string): Promise<string> {
    if (!this.stripe.isLive()) {
      return `https://checkout.stripe.com/pay/mock_${invoiceId.slice(0, 8)}`;
    }
    const { stripeCustomerId } = await this.ensureCustomer({ tenantId, memberId });
    const intent = await this.stripe.createPaymentIntent({
      amountAed: totalFils,
      description,
      customerId: stripeCustomerId,
      metadata: { tenantId, invoiceId, kind: 'invoice' },
      idempotencyKey: `invoice-${invoiceId}`,
    });
    // In a real app, a Checkout Session or hosted page would be created here.
    // For now, return the payment intent ID as a reference.
    return `https://dashboard.stripe.com/payments/${intent.id}`;
  }

  private async markSalePaid(paymentIntentId: string): Promise<void> {
    const sale = await this.prisma.sale.findFirst({ where: { stripePaymentIntentId: paymentIntentId } });
    if (!sale) return;
    await this.prisma.sale.update({
      where: { id: sale.id },
      data: { paymentStatus: PaymentStatus.PAID },
    });
  }

  private async markSaleFailed(paymentIntentId: string): Promise<void> {
    const sale = await this.prisma.sale.findFirst({ where: { stripePaymentIntentId: paymentIntentId } });
    if (!sale) return;
    await this.prisma.sale.update({
      where: { id: sale.id },
      data: { paymentStatus: PaymentStatus.FAILED },
    });
  }

}
