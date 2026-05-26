import { Controller, Get, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SuperAdminGuard } from './super-admin.guard';

@Controller('admin')
@UseGuards(ClerkAuthGuard, SuperAdminGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('tenants')
  async tenants() {
    const rows = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        subscription: true,
        _count: { select: { users: true, members: true } },
      },
    });
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      city: t.city,
      createdAt: t.createdAt,
      userCount: t._count.users,
      memberCount: t._count.members,
      subscription: t.subscription,
    }));
  }
}
