import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LeadActivityType, LeadSource, LeadStage, Locale } from '@prisma/client';
import { z } from 'zod';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';

export const leadCreateSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(5),
  email: z.string().email().optional(),
  source: z.nativeEnum(LeadSource).optional(),
  notes: z.string().max(2000).optional(),
  assignedToUserId: z.string().optional(),
  nextFollowUpAt: z.string().datetime().optional(),
});

export const leadUpdateSchema = leadCreateSchema.partial().extend({
  stage: z.nativeEnum(LeadStage).optional(),
});

export const leadActivitySchema = z.object({
  type: z.nativeEnum(LeadActivityType),
  summary: z.string().min(1).max(1000),
});

export const leadConvertSchema = z.object({
  planId: z.string().min(1).optional(),
  startDate: z.string().datetime().optional(),
});

// Disallow nonsensical transitions. CONVERTED is terminal (must go through convert()).
// LOST can be revived back to NEW for re-engagement.
const ALLOWED_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  [LeadStage.NEW]: [LeadStage.CONTACTED, LeadStage.TRIAL_BOOKED, LeadStage.TRIAL_COMPLETED, LeadStage.LOST],
  [LeadStage.CONTACTED]: [LeadStage.TRIAL_BOOKED, LeadStage.TRIAL_COMPLETED, LeadStage.LOST],
  [LeadStage.TRIAL_BOOKED]: [LeadStage.TRIAL_COMPLETED, LeadStage.CONTACTED, LeadStage.LOST],
  [LeadStage.TRIAL_COMPLETED]: [LeadStage.CONTACTED, LeadStage.LOST],
  [LeadStage.CONVERTED]: [],
  [LeadStage.LOST]: [LeadStage.NEW],
};

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationDispatcher,
  ) {}

  list(
    tenantId: string,
    opts: { stage?: LeadStage; assignedToUserId?: string; take?: number; skip?: number } = {},
  ) {
    const take = Math.min(Math.max(opts.take ?? 100, 1), 500);
    const skip = Math.max(opts.skip ?? 0, 0);
    return this.prisma.lead.findMany({
      where: {
        tenantId,
        ...(opts.stage ? { stage: opts.stage } : {}),
        ...(opts.assignedToUserId ? { assignedToUserId: opts.assignedToUserId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }

  async get(tenantId: string, id: string) {
    const l = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      include: { activities: { orderBy: { createdAt: 'desc' } } },
    });
    if (!l) throw new NotFoundException('Lead not found');
    return l;
  }

  async create(tenantId: string, input: unknown) {
    const parsed = leadCreateSchema.parse(input);
    return this.prisma.lead.create({
      data: {
        tenantId,
        fullName: parsed.fullName,
        phone: parsed.phone,
        email: parsed.email,
        source: parsed.source ?? LeadSource.WALK_IN,
        notes: parsed.notes,
        assignedToUserId: parsed.assignedToUserId,
        nextFollowUpAt: parsed.nextFollowUpAt ? new Date(parsed.nextFollowUpAt) : null,
      },
    });
  }

  async update(tenantId: string, id: string, input: unknown) {
    const current = await this.get(tenantId, id);
    const parsed = leadUpdateSchema.parse(input);
    if (parsed.stage && parsed.stage !== current.stage) {
      if (parsed.stage === LeadStage.CONVERTED) {
        throw new BadRequestException('Use convert endpoint to mark as CONVERTED');
      }
      const allowed = ALLOWED_TRANSITIONS[current.stage] ?? [];
      if (!allowed.includes(parsed.stage)) {
        throw new BadRequestException(`Invalid stage transition ${current.stage} -> ${parsed.stage}`);
      }
    }
    const data: Record<string, unknown> = { ...parsed };
    if (parsed.nextFollowUpAt) data.nextFollowUpAt = new Date(parsed.nextFollowUpAt);
    return this.prisma.lead.update({ where: { id }, data });
  }

  async addActivity(tenantId: string, leadId: string, createdByUserId: string | null, input: unknown) {
    const parsed = leadActivitySchema.parse(input);
    const lead = await this.get(tenantId, leadId);
    return this.prisma.$transaction(async (tx) => {
      const act = await tx.leadActivity.create({
        data: {
          tenantId,
          leadId,
          type: parsed.type,
          summary: parsed.summary,
          createdByUserId,
        },
      });
      // Auto-transition NEW -> CONTACTED on first activity
      if (lead.stage === LeadStage.NEW) {
        await tx.lead.update({ where: { id: leadId }, data: { stage: LeadStage.CONTACTED } });
      }
      return act;
    });
  }

  async convert(tenantId: string, leadId: string, input: unknown) {
    const parsed = leadConvertSchema.parse(input ?? {});
    const lead = await this.get(tenantId, leadId);
    if (lead.convertedMemberId) {
      throw new BadRequestException('Lead already converted');
    }
    const dup = await this.prisma.member.findFirst({
      where: { tenantId, phone: lead.phone },
      select: { id: true },
    });
    if (dup) {
      throw new ConflictException(`Member with phone ${lead.phone} already exists`);
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const member = await tx.member.create({
        data: {
          tenantId,
          externalId: `lead-${lead.id}`,
          fullName: lead.fullName,
          phone: lead.phone,
          email: lead.email,
          source: 'LEAD_CONVERSION',
          membershipStatus: 'PENDING_PAYMENT',
          joinedAt: new Date(),
          raw: {},
        },
      });
      let membershipId: string | null = null;
      if (parsed.planId) {
        const plan = await tx.membershipPlan.findFirst({
          where: { id: parsed.planId, tenantId, active: true },
        });
        if (!plan) throw new NotFoundException('Plan not found');
        const start = parsed.startDate ? new Date(parsed.startDate) : new Date();
        const end = new Date(start.getTime() + plan.durationDays * 86400000);
        const ms = await tx.membership.create({
          data: {
            tenantId,
            memberId: member.id,
            planId: plan.id,
            startDate: start,
            endDate: end,
            status: 'PENDING_PAYMENT',
          },
        });
        membershipId = ms.id;
      }
      await tx.lead.update({
        where: { id: leadId },
        data: { stage: LeadStage.CONVERTED, convertedMemberId: member.id },
      });
      return { memberId: member.id, membershipId, member };
    });

    // Fire-and-forget welcome notification post-commit.
    if (result.member.phone) {
      try {
        await this.notifications.dispatch({
          tenantId,
          memberId: result.memberId,
          to: result.member.phone,
          body: `Welcome to the gym, ${lead.fullName}! Your account is set up — finish payment to activate your membership.`,
          bodyAr: `أهلا بك في الجيم، ${lead.fullName}! تم إنشاء حسابك — يرجى إتمام الدفع لتفعيل اشتراكك.`,
          locale: Locale.EN,
          category: 'lead_converted_welcome',
          templateName: 'lead_converted_welcome',
        });
      } catch (err) {
        this.logger.warn(`welcome notification failed for lead ${leadId}: ${(err as Error).message}`);
      }
    }

    return { memberId: result.memberId, membershipId: result.membershipId };
  }

  async autoLoseStale(now: Date = new Date(), staleAfterDays = 14): Promise<{ updated: number }> {
    const threshold = new Date(now.getTime() - staleAfterDays * 86400000);
    const res = await this.prisma.lead.updateMany({
      where: {
        stage: { in: [LeadStage.NEW, LeadStage.CONTACTED] },
        updatedAt: { lt: threshold },
      },
      data: { stage: LeadStage.LOST },
    });
    return { updated: res.count };
  }
}
