import { ChurnSignalStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChurnNudgeService } from './churn-nudge.service';
import { RamadanGuard } from './ramadan.guard';

type SignalRow = {
  id: string;
  tenantId: string;
  status: ChurnSignalStatus;
  daysSinceLastCheckin: number;
  nudgedAt: Date | null;
  whatsappMessageId: string | null;
  errorMessage: string | null;
  member: { id: string; fullName: string; phone: string | null };
};

function createPrismaStub() {
  const signals = new Map<string, SignalRow>();
  return {
    signals,
    churnSignal: {
      findMany: vi.fn(async ({ where }: { where: { tenantId: string; status: ChurnSignalStatus } }) => {
        return [...signals.values()].filter(
          (s) => s.tenantId === where.tenantId && s.status === where.status,
        );
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<SignalRow> }) => {
          const row = signals.get(where.id);
          if (!row) throw new Error('not found');
          Object.assign(row, data);
          return row;
        },
      ),
    },
    whatsappMessage: {
      findFirst: vi.fn(async () => ({ id: 'wm_1' })),
    },
  };
}

function createWhatsapp(opts: { sendImpl?: (...args: unknown[]) => unknown } = {}) {
  return {
    send: vi.fn(
      opts.sendImpl ??
        (async () => ({
          to: '+971501234567',
          messageId: 'mock_abc',
          sentAt: new Date('2026-05-10T12:00:00Z'),
        })),
    ),
  };
}

describe('ChurnNudgeService', () => {
  let prisma: ReturnType<typeof createPrismaStub>;
  let whatsapp: ReturnType<typeof createWhatsapp>;
  let ramadan: RamadanGuard;
  let service: ChurnNudgeService;

  beforeEach(() => {
    prisma = createPrismaStub();
    whatsapp = createWhatsapp();
    ramadan = new RamadanGuard();
    service = new ChurnNudgeService(prisma as never, whatsapp as never, ramadan);
  });

  it('sends a WhatsApp nudge for each pending signal with a phone', async () => {
    prisma.signals.set('s1', {
      id: 's1',
      tenantId: 't',
      status: ChurnSignalStatus.PENDING,
      daysSinceLastCheckin: 6,
      nudgedAt: null,
      whatsappMessageId: null,
      errorMessage: null,
      member: { id: 'm1', fullName: 'Aisha Al Mansoori', phone: '+971501112233' },
    });

    const result = await service.dispatchPending('t');
    expect(result.sent).toBe(1);
    expect(whatsapp.send).toHaveBeenCalledOnce();
    const sendArg = whatsapp.send.mock.calls[0][0] as { request: { to: string; body: string } };
    expect(sendArg.request.to).toBe('+971501112233');
    expect(sendArg.request.body).toContain('Hi Aisha');
    const updated = prisma.signals.get('s1')!;
    expect(updated.status).toBe(ChurnSignalStatus.NUDGED);
    expect(updated.whatsappMessageId).toBe('wm_1');
    expect(updated.nudgedAt).toBeInstanceOf(Date);
  });

  it('dismisses signals when the member has no phone', async () => {
    prisma.signals.set('s2', {
      id: 's2',
      tenantId: 't',
      status: ChurnSignalStatus.PENDING,
      daysSinceLastCheckin: 7,
      nudgedAt: null,
      whatsappMessageId: null,
      errorMessage: null,
      member: { id: 'm2', fullName: 'Omar', phone: null },
    });
    const result = await service.dispatchPending('t');
    expect(result.skipped).toBe(1);
    expect(whatsapp.send).not.toHaveBeenCalled();
    expect(prisma.signals.get('s2')!.status).toBe(ChurnSignalStatus.DISMISSED);
  });

  it('marks signals FAILED when WhatsApp send throws', async () => {
    whatsapp = createWhatsapp({
      sendImpl: async () => {
        throw new Error('twilio down');
      },
    });
    service = new ChurnNudgeService(prisma as never, whatsapp as never, ramadan);
    prisma.signals.set('s3', {
      id: 's3',
      tenantId: 't',
      status: ChurnSignalStatus.PENDING,
      daysSinceLastCheckin: 8,
      nudgedAt: null,
      whatsappMessageId: null,
      errorMessage: null,
      member: { id: 'm3', fullName: 'Layla', phone: '+971507778899' },
    });
    const result = await service.dispatchPending('t');
    expect(result.failed).toBe(1);
    const row = prisma.signals.get('s3')!;
    expect(row.status).toBe(ChurnSignalStatus.FAILED);
    expect(row.errorMessage).toBe('twilio down');
  });

  it('suppresses all sends when the Ramadan guard says so', async () => {
    vi.spyOn(ramadan, 'shouldSuppressNow').mockReturnValue(true);
    prisma.signals.set('s4', {
      id: 's4',
      tenantId: 't',
      status: ChurnSignalStatus.PENDING,
      daysSinceLastCheckin: 9,
      nudgedAt: null,
      whatsappMessageId: null,
      errorMessage: null,
      member: { id: 'm4', fullName: 'Hassan', phone: '+971502223344' },
    });
    const result = await service.dispatchPending('t');
    expect(result.suppressed).toBe(true);
    expect(result.sent).toBe(0);
    expect(whatsapp.send).not.toHaveBeenCalled();
    expect(prisma.signals.get('s4')!.status).toBe(ChurnSignalStatus.PENDING);
  });
});
