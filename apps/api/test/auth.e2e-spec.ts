import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "WhatsappMessage", "Member", "CrmConnection", "User", "Tenant" RESTART IDENTITY CASCADE;');
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "WhatsappMessage", "Member", "CrmConnection", "User", "Tenant" RESTART IDENTITY CASCADE;');
  });

  const signupBody = {
    email: 'owner@example.test',
    password: 'SuperSecure!2026',
    tenantName: 'Test Gym',
    fullName: 'Test Owner',
  };

  it('POST /auth/signup creates tenant + user and returns tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send(signupBody)
      .expect(201);

    expect(res.body.user.email).toBe('owner@example.test');
    expect(res.body.user.role).toBe('OWNER');
    expect(res.body.tokens.accessToken).toBeDefined();
    expect(res.body.tokens.refreshToken).toBeDefined();
  });

  it('POST /auth/signup rejects duplicate email with 409', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/signup').send(signupBody).expect(201);
    await request(app.getHttpServer()).post('/api/v1/auth/signup').send(signupBody).expect(409);
  });

  it('POST /auth/signup rejects weak password with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({ ...signupBody, password: 'short' })
      .expect(400);
  });

  it('POST /auth/login returns tokens for valid credentials', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/signup').send(signupBody).expect(201);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: signupBody.email, password: signupBody.password })
      .expect(200);
    expect(res.body.tokens.accessToken).toBeDefined();
  });

  it('POST /auth/login rejects bad password with 401', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/signup').send(signupBody).expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: signupBody.email, password: 'WrongPassword!1' })
      .expect(401);
  });

  it('POST /auth/me returns the authenticated user when bearer token is valid', async () => {
    const signup = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send(signupBody)
      .expect(201);

    const me = await request(app.getHttpServer())
      .post('/api/v1/auth/me')
      .set('Authorization', `Bearer ${signup.body.tokens.accessToken}`)
      .expect(200);

    expect(me.body.id).toBe(signup.body.user.id);
    expect(me.body.tenantId).toBe(signup.body.user.tenantId);
  });

  it('POST /auth/me rejects requests without a token with 401', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/me').expect(401);
  });
});
