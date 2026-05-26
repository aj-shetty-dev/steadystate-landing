import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.config';
import { MembershipsService } from './memberships.service';

export const MEMBERSHIP_EXPIRY_QUEUE = 'membership-expiry';
export const MEMBERSHIP_EXPIRY_JOB = 'sweep';
export const MEMBERSHIP_REMINDER_JOB = 'reminder';

@Injectable()
export class MembershipExpiryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MembershipExpiryScheduler.name);
  private connection!: IORedis;
  private queue!: Queue;
  private worker?: Worker;

  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly memberships: MembershipsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.env.NODE_ENV === 'test') return;
    this.connection = new IORedis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.connection.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
    this.queue = new Queue(MEMBERSHIP_EXPIRY_QUEUE, { connection: this.connection });
    this.worker = new Worker(
      MEMBERSHIP_EXPIRY_QUEUE,
      async (job: Job) => {
        if (job.name === MEMBERSHIP_REMINDER_JOB) {
          const out = await this.memberships.sendExpiryReminders();
          this.logger.log(`Expiry reminders → sent=${out.sent} skipped=${out.skipped}`);
        } else {
          const out = await this.memberships.expireDue();
          this.logger.log(`Expiry sweep → ${out.expired}`);
        }
      },
      { connection: this.connection, concurrency: 1 },
    );
    try {
      await this.queue.add(
        MEMBERSHIP_EXPIRY_JOB,
        {},
        {
          repeat: { pattern: '15 1 * * *' },
          jobId: 'membership-expiry-sweep',
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      );
      await this.queue.add(
        MEMBERSHIP_REMINDER_JOB,
        {},
        {
          repeat: { pattern: '0 9 * * *' },
          jobId: 'membership-expiry-reminder',
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      );
    } catch (err) {
      this.logger.error(`Failed to register expiry jobs: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async runNow(): Promise<{ expired: number }> {
    return this.memberships.expireDue();
  }
}
