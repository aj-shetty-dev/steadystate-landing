import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.config';
import { CrmSyncService } from './crm-sync.service';

export const CRM_SYNC_QUEUE = 'crm-sync';

export interface CrmSyncJobData {
  connectionId: string;
  tenantId: string;
}

@Injectable()
export class CrmSyncQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrmSyncQueue.name);
  private connection!: IORedis;
  private queue!: Queue<CrmSyncJobData>;
  private worker?: Worker<CrmSyncJobData>;

  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly syncService: CrmSyncService,
  ) {}

  onModuleInit(): void {
    this.connection = new IORedis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.connection.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
    this.queue = new Queue<CrmSyncJobData>(CRM_SYNC_QUEUE, { connection: this.connection });
    // Worker is started in the same process for now. In production this would be a
    // separate process; the wiring is identical.
    this.worker = new Worker<CrmSyncJobData>(
      CRM_SYNC_QUEUE,
      async (job: Job<CrmSyncJobData>) => this.handle(job),
      { connection: this.connection, concurrency: 4 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async enqueueMemberSync(data: CrmSyncJobData): Promise<string> {
    const job = await this.queue.add('sync-members', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
    return job.id as string;
  }

  // Exposed for tests — run a job inline without going through Redis.
  async runInline(data: CrmSyncJobData): Promise<void> {
    await this.syncService.syncMembers(data.connectionId, data.tenantId);
  }

  private async handle(job: Job<CrmSyncJobData>): Promise<void> {
    this.logger.log(`Running ${job.name} job=${job.id} tenant=${job.data.tenantId}`);
    await this.syncService.syncMembers(job.data.connectionId, job.data.tenantId);
  }
}
