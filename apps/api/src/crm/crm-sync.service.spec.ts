import { CrmConnectionStatus, CrmProvider as PrismaCrmProvider } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.config';
import { CrmConnectorFactory } from './crm-connector.factory';
import { CrmSyncService } from './crm-sync.service';
import { MembersRepository } from './members.repository';

type Connection = {
  id: string;
  tenantId: string;
  provider: PrismaCrmProvider;
  credentials: object;
  status: CrmConnectionStatus;
  lastSyncAt: Date | null;
};

function createPrismaStub() {
  const connections = new Map<string, Connection>();
  const members = new Map<string, Record<string, unknown>>();
  return {
    connections,
    members,
    crmConnection: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        const c = connections.get(where.id);
        return c && c.tenantId === where.tenantId ? c : null;
      }),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Omit<Connection, 'id' | 'lastSyncAt'> }) => {
        const id = `conn_${connections.size + 1}`;
        const row: Connection = { id, lastSyncAt: null, ...data };
        connections.set(id, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Connection> }) => {
        const c = connections.get(where.id);
        if (!c) throw new Error('not found');
        Object.assign(c, data);
        return c;
      }),
    },
    member: {
      upsert: vi.fn(
        async ({
          where,
          create,
        }: {
          where: { tenantId_provider_externalId: { tenantId: string; provider: PrismaCrmProvider; externalId: string } };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const key = `${where.tenantId_provider_externalId.tenantId}|${where.tenantId_provider_externalId.provider}|${where.tenantId_provider_externalId.externalId}`;
          members.set(key, create);
          return create;
        },
      ),
    },
  };
}

const fakeEnv: Env = {
  NODE_ENV: 'test',
  PORT: 4000,
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  JWT_REFRESH_SECRET: 'x'.repeat(32),
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '7d',
  TWILIO_MODE: 'mock',
  TWILIO_ACCOUNT_SID: '',
  TWILIO_AUTH_TOKEN: '',
  TWILIO_WHATSAPP_FROM: 'whatsapp:+14155238886',
  CRM_MODE: 'fake',
  CLERK_SECRET_KEY: '',
  STRIPE_MODE: 'mock' as const,
  STRIPE_SECRET_KEY: '',
  STRIPE_WEBHOOK_SECRET: '',
  STRIPE_DEFAULT_CURRENCY: 'aed',
  STRIPE_PRICE_STARTER: 'price_mock_starter',
  STRIPE_PRICE_GROWTH: 'price_mock_growth',
  STRIPE_PRICE_SCALE: 'price_mock_scale',
  KIOSK_STAFF_PIN_LENGTH: 4,
  DOOR_WEBHOOK_SECRET: 'test-secret',
  DATA_REGION: 'me-south-1',
  BILLING_PROVIDER_MODE: 'mock',
  CORS_ORIGIN: 'http://localhost:3000',
};

describe('CrmSyncService (fake mode)', () => {
  let prisma: ReturnType<typeof createPrismaStub>;
  let service: CrmSyncService;

  beforeEach(() => {
    prisma = createPrismaStub();
    const factory = new CrmConnectorFactory(fakeEnv);
    const repo = new MembersRepository(prisma as never);
    service = new CrmSyncService(prisma as never, factory, repo, fakeEnv);
  });

  it('creates a connection in PENDING status', async () => {
    const conn = await service.createConnection('tenant-1', 'mindbody', {});
    expect(conn.status).toBe(CrmConnectionStatus.PENDING);
    expect(conn.provider).toBe(PrismaCrmProvider.MINDBODY);
  });

  it('syncs all mindbody fixture members and marks the connection CONNECTED', async () => {
    const conn = await service.createConnection('tenant-1', 'mindbody', {});
    const summary = await service.syncMembers(conn.id, 'tenant-1');
    expect(summary.membersWritten).toBe(3);
    expect(summary.pagesFetched).toBeGreaterThanOrEqual(1);
    expect(prisma.connections.get(conn.id)!.status).toBe(CrmConnectionStatus.CONNECTED);
    expect(prisma.connections.get(conn.id)!.lastSyncAt).toBeInstanceOf(Date);
    expect(prisma.members.size).toBe(3);
  });

  it('upserts glofox + zenoti independently per tenant', async () => {
    const gx = await service.createConnection('tenant-1', 'glofox', {});
    const zn = await service.createConnection('tenant-1', 'zenoti', {});
    await service.syncMembers(gx.id, 'tenant-1');
    await service.syncMembers(zn.id, 'tenant-1');
    expect(prisma.members.size).toBe(4); // 2 glofox + 2 zenoti
  });

  it('rejects sync when connection belongs to another tenant', async () => {
    const conn = await service.createConnection('tenant-1', 'mindbody', {});
    await expect(service.syncMembers(conn.id, 'tenant-other')).rejects.toThrow(/not found/i);
  });

  it('refuses to create duplicate connection for the same provider', async () => {
    await service.createConnection('tenant-1', 'mindbody', {});
    prisma.crmConnection.findUnique.mockResolvedValueOnce({ id: 'existing' } as never);
    await expect(service.createConnection('tenant-1', 'mindbody', {})).rejects.toThrow(/already exists/);
  });
});
