import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockWhatsappProvider } from './mock-whatsapp.provider';
import { WhatsappService } from './whatsapp.service';

type WhatsappMessageRow = {
  id: string;
  status: string;
  providerMessageId: string | null;
  errorMessage: string | null;
};

function createPrismaStub() {
  const rows = new Map<string, WhatsappMessageRow>();
  let counter = 0;
  return {
    rows,
    whatsappMessage: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `msg_${++counter}`;
        const row: WhatsappMessageRow = {
          id,
          status: 'QUEUED',
          providerMessageId: null,
          errorMessage: null,
        };
        rows.set(id, row);
        return { ...row, ...data };
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<WhatsappMessageRow>;
        }) => {
          const existing = rows.get(where.id);
          if (!existing) throw new Error('not found');
          Object.assign(existing, data);
          return existing;
        },
      ),
    },
  };
}

describe('WhatsappService', () => {
  let provider: MockWhatsappProvider;
  let prisma: ReturnType<typeof createPrismaStub>;
  let service: WhatsappService;

  beforeEach(() => {
    provider = new MockWhatsappProvider();
    prisma = createPrismaStub();
    service = new WhatsappService(provider, prisma as never);
  });

  it('sends a message via the provider and records it as SENT', async () => {
    const result = await service.send({
      tenantId: 't1',
      request: { to: '+971501234567', body: 'hello', locale: 'en' },
    });

    expect(result.to).toBe('+971501234567');
    expect(result.messageId).toMatch(/^mock_/);
    expect(prisma.whatsappMessage.create).toHaveBeenCalledOnce();
    expect(prisma.whatsappMessage.update).toHaveBeenCalledOnce();
    const row = [...prisma.rows.values()][0];
    expect(row.status).toBe('SENT');
    expect(row.providerMessageId).toBe(result.messageId);
  });

  it('marks the row FAILED when the provider throws', async () => {
    vi.spyOn(provider, 'send').mockRejectedValueOnce(new Error('twilio down'));
    await expect(
      service.send({
        tenantId: 't1',
        request: { to: '+971501234567', body: 'hi', locale: 'en' },
      }),
    ).rejects.toThrow(/twilio down/);
    const row = [...prisma.rows.values()][0];
    expect(row.status).toBe('FAILED');
    expect(row.errorMessage).toBe('twilio down');
  });

  it('rejects invalid phone numbers before persisting', async () => {
    await expect(
      service.send({
        tenantId: 't1',
        request: { to: '0501234567', body: 'hi', locale: 'en' },
      }),
    ).rejects.toThrow();
    expect(prisma.whatsappMessage.create).not.toHaveBeenCalled();
  });

  it('records templateName when provided', async () => {
    await service.send({
      tenantId: 't1',
      request: { to: '+971501234567', body: 'welcome!', templateName: 'onboarding', locale: 'en' },
    });
    const createCall = prisma.whatsappMessage.create.mock.calls[0][0] as { data: { templateName: string | null } };
    expect(createCall.data.templateName).toBe('onboarding');
  });

  it('records QUEUED then SENT lifecycle', async () => {
    const createOrder: string[] = [];
    const updateCalls: Array<{ status: string }> = [];
    prisma.whatsappMessage.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      createOrder.push('create');
      return { id: 'msg_lifecycle', ...data };
    });
    prisma.whatsappMessage.update.mockImplementation(async ({ data }: { where: { id: string }; data: Partial<WhatsappMessageRow> }) => {
      updateCalls.push({ status: data.status ?? 'UNKNOWN' });
      return { id: 'msg_lifecycle', status: data.status ?? 'UNKNOWN', providerMessageId: null, errorMessage: null };
    });

    await service.send({
      tenantId: 't1',
      request: { to: '+971501234567', body: 'lifecycle test', locale: 'en' },
    });

    // First created as QUEUED
    expect(prisma.whatsappMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'QUEUED' }) }),
    );
    // Then updated to SENT
    expect(prisma.whatsappMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }),
    );
  });
});
