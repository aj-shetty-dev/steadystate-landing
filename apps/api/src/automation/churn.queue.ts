import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.config';
import { loadAutomationConfig } from './automation.config';
import { ChurnEngineService } from './churn-engine.service';

export const CHURN_QUEUE = 'churn';
export const CHURN_JOB_RUN_CYCLE = 'run-cycle';
const REPEATABLE_JOB_ID = 'scheduler';

export interface ChurnJobData {
  tenantId: string;
}

@Injectable()
export class ChurnQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChurnQueue.name);
  private connection!: IORedis;
  private queue!: Queue<ChurnJobData>;
  private worker?: Worker<ChurnJobData>;
  private readonly config = loadAutomationConfig();

  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly engine: ChurnEngineService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.connection = new IORedis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.connection.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
    this.queue = new Queue<ChurnJobData>(CHURN_QUEUE, { connection: this.connection });
    this.worker = new Worker<ChurnJobData>(
      CHURN_QUEUE,
      async (job: Job<ChurnJobData>) => this.handle(job),
      { connection: this.connection, concurrency: 2 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Churn job ${job?.id} failed: ${err.message}`);
    });

    if (this.env.NODE_ENV !== 'test') {
      await this.scheduleAllTenants();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async enqueueNow(data: ChurnJobData): Promise<string> {
    const job = await this.queue.add(CHURN_JOB_RUN_CYCLE, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
    return job.id as string;
  }

  // Registers a repeatable job per tenant so each tenant gets a daily detection run.
  // Idempotent — BullMQ deduplicates repeatable jobs by name+pattern+jobId.
  async scheduleTenant(tenantId: string): Promise<void> {
    await this.queue.add(
      CHURN_JOB_RUN_CYCLE,
      { tenantId },
      {
        repeat: { pattern: this.config.CHURN_DETECTION_CRON },
        jobId: `${REPEATABLE_JOB_ID}-${tenantId}`,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
  }

  private async scheduleAllTenants(): Promise<void> {
    // We don't query Prisma here to avoid coupling the queue to PrismaService at
    // bootstrap. The scheduling endpoint / startup hook in AppModule can drive it
    // explicitly; for now we leave it to on-demand enqueue.
  }

  private async handle(job: Job<ChurnJobData>): Promise<void> {
    this.logger.log(`Running ${job.name} job=${job.id} tenant=${job.data.tenantId}`);
    await this.engine.runCycle(job.data.tenantId);
  }
}
