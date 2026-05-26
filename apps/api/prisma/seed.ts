import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash('SteadyState!Dev2026', 12);

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'pure-pilates-difc' },
    update: {},
    create: {
      name: 'Pure Pilates Studio',
      slug: 'pure-pilates-difc',
      country: 'AE',
    },
  });

  await prisma.user.upsert({
    where: { email: 'owner@purepilates.test' },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'owner@purepilates.test',
      passwordHash,
      fullName: 'Khalid Al-Rashidi',
      role: 'OWNER',
    },
  });

  console.log('Seeded tenant:', tenant.slug);
  console.log('Login: owner@purepilates.test / SteadyState!Dev2026');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
