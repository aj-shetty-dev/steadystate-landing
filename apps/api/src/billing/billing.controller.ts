import { BadRequestException, Body, Controller, DefaultValuePipe, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { BillingService } from './billing.service';

const createInvoiceSchema = z.object({
  memberId: z.string().uuid(),
  amountAed: z.number().int().nonnegative(),
  vatAed: z.number().int().nonnegative().default(0),
  dueDate: z.string().datetime(),
  description: z.string().max(500).optional(),
  externalRef: z.string().max(120).optional(),
});

const updateInvoiceSchema = z.object({
  amountAed: z.number().int().nonnegative().optional(),
  vatAed: z.number().int().nonnegative().optional(),
  dueDate: z.string().datetime().optional(),
  description: z.string().max(500).nullable().optional(),
  externalRef: z.string().max(120).nullable().optional(),
});

const salaryWindowSchema = z.object({
  startDay: z.number().int().min(1).max(28).optional(),
  endDay: z.number().int().min(1).max(31).optional(),
  timezone: z.string().optional(),
  jitterMinutes: z.number().int().min(0).max(1440).optional(),
});

function toDate(d: string | Date): Date {
  return d instanceof Date ? d : new Date(d);
}

function renderInvoiceHtml(invoice: { id: string; amountAed: number; vatAed: number; dueDate: string | Date; createdAt: string | Date; description: string | null }, member: { fullName: string; phone: string | null }): string {
  const totalAed = ((invoice.amountAed + invoice.vatAed) / 100).toFixed(2);
  const subtotalAed = (invoice.amountAed / 100).toFixed(2);
  const vatAed = (invoice.vatAed / 100).toFixed(2);
  const due = toDate(invoice.dueDate).toLocaleDateString('en-GB');
  const created = toDate(invoice.createdAt).toLocaleDateString('en-GB');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Invoice ${invoice.id.slice(0, 8)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;color:#1a1a1a}
.header{border-bottom:2px solid #16a34a;padding-bottom:16px;margin-bottom:24px}
.header h1{font-size:24px;margin:0;color:#16a34a}.header p{margin:4px 0;color:#666;font-size:14px}
.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}
.row .label{color:#666}.total{font-weight:700;font-size:18px;border-top:2px solid #16a34a;margin-top:8px;padding-top:8px}
.footer{margin-top:32px;font-size:12px;color:#999;text-align:center}</style></head><body>
<div class="header"><h1>SteadyState Invoice</h1><p>#${invoice.id.slice(0, 8)} &middot; Issued ${created} &middot; Due ${due}</p></div>
<h2>Bill To</h2><p style="font-size:16px;font-weight:600">${member.fullName}</p>
${member.phone ? `<p style="color:#666;font-size:14px">${member.phone}</p>` : ''}
<div class="row"><span class="label">Description</span><span>${invoice.description ?? 'Membership renewal'}</span></div>
<div class="row"><span class="label">Subtotal</span><span>AED ${subtotalAed}</span></div>
<div class="row"><span class="label">VAT</span><span>AED ${vatAed}</span></div>
<div class="row total"><span>Total Due</span><span>AED ${totalAed}</span></div>
<div class="footer"><p>SteadyState &mdash; Thank you for your business.</p></div>
</body></html>`;
}

@Controller('billing')
@UseGuards(ClerkAuthGuard)
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  // ── Invoice CRUD ──

  @Get('invoices')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(25), ParseIntPipe) pageSize: number,
    @Query('memberId') memberId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.billing.listInvoices(user.tenantId, page, pageSize, memberId, status, search);
  }

  @Get('invoices/:id')
  async getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        member: { select: { id: true, fullName: true, phone: true, email: true } },
        attempts: { orderBy: { scheduledFor: 'desc' }, take: 20 },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  @Post('invoices')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = createInvoiceSchema.parse(body);
    const member = await this.prisma.member.findFirst({
      where: { id: parsed.memberId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!member) throw new Error('Member not found');
    return this.prisma.invoice.create({
      data: {
        tenantId: user.tenantId,
        memberId: parsed.memberId,
        amountAed: parsed.amountAed,
        vatAed: parsed.vatAed,
        dueDate: new Date(parsed.dueDate),
        description: parsed.description ?? null,
        externalRef: parsed.externalRef ?? null,
      },
    });
  }

  @Patch('invoices/:id')
  async update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    const parsed = updateInvoiceSchema.parse(body);
    const invoice = await this.prisma.invoice.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== InvoiceStatus.DUE) {
      throw new BadRequestException('Only DUE invoices can be edited');
    }
    return this.prisma.invoice.update({
      where: { id },
      data: {
        ...(parsed.amountAed !== undefined ? { amountAed: parsed.amountAed } : {}),
        ...(parsed.vatAed !== undefined ? { vatAed: parsed.vatAed } : {}),
        ...(parsed.dueDate !== undefined ? { dueDate: new Date(parsed.dueDate) } : {}),
        ...(parsed.description !== undefined ? { description: parsed.description } : {}),
        ...(parsed.externalRef !== undefined ? { externalRef: parsed.externalRef } : {}),
      },
    });
  }

  @Post('invoices/:id/void')
  async voidInvoice(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.PAID) throw new BadRequestException('Cannot void a paid invoice');
    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.WRITTEN_OFF },
    });
  }

  @Post('invoices/:id/write-off')
  async writeOff(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.PAID) throw new BadRequestException('Cannot write off a paid invoice');
    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.WRITTEN_OFF },
    });
  }

  @Post('invoices/mark-failed')
  async markFailed(@CurrentUser() user: AuthenticatedUser, @Body() body: { invoiceId: string }) {
    await this.billing.markInvoiceFailed(user.tenantId, body.invoiceId);
    return { ok: true };
  }

  // ── PDF / HTML ──

  @Get('invoices/:id/html')
  async html(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { member: { select: { id: true, fullName: true, phone: true, email: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const html = renderInvoiceHtml(invoice, invoice.member);
    return { html };
  }

  // ── Payment Link ──

  @Post('invoices/:id/payment-link')
  async paymentLink(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { member: { select: { fullName: true, phone: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.PAID) throw new BadRequestException('Invoice already paid');

    const totalFils = invoice.amountAed + invoice.vatAed;
    const url = await this.payments.createCheckoutLink(
      user.tenantId,
      invoice.memberId,
      totalFils,
      `Invoice #${invoice.id.slice(0, 8)}`,
      invoice.id,
    );
    return { url };
  }

  // ── Retries ──

  @Post('retries/schedule')
  schedule(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.scheduleRetries(user.tenantId);
  }

  @Post('retries/process')
  process(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.processDueRetries(user.tenantId);
  }

  // ── Salary Window ──

  @Get('salary-window')
  getSalaryWindow(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.salaryWindow.findUnique({ where: { tenantId: user.tenantId } });
  }

  @Put('salary-window')
  async updateSalaryWindow(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = salaryWindowSchema.parse(body);
    if (parsed.startDay && parsed.endDay && parsed.startDay > parsed.endDay) {
      throw new BadRequestException('startDay cannot be after endDay');
    }
    return this.prisma.salaryWindow.upsert({
      where: { tenantId: user.tenantId },
      create: { tenantId: user.tenantId, ...parsed },
      update: parsed,
    });
  }

  // ── Reconciliation ──

  @Get('reconciliation')
  async reconciliation(@CurrentUser() user: AuthenticatedUser) {
    const tenantId = user.tenantId;

    const [posSales, invoices, memberCount] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { tenantId, paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] } },
        _sum: { totalAed: true, vatAed: true },
      }),
      this.prisma.invoice.aggregate({
        where: { tenantId, status: { in: ['PAID', 'DUE', 'RETRY_SCHEDULED'] } },
        _sum: { amountAed: true, vatAed: true },
      }),
      this.prisma.member.count({ where: { tenantId, membershipStatus: 'ACTIVE' } }),
    ]);

    const posTotalAed = (posSales._sum.totalAed ?? 0) / 100;
    const invoiceTotalAed = ((invoices._sum.amountAed ?? 0) + (invoices._sum.vatAed ?? 0)) / 100;
    const expectedMonthly = memberCount * 200; // rough estimate

    return {
      posRevenueAed: posTotalAed.toFixed(2),
      invoiceRevenueAed: invoiceTotalAed.toFixed(2),
      totalRevenueAed: (posTotalAed + invoiceTotalAed).toFixed(2),
      activeMembers: memberCount,
      estimatedMonthlyAed: expectedMonthly.toFixed(2),
    };
  }
}
