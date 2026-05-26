import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Asserts that all CRM integration endpoints are disabled (no route registered).
 * Re-enable these routes in crm.module.ts when a real CRM integration is activated.
 */
describe('CRM endpoints (disabled)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);

    // Create a tenant + user so we have a valid bearer token for authenticated calls.
    const signup = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: 'crm-test@example.test',
        password: 'SuperSecure!2026',
        tenantName: 'CRM Test Gym',
        fullName: 'CRM Owner',
      });
    accessToken = signup.body.tokens.accessToken as string;
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "WhatsappMessage", "Member", "CrmConnection", "User", "Tenant" RESTART IDENTITY CASCADE;',
    );
    await app.close();
  });

  it('GET /api/v1/crm/connections returns 404 (route not registered)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/crm/connections')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('POST /api/v1/crm/connections returns 404 (route not registered)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/crm/connections')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ provider: 'mindbody', credentials: {} })
      .expect(404);
  });

  it('POST /api/v1/crm/connections/:id/sync returns 404 (route not registered)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/crm/connections/some-id/sync')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });
});
