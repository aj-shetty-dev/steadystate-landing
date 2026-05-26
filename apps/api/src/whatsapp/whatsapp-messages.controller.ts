import { BadRequestException, Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { MembershipStatus, Prisma, WhatsappMessageStatus } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp/messages')
@UseGuards(ClerkAuthGuard)
export class WhatsappMessagesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(25), ParseIntPipe) pageSize: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;

    const where: Prisma.WhatsappMessageWhereInput = { tenantId: user.tenantId };
    if (status && status !== 'ALL') where.status = status as WhatsappMessageStatus;
    if (search) where.to = { contains: search };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to + 'T23:59:59.999Z');
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.whatsappMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          to: true,
          body: true,
          status: true,
          templateName: true,
          errorMessage: true,
          sentAt: true,
          createdAt: true,
        },
      }),
      this.prisma.whatsappMessage.count({ where }),
    ]);

    return { items, total, page: Math.max(page, 1), pageSize: take };
  }

  @Post('send')
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { to: string; body: string; templateName?: string },
  ) {
    if (!body.to || !body.body) {
      throw new BadRequestException('to and body are required');
    }
    return this.whatsapp.send({
      tenantId: user.tenantId,
      request: { to: body.to, body: body.body, templateName: body.templateName, locale: 'en' },
    });
  }

  @Post('broadcast')
  async broadcast(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: {
      body: string;
      segment?: {
        membershipStatus?: string;
        planId?: string;
        lastCheckinFrom?: string;
        lastCheckinTo?: string;
      };
    },
  ) {
    if (!body.body) throw new BadRequestException('body is required');

    const where: Prisma.MemberWhereInput = { tenantId: user.tenantId, phone: { not: null } };

    if (body.segment) {
      const s = body.segment;
      if (s.membershipStatus) {
        where.membershipStatus = s.membershipStatus as MembershipStatus;
      } else {
        where.membershipStatus = { in: [MembershipStatus.ACTIVE, MembershipStatus.FROZEN] };
      }
      if (s.planId) {
        where.memberships = { some: { planId: s.planId, status: MembershipStatus.ACTIVE } };
      }
      if (s.lastCheckinFrom || s.lastCheckinTo) {
        where.lastCheckinAt = {};
        if (s.lastCheckinFrom) where.lastCheckinAt.gte = new Date(s.lastCheckinFrom);
        if (s.lastCheckinTo) where.lastCheckinAt.lte = new Date(s.lastCheckinTo + 'T23:59:59.999Z');
      }
    } else {
      where.membershipStatus = { in: [MembershipStatus.ACTIVE, MembershipStatus.FROZEN] };
    }

    const members = await this.prisma.member.findMany({
      where,
      select: { id: true, phone: true, fullName: true },
      take: 500,
    });

    let sent = 0;
    let skipped = 0;
    for (const m of members) {
      if (!m.phone) { skipped++; continue; }
      try {
        await this.whatsapp.send({
          tenantId: user.tenantId,
          request: { to: m.phone, body: body.body, locale: 'en' },
        });
        sent++;
      } catch {
        skipped++;
      }
    }

    return { sent, skipped, total: members.length };
  }

  @Post(':id/resend')
  async resend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const msg = await this.prisma.whatsappMessage.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!msg) throw new BadRequestException('Message not found');
    if (msg.status !== 'FAILED') throw new BadRequestException('Only failed messages can be resent');

    return this.whatsapp.send({
      tenantId: user.tenantId,
      request: { to: msg.to, body: msg.body, templateName: msg.templateName ?? undefined, locale: 'en' },
    });
  }
}
