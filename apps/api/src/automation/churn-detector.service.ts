import { Injectable, Logger } from '@nestjs/common';
import { ChurnSignalStatus, MembershipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { loadAutomationConfig, type AutomationConfig } from './automation.config';

export interface ChurnDetectionResult {
  membersScanned: number;
  signalsCreated: number;
  signalsSkipped: number;
}

@Injectable()
export class ChurnDetectorService {
  private readonly logger = new Logger(ChurnDetectorService.name);
  private readonly config: AutomationConfig = loadAutomationConfig();

  constructor(private readonly prisma: PrismaService) {}

  async detectForTenant(tenantId: string, now: Date = new Date()): Promise<ChurnDetectionResult> {
    const thresholdMs = this.config.CHURN_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
    const cooldownMs = this.config.CHURN_NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    const cutoff = new Date(now.getTime() - thresholdMs);
    const cooldownSince = new Date(now.getTime() - cooldownMs);

    // Candidates: active members idle for at least threshold days. We also
    // include members who have never checked in but joined before the cutoff
    // (e.g. a new sign-up who never showed up).
    const candidates = await this.prisma.member.findMany({
      where: {
        tenantId,
        membershipStatus: MembershipStatus.ACTIVE,
        OR: [{ lastCheckinAt: { lte: cutoff } }, { lastCheckinAt: null, joinedAt: { lte: cutoff } }],
      },
      select: { id: true, lastCheckinAt: true, joinedAt: true },
    });

    let created = 0;
    let skipped = 0;
    for (const member of candidates) {
      const recent = await this.prisma.churnSignal.findFirst({
        where: { tenantId, memberId: member.id, detectedAt: { gte: cooldownSince } },
        select: { id: true },
      });
      if (recent) {
        skipped++;
        continue;
      }
      const reference = member.lastCheckinAt ?? member.joinedAt;
      const days = Math.floor((now.getTime() - reference.getTime()) / (24 * 60 * 60 * 1000));
      await this.prisma.churnSignal.create({
        data: {
          tenantId,
          memberId: member.id,
          daysSinceLastCheckin: days,
          detectedAt: now,
          status: ChurnSignalStatus.PENDING,
        },
      });
      created++;
    }

    this.logger.log(
      `Churn detect tenant=${tenantId} scanned=${candidates.length} created=${created} skipped=${skipped}`,
    );
    return { membersScanned: candidates.length, signalsCreated: created, signalsSkipped: skipped };
  }
}
