import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { fromPrismaProvider } from './crm.mapping';
import { createCrmConnectionSchema, type CreateCrmConnectionDto } from './crm.dto';
import { CrmSyncQueue } from './crm-sync.queue';
import { CrmSyncService } from './crm-sync.service';

@Controller('crm/connections')
@UseGuards(ClerkAuthGuard)
export class CrmController {
  constructor(
    private readonly syncService: CrmSyncService,
    private readonly queue: CrmSyncQueue,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.prisma.crmConnection.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        provider: true,
        status: true,
        lastSyncAt: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      provider: fromPrismaProvider(r.provider),
      status: r.status,
      lastSyncAt: r.lastSyncAt,
      createdAt: r.createdAt,
    }));
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCrmConnectionSchema)) body: CreateCrmConnectionDto,
  ) {
    const connection = await this.syncService.createConnection(
      user.tenantId,
      body.provider,
      body.credentials,
    );
    return { id: connection.id, provider: body.provider, status: connection.status };
  }

  @Post(':id/sync')
  @HttpCode(202)
  async enqueueSync(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) connectionId: string,
  ) {
    const jobId = await this.queue.enqueueMemberSync({
      connectionId,
      tenantId: user.tenantId,
    });
    return { jobId };
  }
}
