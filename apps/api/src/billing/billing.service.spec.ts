import { InvoiceStatus, PaymentAttemptOutcome } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingService, renderBillingReminder } from './billing.service';

interface InvoiceRow {
  id: string;
  tenantId: string;
  memberId: string;
  amountAed: number;
  vatAed: number;
  status: InvoiceStatus;
  attempts: AttemptRow[];
  member: { id: string; fullName: string; phone: string | null; preferredLocale: 'EN' | 'AR' };
}

interface AttemptRow {
  id: string;
  tenantId: string;
  invoiceId: string;
  outcome: PaymentAttemptOutcome;
  scheduledFor: Date;
  attemptedAt: Date | null;
  providerResponse: unknown;
  invoice?: InvoiceRow;
}

function makeStub() {
  const invoices = new Map<string, InvoiceRow>();
  const attempts = new Map<string, AttemptRow>();
  let attemptSeq = 0;

  const stub = {
    invoices,
    attempts,
    salaryWindow: { findUnique: vi.fn(async () => null) },
    invoice: {
      findMany: vi.fn(async (args: { where: { tenantId: string; status: InvoiceStatus }; include?: { attempts?: { where: { outcome: PaymentAttemptOutcome } } } }) => {
        const { where, include } = args;
        const rows = [...invoices.values()].filter((i) => i.tenantId === where.tenantId && i.status === where.status);
        return rows.map((r) => ({
          ...r,
          attempts: include?.attempts
            ? r.attempts.filter((a) => a.outcome === include.attempts!.where.outcome)
            : r.attempts,
        }));
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Partial<InvoiceRow> }) => {
        const row = invoices.get(args.where.id);
        if (!row) throw new Error('invoice not found');
        Object.assign(row, args.data);
        return row;
      }),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    paymentAttempt: {
      create: vi.fn(async (args: { data: { tenantId: string; invoiceId: string; outcome: PaymentAttemptOutcome; scheduledFor: Date } }) => {
        const { data } = args;
        const id = `pa_${++attemptSeq}`;
        const row: AttemptRow = {
          id,
          tenantId: data.tenantId,
          invoiceId: data.invoiceId,
          outcome: data.outcome,
          scheduledFor: data.scheduledFor,
          attemptedAt: null,
          providerResponse: null,
        };
        attempts.set(id, row);
        invoices.get(data.invoiceId)?.attempts.push(row);
        return row;
      }),
      findMany: vi.fn(async (args: { where: { tenantId: string; outcome: PaymentAttemptOutcome; scheduledFor: { lte: Date } } }) => {
        const { where } = args;
        return [...attempts.values()]
          .filter((a) => a.tenantId === where.tenantId && a.outcome === where.outcome && a.scheduledFor.getTime() <= where.scheduledFor.lte.getTime())
          .map((a) => ({ ...a, invoice: invoices.get(a.invoiceId) }));
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Partial<AttemptRow> }) => {
        const row = attempts.get(args.where.id);
        if (!row) throw new Error('attempt not found');
        Object.assign(row, args.data);
        return row;
      }),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return stub;
}

describe('BillingService.scheduleRetries', () => {
  let stub: ReturnType<typeof makeStub>;
  let whatsapp: { send: ReturnType<typeof vi.fn> };
  let svc: BillingService;

  beforeEach(() => {
    stub = makeStub();
    whatsapp = { send: vi.fn(async () => ({ to: '+971501112233', messageId: 'm1', sentAt: new Date() })) };
    svc = new BillingService(stub as never, whatsapp as never);
  });

  it('schedules a pending attempt for each FAILED invoice with no pending attempt', async () => {
    stub.invoices.set('i1', {
      id: 'i1', tenantId: 't', memberId: 'm', amountAed: 10000, vatAed: 500,
      status: InvoiceStatus.FAILED, attempts: [],
      member: { id: 'm', fullName: 'Aisha', phone: '+971501112233', preferredLocale: 'EN' },
    });
    const result = await svc.scheduleRetries('t', new Date('2026-05-20T00:00:00Z'));
    expect(result).toEqual({ eligible: 1, scheduled: 1, alreadyScheduled: 0 });
    expect(stub.invoices.get('i1')!.status).toBe(InvoiceStatus.RETRY_SCHEDULED);
  });

  it('skips invoices that already have a pending attempt', async () => {
    const inv: InvoiceRow = {
      id: 'i2', tenantId: 't', memberId: 'm', amountAed: 5000, vatAed: 0,
      status: InvoiceStatus.FAILED,
      attempts: [{ id: 'pa_pre', tenantId: 't', invoiceId: 'i2', outcome: PaymentAttemptOutcome.PENDING, scheduledFor: new Date(), attemptedAt: null, providerResponse: null }],
      member: { id: 'm', fullName: 'Omar', phone: '+971501112234', preferredLocale: 'EN' },
    };
    stub.invoices.set('i2', inv);
    const result = await svc.scheduleRetries('t', new Date('2026-05-20T00:00:00Z'));
    expect(result).toEqual({ eligible: 1, scheduled: 0, alreadyScheduled: 1 });
    expect(inv.status).toBe(InvoiceStatus.FAILED);
  });
});

describe('BillingService.processDueRetries', () => {
  let stub: ReturnType<typeof makeStub>;
  let whatsapp: { send: ReturnType<typeof vi.fn> };
  let svc: BillingService;

  beforeEach(() => {
    stub = makeStub();
    whatsapp = { send: vi.fn(async () => ({ to: '+971501112233', messageId: 'm1', sentAt: new Date() })) };
    svc = new BillingService(stub as never, whatsapp as never);
  });

  it('sends WhatsApp reminder + marks attempt SKIPPED (real retry stubbed)', async () => {
    const inv: InvoiceRow = {
      id: 'i1', tenantId: 't', memberId: 'm', amountAed: 10000, vatAed: 500,
      status: InvoiceStatus.RETRY_SCHEDULED, attempts: [],
      member: { id: 'm', fullName: 'Aisha Al Mansoori', phone: '+971501112233', preferredLocale: 'EN' },
    };
    stub.invoices.set('i1', inv);
    const att: AttemptRow = {
      id: 'pa_1', tenantId: 't', invoiceId: 'i1', outcome: PaymentAttemptOutcome.PENDING,
      scheduledFor: new Date('2026-05-26T08:00:00Z'), attemptedAt: null, providerResponse: null,
    };
    stub.attempts.set('pa_1', att);
    inv.attempts.push(att);

    const result = await svc.processDueRetries('t', new Date('2026-05-26T09:00:00Z'));
    expect(result.notified).toBe(1);
    expect(whatsapp.send).toHaveBeenCalledOnce();
    expect(att.outcome).toBe(PaymentAttemptOutcome.SKIPPED);
  });

  it('skips attempts whose member has no phone', async () => {
    const inv: InvoiceRow = {
      id: 'i1', tenantId: 't', memberId: 'm', amountAed: 10000, vatAed: 0,
      status: InvoiceStatus.RETRY_SCHEDULED, attempts: [],
      member: { id: 'm', fullName: 'Layla', phone: null, preferredLocale: 'EN' },
    };
    stub.invoices.set('i1', inv);
    const att: AttemptRow = {
      id: 'pa_2', tenantId: 't', invoiceId: 'i1', outcome: PaymentAttemptOutcome.PENDING,
      scheduledFor: new Date('2026-05-26T08:00:00Z'), attemptedAt: null, providerResponse: null,
    };
    stub.attempts.set('pa_2', att);
    inv.attempts.push(att);
    const result = await svc.processDueRetries('t', new Date('2026-05-26T09:00:00Z'));
    expect(result.notified).toBe(0);
    expect(att.outcome).toBe(PaymentAttemptOutcome.SKIPPED);
    expect(whatsapp.send).not.toHaveBeenCalled();
  });

  it('marks attempt FAILED if WhatsApp throws', async () => {
    whatsapp.send.mockRejectedValueOnce(new Error('twilio down'));
    const inv: InvoiceRow = {
      id: 'i1', tenantId: 't', memberId: 'm', amountAed: 10000, vatAed: 0,
      status: InvoiceStatus.RETRY_SCHEDULED, attempts: [],
      member: { id: 'm', fullName: 'Aisha', phone: '+971501112233', preferredLocale: 'EN' },
    };
    stub.invoices.set('i1', inv);
    const att: AttemptRow = {
      id: 'pa_3', tenantId: 't', invoiceId: 'i1', outcome: PaymentAttemptOutcome.PENDING,
      scheduledFor: new Date('2026-05-26T08:00:00Z'), attemptedAt: null, providerResponse: null,
    };
    stub.attempts.set('pa_3', att);
    inv.attempts.push(att);
    const result = await svc.processDueRetries('t', new Date('2026-05-26T09:00:00Z'));
    expect(result.failed).toBe(1);
    expect(att.outcome).toBe(PaymentAttemptOutcome.FAILED);
  });
});

describe('BillingService.listInvoices()', () => {
  let stub: ReturnType<typeof makeStub>;
  let svc: BillingService;

  beforeEach(() => {
    stub = makeStub();
    svc = new BillingService(stub as never, { send: vi.fn() } as never);
  });

  it('passes memberId to both findMany and count when provided', async () => {
    stub.invoice.findMany.mockResolvedValue([]);
    stub.invoice.count.mockResolvedValue(0);

    await svc.listInvoices('t', 1, 10, 'member-abc');

    expect(stub.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't', memberId: 'member-abc' }),
      }),
    );
    expect(stub.invoice.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ memberId: 'member-abc' }) }),
    );
  });

  it('does not include memberId in where when not provided', async () => {
    stub.invoice.findMany.mockResolvedValue([]);
    stub.invoice.count.mockResolvedValue(0);

    await svc.listInvoices('t', 1, 10);

    const call = stub.invoice.findMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(call[0].where).not.toHaveProperty('memberId');
  });

  it('returns correct pagination shape', async () => {
    stub.invoice.findMany.mockResolvedValue([{ id: 'inv-1' }] as never);
    stub.invoice.count.mockResolvedValue(1);

    const result = await svc.listInvoices('t', 1, 10);

    expect(result).toMatchObject({ items: [{ id: 'inv-1' }], total: 1, page: 1, pageSize: 10 });
  });

  it('clamps pageSize to 100', async () => {
    stub.invoice.findMany.mockResolvedValue([]);
    stub.invoice.count.mockResolvedValue(0);

    const result = await svc.listInvoices('t', 1, 999);

    expect(result.pageSize).toBe(100);
  });
});

