/**
 * One-off script: seed demo data for a specific user's tenant.
 * Usage:  pnpm --filter @steady-state/api tsx scripts/seed-tenant.ts <email>
 */
import {
  BookingStatus,
  CheckInSource,
  CrmProvider,
  LeadSource,
  LeadStage,
  MembershipStatus,
  MemberSource,
  PaymentStatus,
  PrismaClient,
  SaleLineKind,
  SaleType,
  StaffRole,
} from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

async function seed(tenantId: string) {
  const existing = await prisma.member.count({ where: { tenantId } });
  if (existing > 0) {
    console.log(`Tenant ${tenantId} already has ${existing} members — clearing first…`);
    // Remove in dependency order
    await prisma.saleLine.deleteMany({ where: { tenantId } });
    await prisma.sale.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.classSession.deleteMany({ where: { tenantId } });
    await prisma.classType.deleteMany({ where: { tenantId } });
    await prisma.checkIn.deleteMany({ where: { tenantId } });
    await prisma.membership.deleteMany({ where: { tenantId } });
    await prisma.membershipPlan.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.product.deleteMany({ where: { tenantId } });
    await prisma.staff.deleteMany({ where: { tenantId } });
    await prisma.member.deleteMany({ where: { tenantId } });
  }

  const now = new Date();
  const day = 86400000;

  // Staff
  const trainer = await prisma.staff.create({
    data: { tenantId, fullName: 'Aisha Khan', role: StaffRole.TRAINER, active: true, commissionPercent: 10, hourlyRateAed: 15000 },
  });
  await prisma.staff.create({
    data: { tenantId, fullName: 'Omar Hassan', role: StaffRole.RECEPTIONIST, active: true, commissionPercent: 0, hourlyRateAed: 10000 },
  });

  // Plans
  const monthly = await prisma.membershipPlan.create({
    data: { tenantId, nameEn: 'Monthly Unlimited', nameAr: 'شهري غير محدود', durationDays: 30, priceAed: 39900, includesClasses: true, active: true },
  });
  const annual = await prisma.membershipPlan.create({
    data: { tenantId, nameEn: 'Annual Unlimited', nameAr: 'سنوي غير محدود', durationDays: 365, priceAed: 399900, includesClasses: true, active: true },
  });

  // Class type
  const hiit = await prisma.classType.create({
    data: { tenantId, nameEn: 'HIIT 45', nameAr: 'هيت 45', durationMin: 45, capacity: 12, color: '#ef4444', dropInPriceAed: 7500 },
  });

  // Members — varied statuses & last check-in dates
  const membersData = [
    { fullName: 'Sara Al Mansoori',  phone: '+971501111001', status: MembershipStatus.ACTIVE,          daysAgo: 1,  annual: false },
    { fullName: 'James Okafor',      phone: '+971501111002', status: MembershipStatus.ACTIVE,          daysAgo: 3,  annual: false },
    { fullName: 'Priya Nair',        phone: '+971501111003', status: MembershipStatus.ACTIVE,          daysAgo: 6,  annual: true  },
    { fullName: 'Khalid Al Rashidi', phone: '+971501111004', status: MembershipStatus.ACTIVE,          daysAgo: 0,  annual: false },
    { fullName: 'Fatima Zahra',      phone: '+971501111005', status: MembershipStatus.EXPIRED,         daysAgo: 20, annual: false },
    { fullName: 'Luca Rossi',        phone: '+971501111006', status: MembershipStatus.ACTIVE,          daysAgo: 2,  annual: false },
    { fullName: 'Amira Saleh',       phone: '+971501111007', status: MembershipStatus.PENDING_PAYMENT, daysAgo: 8,  annual: false },
    { fullName: 'David Park',        phone: '+971501111008', status: MembershipStatus.ACTIVE,          daysAgo: 4,  annual: true  },
  ];

  const members = [];
  for (let idx = 0; idx < membersData.length; idx++) {
    const m = membersData[idx];
    const member = await prisma.member.create({
      data: {
        tenantId,
        externalId: `demo-${idx + 1}`,
        fullName: m.fullName,
        phone: m.phone,
        membershipStatus: m.status,
        lastCheckinAt: new Date(now.getTime() - m.daysAgo * day),
        joinedAt: new Date(now.getTime() - 90 * day),
        provider: CrmProvider.NATIVE,
        source: MemberSource.MANUAL,
        raw: {},
      },
    });
    members.push({ ...member, annual: m.annual });
  }

  // Memberships for active members
  for (const m of members) {
    if (m.membershipStatus === MembershipStatus.ACTIVE) {
      const plan = m.annual ? annual : monthly;
      const start = new Date(now.getTime() - 7 * day);
      await prisma.membership.create({
        data: {
          tenantId,
          memberId: m.id,
          planId: plan.id,
          status: MembershipStatus.ACTIVE,
          startDate: start,
          endDate: new Date(start.getTime() + plan.durationDays * day),
        },
      });
    }
  }

  // Recent check-ins for active members
  for (const m of members) {
    if (m.membershipStatus === MembershipStatus.ACTIVE) {
      const lastCheckin = m.lastCheckinAt as Date;
      await prisma.checkIn.create({
        data: {
          tenantId,
          memberId: m.id,
          source: CheckInSource.KIOSK_QR,
          checkedInAt: lastCheckin,
        },
      });
    }
  }

  // Class sessions — next 5 days
  for (let i = 0; i < 5; i++) {
    const sessionTime = new Date(now.getTime() + i * day);
    sessionTime.setHours(7, 0, 0, 0);
    const session = await prisma.classSession.create({
      data: {
        tenantId,
        classTypeId: hiit.id,
        instructorId: trainer.id,
        startsAt: sessionTime,
        endsAt: new Date(sessionTime.getTime() + 45 * 60000),
        status: 'SCHEDULED' as never,
      },
    });
    // Book 3 active members per session
    const activeMembers = members.filter(m => m.membershipStatus === MembershipStatus.ACTIVE).slice(0, 3);
    for (const m of activeMembers) {
      await prisma.booking.create({
        data: {
          tenantId,
          memberId: m.id,
          sessionId: session.id,
          status: BookingStatus.BOOKED,
        },
      });
    }
  }

  // Leads
  await prisma.lead.createMany({
    data: [
      { tenantId, fullName: 'Mohammed Al Farsi', phone: '+971509001001', stage: LeadStage.NEW, source: LeadSource.WALK_IN },
      { tenantId, fullName: 'Hannah Fischer',    phone: '+971509001002', stage: LeadStage.CONTACTED, source: LeadSource.REFERRAL },
      { tenantId, fullName: 'Raj Sharma',        phone: '+971509001003', stage: LeadStage.TRIAL_BOOKED, source: LeadSource.SOCIAL },
    ],
  });

  // Products
  const whey = await prisma.product.create({
    data: { tenantId, nameEn: 'Whey Protein 1kg', nameAr: 'بروتين مصل اللبن', sku: 'WP-1KG', priceAed: 18000, vatRate: 5, active: true },
  });
  await prisma.product.create({
    data: { tenantId, nameEn: 'Protein Bar', nameAr: 'بار بروتين', sku: 'PB-CHOC', priceAed: 1500, vatRate: 5, active: true },
  });

  // Sales (POS)
  const saleDates = [7, 4, 1];
  for (let i = 0; i < 3; i++) {
    const saleDate = new Date(now.getTime() - saleDates[i] * day);
    const subtotal = whey.priceAed * (i + 1);
    const vat = Math.round(subtotal * 0.05);
    await prisma.sale.create({
      data: {
        tenantId,
        memberId: members[i].id,
        staffId: trainer.id,
        type: SaleType.PRODUCT,
        subtotalAed: subtotal,
        vatAed: vat,
        totalAed: subtotal + vat,
        paymentStatus: PaymentStatus.PAID,
        createdAt: saleDate,
        lines: {
          create: [{
            tenantId,
            kind: SaleLineKind.PRODUCT,
            refId: whey.id,
            nameSnapshot: whey.nameEn,
            quantity: i + 1,
            unitPriceAed: whey.priceAed,
            vatRate: 5,
            vatAed: vat,
            totalAed: subtotal,
          }],
        },
      },
    });
  }

  console.log(`✅ Demo data seeded for tenant ${tenantId}`);
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: tsx scripts/seed-tenant.ts <email>');
    process.exit(1);
  }

  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  console.log(`Found user ${user.id}, tenant ${user.tenantId}`);
  await seed(user.tenantId);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
