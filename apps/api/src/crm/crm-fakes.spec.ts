import { describe, expect, it } from 'vitest';
import { GlofoxFakeConnector } from './glofox/glofox.fake-connector';
import { GymmasterFakeConnector } from './gymmaster/gymmaster.fake-connector';
import { MindbodyFakeConnector } from './mindbody/mindbody.fake-connector';
import { VirtuagymFakeConnector } from './virtuagym/virtuagym.fake-connector';
import { ZenotiFakeConnector } from './zenoti/zenoti.fake-connector';

describe('fake CRM connectors', () => {
  it.each([
    ['mindbody', new MindbodyFakeConnector()],
    ['glofox', new GlofoxFakeConnector()],
    ['zenoti', new ZenotiFakeConnector()],
    ['virtuagym', new VirtuagymFakeConnector()],
    ['gymmaster', new GymmasterFakeConnector()],
  ] as const)('%s: verifyConnection returns ok', async (_label, connector) => {
    const result = await connector.verifyConnection();
    expect(result.ok).toBe(true);
  });

  it('mindbody fake yields canonical members with E.164 phones and mapped status', async () => {
    const c = new MindbodyFakeConnector();
    const page = await c.listMembers();
    expect(page.items.length).toBeGreaterThan(0);
    const aisha = page.items.find((m) => m.externalId === 'MB-1001');
    expect(aisha).toBeDefined();
    expect(aisha!.phone).toBe('+971501112233');
    expect(aisha!.membershipStatus).toBe('active');

    const omar = page.items.find((m) => m.externalId === 'MB-1002');
    expect(omar!.phone).toBe('+971524445566');
  });

  it('glofox fake maps status and visits', async () => {
    const c = new GlofoxFakeConnector();
    const members = await c.listMembers();
    expect(members.items.find((m) => m.externalId === 'gx_2002')?.membershipStatus).toBe('paused');

    const visits = await c.listVisits();
    expect(visits.items.length).toBe(2);
    expect(visits.items.find((v) => v.externalId === 'gx_ck_9002')?.source).toBe('access');
  });

  it('zenoti fake stitches country code and number into E.164', async () => {
    const c = new ZenotiFakeConnector();
    const page = await c.listMembers();
    const fatima = page.items.find((m) => m.externalId === 'zn_g_3001');
    expect(fatima!.phone).toBe('+971501234567');
    expect(fatima!.membershipStatus).toBe('active');
  });

  it('paginates via cursor', async () => {
    const c = new MindbodyFakeConnector();
    const first = await c.listMembers({ limit: 2 });
    expect(first.items.length).toBe(2);
    expect(first.nextCursor).toBe('2');
    const second = await c.listMembers({ limit: 2, cursor: first.nextCursor });
    expect(second.items.length).toBe(1);
    expect(second.nextCursor).toBeUndefined();
  });

  it('filters by `since`', async () => {
    const c = new MindbodyFakeConnector();
    const all = await c.listMembers();
    const newest = all.items.reduce((a, b) => (a.joinedAt > b.joinedAt ? a : b));
    const since = new Date(newest.joinedAt.getTime() - 1);
    const filtered = await c.listMembers({ since });
    expect(filtered.items.length).toBe(1);
    expect(filtered.items[0].externalId).toBe(newest.externalId);
  });

  it('virtuagym fake maps status + visits', async () => {
    const c = new VirtuagymFakeConnector();
    const members = await c.listMembers();
    expect(members.items.find((m) => m.externalId === '3002')?.membershipStatus).toBe('paused');
    const visits = await c.listVisits();
    expect(visits.items.find((v) => v.externalId === '90001')?.source).toBe('access');
  });

  it('gymmaster fake normalises phone + maps suspended', async () => {
    const c = new GymmasterFakeConnector();
    const members = await c.listMembers();
    const faisal = members.items.find((m) => m.externalId === 'gm_4002');
    expect(faisal!.phone).toBe('+971561112233');
    expect(faisal!.membershipStatus).toBe('paused');
  });
});