describe('BillingService.getWindow', () => {
  let stub: ReturnType<typeof makeStub>;
  let svc: BillingService;

  beforeEach(() => {
    stub = makeStub();
    svc = new BillingService(stub as never, { send: vi.fn() } as never);
  });

  it('returns default config when no tenant override exists', async () => {
    const window = await svc.getWindow('t');
    expect(window.startDay).toBe(25);
    expect(window.endDay).toBe(28);
    expect(window.timezone).toBe('Asia/Dubai');
  });

  it('returns tenant-specific overrides when set', async () => {
    stub.salaryWindow.findUnique.mockResolvedValue({
      tenantId: 't',
      startDay: 20,
      endDay: 22,
      timezone: 'Asia/Muscat',
      jitterMinutes: 30,
    });
    const window = await svc.getWindow('t');
    expect(window.startDay).toBe(20);
    expect(window.endDay).toBe(22);
    expect(window.timezone).toBe('Asia/Muscat');
  });
});

describe('BillingService.markInvoiceFailed', () => {
  let stub: ReturnType<typeof makeStub>;
  let svc: BillingService;

  beforeEach(() => {
    stub = makeStub();
    svc = new BillingService(stub as never, { send: vi.fn() } as never);
  });

  it('marks an invoice as FAILED', async () => {
    const inv: InvoiceRow = {
      id: 'i1', tenantId: 't', memberId: 'm', amountAed: 10000, vatAed: 500,
      status: InvoiceStatus.DUE, attempts: [],
      member: { id: 'm', fullName: 'Aisha', phone: '+971501112233', preferredLocale: 'EN' },
    };
    stub.invoices.set('i1', inv);
    stub.invoice.findFirst.mockResolvedValue(inv);
    await svc.markInvoiceFailed('t', 'i1');
    expect(inv.status).toBe(InvoiceStatus.FAILED);
  });

  it('throws NotFound for unknown invoice', async () => {
    stub.invoice.findFirst.mockResolvedValue(null);
    await expect(svc.markInvoiceFailed('t', 'ghost')).rejects.toThrow('Invoice not found');
  });
});

