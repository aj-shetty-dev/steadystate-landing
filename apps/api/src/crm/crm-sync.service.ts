import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CrmConnectionStatus, type CrmConnection } from '@prisma/client';
import {
  glofoxCredentialsSchema,
  mindbodyCredentialsSchema,
  zenotiCredentialsSchema,
  type CrmProvider,
} from '@steady-state/shared-types';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.config';
import { PrismaService } from '../prisma/prisma.service';
import { CrmConnectorFactory } from './crm-connector.factory';
import { fromPrismaProvider, toPrismaProvider } from './crm.mapping';
import { MembersRepository } from './members.repository';

export interface SyncSummary {
  membersWritten: number;
  pagesFetched: number;
}

@Injectable()
export class CrmSyncService {
  private readonly logger = new Logger(CrmSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: CrmConnectorFactory,
    private readonly members: MembersRepository,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  async createConnection(
    tenantId: string,
    provider: CrmProvider,
    credentials: unknown,
  ): Promise<CrmConnection> {
    // Validate credentials shape per provider when running live.
    if (this.env.CRM_MODE === 'live') {
      this.validateCredentials(provider, credentials);
    }
    const existing = await this.prisma.crmConnection.findUnique({
      where: { tenantId_provider: { tenantId, provider: toPrismaProvider(provider) } },
    });
    if (existing) {
      throw new ConflictException(`CRM connection for ${provider} already exists`);
    }
    return this.prisma.crmConnection.create({
      data: {
        tenantId,
        provider: toPrismaProvider(provider),
        credentials: (credentials ?? {}) as object,
        status: CrmConnectionStatus.PENDING,
      },
    });
  }

  async syncMembers(connectionId: string, tenantId: string): Promise<SyncSummary> {
    const connection = await this.prisma.crmConnection.findFirst({
      where: { id: connectionId, tenantId },
    });
    if (!connection) throw new NotFoundException('CRM connection not found');

    await this.prisma.crmConnection.update({
      where: { id: connection.id },
      data: { status: CrmConnectionStatus.SYNCING },
    });

    const connector = this.factory.create(
      fromPrismaProvider(connection.provider),
      connection.credentials,
    );

    let cursor: string | undefined;
    let membersWritten = 0;
    let pagesFetched = 0;
    try {
      do {
        const page = await connector.listMembers({ cursor, limit: 100 });
        pagesFetched++;
        const result = await this.members.upsertMany(tenantId, page.items);
        membersWritten += result.written;
        cursor = page.nextCursor;
      } while (cursor);
      await this.prisma.crmConnection.update({
        where: { id: connection.id },
        data: { status: CrmConnectionStatus.CONNECTED, lastSyncAt: new Date() },
      });
      this.logger.log(
        `Sync ok tenant=${tenantId} provider=${connection.provider} pages=${pagesFetched} written=${membersWritten}`,
      );
      return { membersWritten, pagesFetched };
    } catch (err) {
      await this.prisma.crmConnection.update({
        where: { id: connection.id },
        data: { status: CrmConnectionStatus.ERROR },
      });
      this.logger.error(`Sync failed tenant=${tenantId} provider=${connection.provider}: ${(err as Error).message}`);
      throw err;
    }
  }

  private validateCredentials(provider: CrmProvider, credentials: unknown): void {
    switch (provider) {
      case 'mindbody':
        mindbodyCredentialsSchema.parse(credentials);
        return;
      case 'glofox':
        glofoxCredentialsSchema.parse(credentials);
        return;
      case 'zenoti':
        zenotiCredentialsSchema.parse(credentials);
        return;
      default:
        throw new Error(`Unsupported provider for live mode: ${provider}`);
    }
  }
}
