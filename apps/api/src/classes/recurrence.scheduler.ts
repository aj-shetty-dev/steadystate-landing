import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.config';
import { RecurrenceExpanderService } from './recurrence-expander.service';

export const RECURRENCE_QUEUE = 'class-recurrence';
export const RECURRENCE_JOB = 'expand';

@Injectable()
export class RecurrenceScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecurrenceScheduler.name);
  private connection!: IORedis;
  private queue!: Queue;
  private worker?: Worker;

  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly expander: RecurrenceExpanderService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.env.NODE_ENV === 'test') return;
    this.connection = new IORedis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.connection.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
    this.queue = new Queue(RECURRENCE_QUEUE, { connection: this.connection });
    this.worker = new Worker(
      RECURRENCE_QUEUE,
      async (_job: Job) => {
        const out = await this.expander.expandAll();
        this.logger.log(`Recurrence expand -> ${out.created}`);
      },
      { connection: this.connection, concurrency: 1 },
    );
    try {
      await this.queue.add(
        RECURRENCE_JOB,
        {},
        {
          repeat: { pattern: '0 1 * * *' },
          jobId: 'class-recurrence-daily',
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      );
    } catch (err) {
      this.logger.error(`Failed to register recurrence job: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async runNow(): Promise<{ created: number }> {
    return this.expander.expandAll();
  }
}
