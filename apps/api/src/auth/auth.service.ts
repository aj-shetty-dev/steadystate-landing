import { ConflictException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createClerkClient } from '@clerk/backend';
import { Prisma } from '@prisma/client';
import type { AuthResponse, LoginRequest, SignupRequest } from '@steady-state/shared-types';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.config';
import { PrismaService } from '../prisma/prisma.service';
import { DemoSeedService } from '../seed/demo-seed.service';
import { PasswordHasher } from './password-hasher.service';
import type { AuthenticatedUser } from './jwt.strategy';

export interface OnboardRequest {
  clerkId: string;
  tenantName: string;
  fullName: string;
  email: string;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly hasher: PasswordHasher,
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly demoSeed: DemoSeedService,
  ) {}

  async signup(input: SignupRequest): Promise<AuthResponse> {
    const passwordHash = await this.hasher.hash(input.password);
    const baseSlug = slugify(input.tenantName) || 'gym';

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: input.tenantName,
            slug: await this.uniqueSlug(tx, baseSlug),
          },
        });
        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: input.email.toLowerCase(),
            passwordHash,
            fullName: input.fullName,
            role: 'OWNER',
          },
        });
        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            plan: 'STARTER',
            status: 'TRIALING',
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            provider: this.env.BILLING_PROVIDER_MODE,
          },
        });
        return { tenant, user };
      });

      return this.buildAuthResponse(result.user);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }
  }

  async login(input: LoginRequest): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await this.hasher.verify(input.password, user.passwordHash ?? '');
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return this.buildAuthResponse(user);
  }

  async onboard(input: OnboardRequest): Promise<AuthenticatedUser> {
    const existing = await this.prisma.user.findUnique({ where: { clerkId: input.clerkId } });
    if (existing) {
      return { id: existing.id, tenantId: existing.tenantId, role: existing.role, email: existing.email };
    }

    const baseSlug = slugify(input.tenantName) || 'gym';
    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.tenantName,
          slug: await this.uniqueSlug(tx, baseSlug),
        },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: input.email.toLowerCase(),
          clerkId: input.clerkId,
          fullName: input.fullName,
          role: 'OWNER',
        },
      });
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: 'STARTER',
          status: 'TRIALING',
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          provider: this.env.BILLING_PROVIDER_MODE,
        },
      });
      return { tenant, user };
    });

    if (this.env.CLERK_SECRET_KEY) {
      const clerk = createClerkClient({ secretKey: this.env.CLERK_SECRET_KEY });
      await clerk.users.updateUserMetadata(input.clerkId, {
        publicMetadata: {
          tenantId: result.tenant.id,
          internalUserId: result.user.id,
          role: 'OWNER',
        },
      });
    }

    if (this.env.NODE_ENV === 'development') {
      try {
        await this.demoSeed.seed(result.tenant.id);
      } catch (e) {
        this.logger.warn(`Demo seed failed for tenant ${result.tenant.id}: ${(e as Error).message}`);
      }
    }

    return { id: result.user.id, tenantId: result.tenant.id, role: result.user.role, email: result.user.email };
  }

  private async uniqueSlug(
    tx: Prisma.TransactionClient,
    base: string,
  ): Promise<string> {
    let slug = base;
    let counter = 1;
    while (await tx.tenant.findUnique({ where: { slug } })) {
      counter += 1;
      slug = `${base}-${counter}`;
      if (counter > 1000) throw new Error('Could not allocate tenant slug');
    }
    return slug;
  }

  private async buildAuthResponse(user: {
    id: string;
    email: string;
    fullName: string;
    tenantId: string;
    role: 'OWNER' | 'STAFF' | 'SUPER_ADMIN';
  }): Promise<AuthResponse> {
    const payload = { sub: user.id, tid: user.tenantId, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: this.env.JWT_ACCESS_TTL,
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.env.JWT_REFRESH_SECRET,
      expiresIn: this.env.JWT_REFRESH_TTL,
    });
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        tenantId: user.tenantId,
        role: user.role,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: parseTtlSeconds(this.env.JWT_ACCESS_TTL),
      },
    };
  }
}

function parseTtlSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 900;
  const n = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's':
      return n;
    case 'm':
      return n * 60;
    case 'h':
      return n * 3600;
    case 'd':
      return n * 86400;
    default:
      return 900;
  }
}
