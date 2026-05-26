import { Injectable } from '@nestjs/common';
import type { CrmMember } from '@steady-state/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { toPrismaMembershipStatus, toPrismaProvider } from './crm.mapping';

@Injectable()
export class MembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertMany(tenantId: string, members: CrmMember[]): Promise<{ written: number }> {
    if (members.length === 0) return { written: 0 };
    let written = 0;
    for (const m of members) {
      const provider = toPrismaProvider(m.provider);
      await this.prisma.member.upsert({
        where: {
          tenantId_provider_externalId: {
            tenantId,
            provider,
            externalId: m.externalId,
          },
        },
        update: {
          fullName: m.fullName,
          email: m.email,
          phone: m.phone,
          membershipStatus: toPrismaMembershipStatus(m.membershipStatus),
          membershipExpiresAt: m.membershipExpiresAt,
          lastCheckinAt: m.lastCheckinAt,
          raw: m.raw as object,
        },
        create: {
          tenantId,
          provider,
          externalId: m.externalId,
          fullName: m.fullName,
          email: m.email,
          phone: m.phone,
          membershipStatus: toPrismaMembershipStatus(m.membershipStatus),
          membershipExpiresAt: m.membershipExpiresAt,
          lastCheckinAt: m.lastCheckinAt,
          joinedAt: m.joinedAt,
          raw: m.raw as object,
        },
      });
      written++;
    }
    return { written };
  }
}
