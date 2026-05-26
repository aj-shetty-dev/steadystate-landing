import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const TOKEN_TTL_DAYS = 30;

@Injectable()
export class QrTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async issueOrRefresh(tenantId: string, memberId: string) {
    const existing = await this.prisma.memberQrToken.findFirst({
      where: { memberId, tenantId },
    });
    if (existing && existing.expiresAt.getTime() > Date.now() + 86400000) {
      return existing;
    }
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 86400000);
    if (existing) {
      return this.prisma.memberQrToken.update({
        where: { id: existing.id },
        data: { token, expiresAt },
      });
    }
    return this.prisma.memberQrToken.create({
      data: { tenantId, memberId, token, expiresAt },
    });
  }

  async resolve(token: string) {
    const t = await this.prisma.memberQrToken.findFirst({
      where: { token, expiresAt: { gt: new Date() } },
    });
    return t;
  }

  async rotate(tenantId: string, memberId: string) {
    return this.issueOrRefresh(tenantId, memberId);
  }
}
