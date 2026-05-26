import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.config';
import { loadBillingConfig } from './billing.config';
import { BillingService } from './billing.service';

export const BILLING_QUEUE = 'billing';
export const BILLING_JOB_SCHEDULE = 'schedule-retries';
export const BILLING_JOB_PROCESS = 'process-due';

export interface BillingJobData {
  tenantId: string;
}

@Injectable()
export class BillingQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingQueue.name);
  private readonly config = loadBillingConfig();
  private connection!: IORedis;
  private queue!: Queue<BillingJobData>;
  private worker?: Worker<BillingJobData>;

  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly billing: BillingService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.connection = new IORedis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.connection.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
    this.queue = new Queue<BillingJobData>(BILLING_QUEUE, { connection: this.connection });
    this.worker = new Worker<BillingJobData>(
      BILLING_QUEUE,
      async (job: Job<BillingJobData>) => this.handle(job),
      { connection: this.connection, concurrency: 2 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Billing job ${job?.id} failed: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async scheduleTenantCron(tenantId: string): Promise<void> {
    await this.queue.add(
      BILLING_JOB_SCHEDULE,
      { tenantId },
      {
        repeat: { pattern: this.config.BILLING_CRON },
        jobId: `billing-schedule-${tenantId}`,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
    await this.queue.add(
      BILLING_JOB_PROCESS,
      { tenantId },
      {
        repeat: { pattern: this.config.BILLING_CRON },
        jobId: `billing-process-${tenantId}`,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
  }

  private async handle(job: Job<BillingJobData>): Promise<void> {
    if (job.name === BILLING_JOB_SCHEDULE) {
      await this.billing.scheduleRetries(job.data.tenantId);
    } else if (job.name === BILLING_JOB_PROCESS) {
      await this.billing.processDueRetries(job.data.tenantId);
    } else {
      this.logger.warn(`Unknown billing job: ${job.name}`);
    }
  }
}