describe('BillingService.listInvoices with filters', () => {
  let stub: ReturnType<typeof makeStub>;
  let svc: BillingService;

  beforeEach(() => {
    stub = makeStub();
    svc = new BillingService(stub as never, { send: vi.fn() } as never);
  });

  it('includes status filter when provided', async () => {
    stub.invoice.findMany.mockResolvedValue([]);
    stub.invoice.count.mockResolvedValue(0);
    await svc.listInvoices('t', 1, 10, undefined, 'DUE');
    expect(stub.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'DUE' }) }),
    );
  });

  it('includes search filter when provided', async () => {
    stub.invoice.findMany.mockResolvedValue([]);
    stub.invoice.count.mockResolvedValue(0);
    await svc.listInvoices('t', 1, 10, undefined, undefined, 'Aisha');
    expect(stub.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ member: { fullName: { contains: 'Aisha', mode: 'insensitive' } } }),
      }),
    );
  });
});

describe('renderBillingReminder', () => {
  it('uses Arabic when locale is AR', () => {
    const out = renderBillingReminder({ firstName: 'Aisha', amountAed: 250, locale: 'AR' });
    expect(out).toContain('Aisha');
    expect(out).toContain('250.00');
    expect(out).toMatch(/[\u0600-\u06FF]/);
  });
  it('uses English when locale is EN', () => {
    const out = renderBillingReminder({ firstName: 'Omar', amountAed: 99.5, locale: 'EN' });
    expect(out).toContain('Omar');
    expect(out).toContain('99.50');
    expect(out).toContain('AED');
  });
});
