const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) { console.log('No tenant found'); process.exit(1); }
  const tid = tenant.id;
  console.log(`Seeding: ${tenant.name}\n`);

  // Clean slate — wipe existing seed data
  console.log('Clearing old data...');
  await prisma.saleLine.deleteMany({ where: { tenantId: tid } });
  await prisma.sale.deleteMany({ where: { tenantId: tid } });
  await prisma.whatsappMessage.deleteMany({ where: { tenantId: tid } });
  await prisma.product.deleteMany({ where: { tenantId: tid } });
  await prisma.lead.deleteMany({ where: { tenantId: tid } });
  await prisma.booking.deleteMany({ where: { tenantId: tid } });
  await prisma.checkIn.deleteMany({ where: { tenantId: tid } });
  await prisma.classSession.deleteMany({ where: { tenantId: tid } });
  await prisma.classType.deleteMany({ where: { tenantId: tid } });
  await prisma.churnSignal.deleteMany({ where: { tenantId: tid } });
  await prisma.membership.deleteMany({ where: { tenantId: tid } });
  await prisma.membershipPlan.deleteMany({ where: { tenantId: tid } });
  await prisma.member.deleteMany({ where: { tenantId: tid } });
  await prisma.staff.deleteMany({ where: { tenantId: tid } });
  console.log('');

  // Staff
  const staff = await Promise.all([
    prisma.staff.create({ data: { tenantId: tid, fullName: 'Coach Ahmed', role: 'TRAINER', email: 'ahmed@fitlife.ae', phone: '+971501234567', hourlyRateAed: 15000, color: '#3b82f6', active: true } }),
    prisma.staff.create({ data: { tenantId: tid, fullName: 'Coach Sara', role: 'TRAINER', email: 'sara@fitlife.ae', phone: '+971502345678', hourlyRateAed: 12000, color: '#ec4899', active: true } }),
    prisma.staff.create({ data: { tenantId: tid, fullName: 'Rashid (Reception)', role: 'RECEPTION', email: 'rashid@fitlife.ae', phone: '+971503456789', hourlyRateAed: 6000, color: '#f59e0b', active: true } }),
    prisma.staff.create({ data: { tenantId: tid, fullName: 'Coach Khalid', role: 'TRAINER', email: 'khalid@fitlife.ae', phone: '+971504567890', hourlyRateAed: 18000, color: '#22c55e', active: true } }),
    prisma.staff.create({ data: { tenantId: tid, fullName: 'Fatima (Manager)', role: 'MANAGER', email: 'fatima@fitlife.ae', phone: '+971505678901', hourlyRateAed: 25000, color: '#a855f7', active: true } }),
  ]);
  console.log(`✅ ${staff.length} staff`);

  // Membership Plans
  const plans = await Promise.all([
    prisma.membershipPlan.create({ data: { tenantId: tid, nameEn: 'Monthly Basic', nameAr: 'شهري أساسي', description: 'Unlimited gym floor access', durationDays: 30, priceAed: 29900, vatRate: 5, includesClasses: false, maxFreezeDays: 5, active: true } }),
    prisma.membershipPlan.create({ data: { tenantId: tid, nameEn: 'Monthly Premium', nameAr: 'شهري مميز', description: 'Gym + unlimited classes', durationDays: 30, priceAed: 49900, vatRate: 5, includesClasses: true, maxFreezeDays: 7, active: true } }),
    prisma.membershipPlan.create({ data: { tenantId: tid, nameEn: 'Quarterly Premium', nameAr: 'ربع سنوي مميز', description: '3 months gym + classes', durationDays: 90, priceAed: 129900, vatRate: 5, includesClasses: true, maxFreezeDays: 14, active: true } }),
    prisma.membershipPlan.create({ data: { tenantId: tid, nameEn: 'Annual Elite', nameAr: 'سنوي النخبة', description: '12 months all-access + PT', durationDays: 365, priceAed: 449900, vatRate: 5, includesClasses: true, maxFreezeDays: 30, active: true } }),
    prisma.membershipPlan.create({ data: { tenantId: tid, nameEn: 'Day Pass', nameAr: 'تذكرة يومية', description: 'Single day access', durationDays: 1, priceAed: 7500, vatRate: 5, includesClasses: false, maxFreezeDays: 0, active: true } }),
  ]);
  console.log(`✅ ${plans.length} plans`);

  // Members
  const memberData = [
    { name: 'Omar Al-Rashid', email: 'omar@example.ae', phone: '+971501111111', gender: 'MALE', status: 'ACTIVE', plan: 1 },
    { name: 'Aisha Mohammed', email: 'aisha@example.ae', phone: '+971502222222', gender: 'FEMALE', status: 'ACTIVE', plan: 3 },
    { name: 'Hamdan Al-Maktoum', email: 'hamdan@example.ae', phone: '+971503333333', gender: 'MALE', status: 'ACTIVE', plan: 3 },
    { name: 'Noura Al-Qasimi', email: 'noura@example.ae', phone: '+971504444444', gender: 'FEMALE', status: 'ACTIVE', plan: 1 },
    { name: 'Rashid Al-Abbar', email: 'rashid.m@example.ae', phone: '+971505555555', gender: 'MALE', status: 'ACTIVE', plan: 0 },
    { name: 'Layla Ibrahim', email: 'layla@example.ae', phone: '+971506666666', gender: 'FEMALE', status: 'ACTIVE', plan: 1 },
    { name: 'Khalid Al-Suwaidi', email: 'khalid.s@example.ae', phone: '+971507777777', gender: 'MALE', status: 'EXPIRED', plan: 0 },
    { name: 'Mariam Hassan', email: 'mariam@example.ae', phone: '+971508888888', gender: 'FEMALE', status: 'ACTIVE', plan: 2 },
    { name: 'Tariq Al-Falasi', email: 'tariq@example.ae', phone: '+971509999999', gender: 'MALE', status: 'FROZEN', plan: 1 },
    { name: 'Hind Al-Mansoori', email: 'hind@example.ae', phone: '+971501010101', gender: 'FEMALE', status: 'ACTIVE', plan: 0 },
    { name: 'Ahmed Al-Hashimi', email: 'ahmed.h@example.ae', phone: '+971501212121', gender: 'MALE', status: 'PENDING', plan: 0 },
    { name: 'Sara Al-Kaabi', email: 'sara.k@example.ae', phone: '+971501313131', gender: 'FEMALE', status: 'ACTIVE', plan: 3 },
    { name: 'Yousef Al-Dhaheri', email: 'yousef@example.ae', phone: '+971501414141', gender: 'MALE', status: 'ACTIVE', plan: 2 },
    { name: 'Reem Al-Shamsi', email: 'reem@example.ae', phone: '+971501515151', gender: 'FEMALE', status: 'ACTIVE', plan: 1 },
    { name: 'Abdullah Al-Mazrouei', email: 'abdullah@example.ae', phone: '+971501616161', gender: 'MALE', status: 'ACTIVE', plan: 0 },
  ];

  const members = [];
  const sources = ['MANUAL', 'WEB_SIGNUP', 'LEAD_CONVERSION', 'KIOSK_SIGNUP'];
  for (const m of memberData) {
    const joinedAt = new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000);
    const extId = 'MEM-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
    const member = await prisma.member.create({
      data: {
        tenantId: tid, externalId: extId, fullName: m.name, email: m.email, phone: m.phone,
        membershipStatus: m.status, joinedAt, preferredLocale: 'EN', gender: m.gender,
        source: sources[Math.floor(Math.random() * 4)], raw: {},
      },
    });
    members.push(member);
  }
  console.log(`✅ ${members.length} members`);

  // Memberships
  for (let i = 0; i < members.length; i++) {
    const plan = plans[memberData[i].plan];
    const startDate = new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000);
    const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
    const status = memberData[i].status === 'EXPIRED' ? 'EXPIRED' : memberData[i].status === 'FROZEN' ? 'FROZEN' : 'ACTIVE';
    await prisma.membership.create({
      data: { tenantId: tid, memberId: members[i].id, planId: plan.id, startDate, endDate, status, signedAt: startDate },
    });
  }
  console.log(`✅ ${members.length} memberships`);

  // Check-ins (last 30 days)
  let cCount = 0;
  for (const member of members) {
    const num = Math.floor(Math.random() * 20) + 3;
    for (let j = 0; j < num; j++) {
      const daysAgo = Math.random() * 30;
      const hour = 6 + Math.random() * 15;
      const checkedInAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      checkedInAt.setHours(Math.floor(hour), Math.floor(Math.random() * 60));
      const sources = ['KIOSK_PIN', 'KIOSK_QR', 'MANUAL'];
      await prisma.checkIn.create({
        data: {
          tenantId: tid, memberId: member.id,
          source: sources[Math.floor(Math.random() * 3)],
          checkedInAt, staffId: staff[Math.floor(Math.random() * staff.length)].id,
        },
      });
      cCount++;
    }
  }
  console.log(`✅ ${cCount} check-ins`);

  // Churn signals
  const inactive = members.slice(6, 10).map(m => m.id);
  let sCount = 0;
  const sigStatuses = ['PENDING', 'NUDGED', 'DISMISSED'];
  for (const mid of inactive) {
    const days = [5, 7, 10, 14][Math.floor(Math.random() * 4)];
    await prisma.churnSignal.create({
      data: {
        tenantId: tid, memberId: mid, daysSinceLastCheckin: days,
        status: sigStatuses[Math.floor(Math.random() * 3)],
        detectedAt: new Date(Date.now() - Math.random() * 10 * 24 * 60 * 60 * 1000),
      },
    });
    sCount++;
  }
  console.log(`✅ ${sCount} churn signals`);

  // Class Types
  const classTypes = await Promise.all([
    prisma.classType.create({ data: { tenantId: tid, nameEn: 'Yoga Flow', nameAr: 'يوغا', description: 'Vinyasa flow for all levels', durationMin: 60, capacity: 25, color: '#a855f7', dropInPriceAed: 8000, active: true } }),
    prisma.classType.create({ data: { tenantId: tid, nameEn: 'HIIT', nameAr: 'تدريب متقطع', description: 'High-intensity interval training', durationMin: 45, capacity: 20, color: '#ef4444', dropInPriceAed: 6500, active: true } }),
    prisma.classType.create({ data: { tenantId: tid, nameEn: 'Spin', nameAr: 'دراجات', description: 'Indoor cycling', durationMin: 45, capacity: 18, color: '#f59e0b', dropInPriceAed: 7000, active: true } }),
    prisma.classType.create({ data: { tenantId: tid, nameEn: 'Boxing', nameAr: 'ملاكمة', description: 'Technical boxing & conditioning', durationMin: 60, capacity: 15, color: '#3b82f6', dropInPriceAed: 9000, active: true } }),
    prisma.classType.create({ data: { tenantId: tid, nameEn: 'Pilates', nameAr: 'بيلاتيس', description: 'Core strength & flexibility', durationMin: 50, capacity: 22, color: '#ec4899', dropInPriceAed: 7500, active: true } }),
  ]);
  console.log(`✅ ${classTypes.length} class types`);

  // Class Sessions (last 3 days + next 7 days)
  let sessCount = 0;
  const timeSlots = ['06:00', '08:00', '10:00', '12:00', '17:00', '19:00', '21:00'];
  const rooms = ['Studio A', 'Studio B', 'Main Floor', 'Cycling Room', 'Boxing Ring'];
  for (let day = -3; day <= 7; day++) {
    for (const ct of classTypes) {
      const slotsForType = Math.floor(Math.random() * 4) + 1;
      const shuffled = [...timeSlots].sort(() => Math.random() - 0.5).slice(0, slotsForType);
      for (const slot of shuffled) {
        const [h, m] = slot.split(':').map(Number);
        const startsAt = new Date();
        startsAt.setDate(startsAt.getDate() + day);
        startsAt.setHours(h, m, 0, 0);
        const endsAt = new Date(startsAt.getTime() + ct.durationMin * 60 * 1000);
        const isPast = startsAt < new Date();
        await prisma.classSession.create({
          data: {
            tenantId: tid, classTypeId: ct.id,
            instructorId: staff[Math.floor(Math.random() * 3)].id,
            startsAt, endsAt,
            status: isPast ? 'COMPLETED' : 'SCHEDULED',
            room: rooms[Math.floor(Math.random() * 5)],
          },
        });
        sessCount++;
      }
    }
  }
  console.log(`✅ ${sessCount} class sessions`);

  // Leads
  const leadNames = ['Amir Khan', 'Zara Sheikh', 'Bilal Siddiqui', 'Nadia Noor', 'Fahad Zaman', 'Yasmin Akhtar', 'Imran Qureshi', 'Sana Tariq'];
  const leadStages = ['NEW', 'CONTACTED', 'TRIAL_BOOKED', 'TRIAL_COMPLETED', 'NEW', 'CONTACTED', 'NEW', 'CONTACTED'];
  const leadSources = ['INSTAGRAM', 'WALK_IN', 'REFERRAL', 'WEBSITE', 'WHATSAPP'];
  for (let i = 0; i < leadNames.length; i++) {
    await prisma.lead.create({
      data: {
        tenantId: tid, fullName: leadNames[i],
        phone: `+97150${Math.floor(1000000 + Math.random() * 9000000)}`,
        email: `${leadNames[i].toLowerCase().replace(' ', '.')}@example.com`,
        source: leadSources[Math.floor(Math.random() * 5)],
        stage: leadStages[i],
        notes: leadStages[i] === 'TRIAL_BOOKED' ? 'Booked trial for Saturday' : leadStages[i] === 'CONTACTED' ? 'Left voicemail' : null,
        nextFollowUpAt: new Date(Date.now() + Math.random() * 7 * 24 * 60 * 60 * 1000),
      },
    });
  }
  console.log(`✅ ${leadNames.length} leads`);

  // Products
  const products = await Promise.all([
    prisma.product.create({ data: { tenantId: tid, sku: 'PROT-WHEY-01', nameEn: 'Whey Protein (1kg)', nameAr: 'واي بروتين', descriptionEn: 'Premium whey isolate', priceAed: 15900, vatRate: 5, active: true } }),
    prisma.product.create({ data: { tenantId: tid, sku: 'BCAA-01', nameEn: 'BCAA 2:1:1', nameAr: 'BCAA', descriptionEn: 'Branch chain amino acids', priceAed: 8900, vatRate: 5, active: true } }),
    prisma.product.create({ data: { tenantId: tid, sku: 'SHAKER-01', nameEn: 'SteadyState Shaker', nameAr: 'شيكر', descriptionEn: 'Branded 700ml shaker', priceAed: 4900, vatRate: 5, active: true } }),
    prisma.product.create({ data: { tenantId: tid, sku: 'TOWEL-01', nameEn: 'Gym Towel', nameAr: 'منشفة', descriptionEn: 'Quick-dry microfiber', priceAed: 3500, vatRate: 5, active: true } }),
  ]);
  console.log(`✅ ${products.length} products`);

  // WhatsApp Messages
  let mCount = 0;
  const bodies = ['Hey! We noticed you haven\'t been in for a few days. Everything okay? 💪', 'Your workout family misses you! Come back and crush it today.', 'Friendly reminder: your membership payment is due in 3 days.', 'Welcome to FitLife Dubai! Your journey starts now 🚀'];
  const wStatuses = ['SENT', 'SENT', 'SENT', 'DELIVERED', 'READ', 'FAILED'];
  const tmpls = ['churn_nudge_1', 'churn_nudge_2', 'payment_reminder', 'welcome'];
  for (let i = 0; i < 35; i++) {
    await prisma.whatsappMessage.create({
      data: {
        tenantId: tid,
        to: `+97150${Math.floor(1000000 + Math.random() * 9000000)}`,
        body: bodies[Math.floor(Math.random() * 4)],
        templateName: tmpls[Math.floor(Math.random() * 4)],
        status: wStatuses[Math.floor(Math.random() * 6)],
        sentAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        errorMessage: Math.random() < 0.1 ? 'Rate limit exceeded' : null,
      },
    });
    mCount++;
  }
  console.log(`✅ ${mCount} WhatsApp messages`);

  // Sales
  let saleCount = 0;
  const payStatuses = ['PAID', 'PAID', 'PAID', 'PAID', 'PENDING'];
  for (let i = 0; i < 25; i++) {
    const numLines = Math.floor(Math.random() * 3) + 1;
    const lines = [];
    let subtotal = 0, vat = 0;
    for (let j = 0; j < numLines; j++) {
      const isProduct = Math.random() > 0.4;
      const prod = products[Math.floor(Math.random() * products.length)];
      const qty = Math.floor(Math.random() * 3) + 1;
      const unit = isProduct ? prod.priceAed : [7500, 8000, 6500][Math.floor(Math.random() * 3)];
      const lVat = Math.round(unit * qty * 0.05);
      const lTotal = unit * qty + lVat;
      lines.push({
        tenantId: tid,
        kind: isProduct ? 'PRODUCT' : 'DAY_PASS',
        refId: isProduct ? prod.id : null,
        nameSnapshot: isProduct ? prod.nameEn : 'Day Pass',
        quantity: qty, unitPriceAed: unit, vatRate: 5, vatAed: lVat, totalAed: lTotal,
      });
      subtotal += unit * qty;
      vat += lVat;
    }
    const member = members[Math.floor(Math.random() * members.length)];
    const daysAgo = Math.floor(Math.random() * 30);
    await prisma.sale.create({
      data: {
        tenantId: tid,
        type: lines.some(l => l.kind === 'DAY_PASS') ? 'DAY_PASS' : 'PRODUCT',
        memberId: member.id,
        staffId: staff[Math.floor(Math.random() * staff.length)].id,
        subtotalAed: subtotal, vatAed: vat, totalAed: subtotal + vat,
        paymentStatus: payStatuses[Math.floor(Math.random() * 5)],
        createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
        lines: { create: lines },
      },
    });
    saleCount++;
  }
  console.log(`✅ ${saleCount} sales`);

  console.log('\n🎉 Seed complete! Refresh your dashboard.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
