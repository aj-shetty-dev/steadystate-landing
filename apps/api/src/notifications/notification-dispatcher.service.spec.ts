import { Locale } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationDispatcher } from './notification-dispatcher.service';

describe('NotificationDispatcher', () => {
  let whatsapp: { send: ReturnType<typeof vi.fn> };
  let prisma: { member: { findFirst: ReturnType<typeof vi.fn> }; whatsappMessage: { findMany: ReturnType<typeof vi.fn> } };
  let svc: NotificationDispatcher;

  beforeEach(() => {
    whatsapp = { send: vi.fn(async () => ({ messageId: 'm1', sentAt: new Date() })) };
    prisma = {
      member: { findFirst: vi.fn(async () => ({ phone: '+9710' })) },
      whatsappMessage: { findMany: vi.fn(async () => []) },
    };
    svc = new NotificationDispatcher(whatsapp as unknown as never, prisma as unknown as never);
  });

  it('dispatches WhatsApp by default', async () => {
    const r = await svc.dispatch({ tenantId: 't1', to: '+9710', body: 'hi', category: 'test' });
    expect(whatsapp.send).toHaveBeenCalledOnce();
    expect(r.channel).toBe('WHATSAPP');
    expect(r.messageId).toBe('m1');
  });

  it('uses Arabic body when locale=AR and bodyAr present', async () => {
    await svc.dispatch({ tenantId: 't1', to: '+9710', body: 'hi', bodyAr: 'مرحبا', locale: Locale.AR, category: 'test' });
    const call = whatsapp.send.mock.calls[0][0];
    expect(call.request.body).toBe('مرحبا');
  });

  it('falls back to English when AR body missing', async () => {
    await svc.dispatch({ tenantId: 't1', to: '+9710', body: 'hello', locale: Locale.AR, category: 'test' });
    expect(whatsapp.send.mock.calls[0][0].request.body).toBe('hello');
  });

  it('returns null messageId for non-WhatsApp channels', async () => {
    const r = await svc.dispatch({ tenantId: 't1', to: '+9710', body: 'hi', channel: 'EMAIL', category: 'test' });
    expect(r.messageId).toBeNull();
    expect(whatsapp.send).not.toHaveBeenCalled();
  });
});
