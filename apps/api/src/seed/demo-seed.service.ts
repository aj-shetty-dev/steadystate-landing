import { Injectable, Logger } from '@nestjs/common';
import {
  BookingStatus,
  CheckInSource,
  CrmProvider,
  LeadSource,
  LeadStage,
  MembershipStatus,
  MemberSource,
  PaymentStatus,
  SaleLineKind,
  SaleType,
  StaffRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DemoSeedService {
  private readonly logger = new Logger(DemoSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seed(tenantId: string): Promise<void> {
    const existing = await this.prisma.member.count({ where: { tenantId } });
    if (existing > 0) {
      return;
    }

    const now = new Date();
    const day = 86400000;

    const trainer = await this.prisma.staff.create({
      data: {
        tenantId,
        fullName: 'Aisha Khan',
        role: StaffRole.TRAINER,
        email: 'aisha@demo.local',
        phone: '+971500000001',
        hourlyRateAed: 12000,
        commissionPercent: 10,
        active: true,
      },
    });
    const reception = await this.prisma.staff.create({
      data: {
        tenantId,
        fullName: 'Omar Hassan',
        role: StaffRole.RECEPTION,
        email: 'omar@demo.local',
        phone: '+971500000002',
        active: true,
      },
    });

    const monthlyPlan = await this.prisma.membershipPlan.create({
      data: {
        tenantId,
        nameEn: 'Monthly Unlimited',
        nameAr: 'شهري غير محدود',
        durationDays: 30,
        priceAed: 39900,
        vatRate: 5,
        includesClasses: true,
        active: true,
      },
    });
    const annualPlan = await this.prisma.membershipPlan.create({
      data: {
        tenantId,
        nameEn: 'Annual Unlimited',
        durationDays: 365,
        priceAed: 399900,
        vatRate: 5,
        includesClasses: true,
        active: true,
      },
    });

    const classType = await this.prisma.classType.create({
      data: {
        tenantId,
        nameEn: 'HIIT 45',
        nameAr: 'هيت ٤٥',
        durationMin: 45,
        capacity: 12,
        color: '#22c55e',
        dropInPriceAed: 7500,
        active: true,
      },
    });

    const memberNames: Array<[string, string, MembershipStatus, number]> = [
      ['Hassan Ali', '+971501111111', MembershipStatus.ACTIVE, 2],
      ['Sara Mohammed', '+971502222222', MembershipStatus.ACTIVE, 0],
      ['Yusuf Khan', '+971503333333', MembershipStatus.ACTIVE, 6],
      ['Layla Ahmad', '+971504444444', MembershipStatus.ACTIVE, 1],
      ['Khalid Saeed', '+971505555555', MembershipStatus.EXPIRED, 40],
      ['Noura Hamad', '+971506666666', MembershipStatus.ACTIVE, 3],
      ['Tariq Aziz', '+971507777777', MembershipStatus.ACTIVE, 8],
      ['Maya Farouk', '+971508888888', MembershipStatus.PENDING_PAYMENT, 0],
    ];

    const members = [] as Array<{ id: string; fullName: string }>;
    for (let i = 0; i < memberNames.length; i += 1) {
      const [name, phone, status, daysSinceCheckin] = memberNames[i];
      const m = await this.prisma.member.create({
        data: {
          tenantId,
          externalId: `demo-${i}`,
          provider: CrmProvider.NATIVE,
          fullName: name,
          phone,
          email: `${name.toLowerCase().replace(/\s+/g, '.')}@demo.local`,
          membershipStatus: status,
          membershipExpiresAt: status === MembershipStatus.EXPIRED ? new Date(now.getTime() - 10 * day) : new Date(now.getTime() + 20 * day),
          lastCheckinAt: new Date(now.getTime() - daysSinceCheckin * day),
          joinedAt: new Date(now.getTime() - (60 + i * 7) * day),
          source: MemberSource.MANUAL,
          raw: {},
        },
      });
      members.push({ id: m.id, fullName: m.fullName });

      if (status === MembershipStatus.ACTIVE) {
        await this.prisma.membership.create({
          data: {
            tenantId,
            memberId: m.id,
            planId: i % 4 === 0 ? annualPlan.id : monthlyPlan.id,
            status: MembershipStatus.ACTIVE,
            startDate: new Date(now.getTime() - 20 * day),
            endDate: new Date(now.getTime() + 10 * day),
          },
        });
      }

      if (daysSinceCheckin < 14) {
        await this.prisma.checkIn.create({
          data: {
            tenantId,
            memberId: m.id,
            source: CheckInSource.KIOSK_QR,
            checkedInAt: new Date(now.getTime() - daysSinceCheckin * day),
          },
        });
      }
    }

    for (let i = 0; i < 5; i += 1) {
      const startsAt = new Date(now.getTime() + i * day + 9 * 3600000);
      const endsAt = new Date(startsAt.getTime() + 45 * 60000);
      const session = await this.prisma.classSession.create({
        data: {
          tenantId,
          classTypeId: classType.id,
          instructorId: trainer.id,
          startsAt,
          endsAt,
          status: 'SCHEDULED',
        },
      });
      for (let b = 0; b < Math.min(3, members.length); b += 1) {
        await this.prisma.booking.create({
          data: {
            tenantId,
            sessionId: session.id,
            memberId: members[b].id,
            status: BookingStatus.BOOKED,
          },
        });
      }
    }

    await this.prisma.lead.createMany({
      data: [
        {
          tenantId,
          fullName: 'Fatima Saleh',
          phone: '+971509000001',
          email: 'fatima@example.ae',
          source: LeadSource.INSTAGRAM,
          stage: LeadStage.NEW,
        },
        {
          tenantId,
          fullName: 'Mohammed Rahman',
          phone: '+971509000002',
          source: LeadSource.WALK_IN,
          stage: LeadStage.CONTACTED,
        },
        {
          tenantId,
          fullName: 'Aaliya Hussein',
          phone: '+971509000003',
          source: LeadSource.REFERRAL,
          stage: LeadStage.TRIAL_BOOKED,
          nextFollowUpAt: new Date(now.getTime() + 2 * day),
        },
      ],
    });

    const protein = await this.prisma.product.create({
      data: {
        tenantId,
        sku: 'PROT-001',
        nameEn: 'Whey Protein 1kg',
        nameAr: 'بروتين واي ١ كجم',
        priceAed: 18000,
        vatRate: 5,
        active: true,
      },
    });
    await this.prisma.product.create({
      data: {
        tenantId,
        sku: 'BAR-001',
        nameEn: 'Protein Bar',
        priceAed: 1500,
        vatRate: 5,
        active: true,
      },
    });

    for (let i = 0; i < 3; i += 1) {
      const member = members[i % members.length];
      const subtotal = 18000;
      const vat = Math.round(subtotal * 0.05);
      const total = subtotal + vat;
      await this.prisma.sale.create({
        data: {
          tenantId,
          type: SaleType.PRODUCT,
          memberId: member.id,
          staffId: reception.id,
          subtotalAed: subtotal,
          vatAed: vat,
          totalAed: total,
          paymentStatus: PaymentStatus.PAID,
          lines: {
            create: [
              {
                tenantId,
                kind: SaleLineKind.PRODUCT,
                refId: protein.id,
                nameSnapshot: 'Whey Protein 1kg',
                quantity: 1,
                unitPriceAed: subtotal,
                vatRate: 5,
                vatAed: vat,
                totalAed: total,
              },
            ],
          },
        },
      });
    }

    this.logger.log(`Demo data seeded for tenant ${tenantId}`);
  }
}
