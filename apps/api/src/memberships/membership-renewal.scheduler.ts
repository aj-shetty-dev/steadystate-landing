import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.config';
import { MembershipRenewalService } from './membership-renewal.service';

export const MEMBERSHIP_RENEWAL_QUEUE = 'membership-renewal';
export const MEMBERSHIP_RENEWAL_PROCESS_JOB = 'process-renewals';
export const MEMBERSHIP_RENEWAL_REMIND_JOB = 'renewal-reminders';

@Injectable()
export class MembershipRenewalScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MembershipRenewalScheduler.name);
  private connection!: IORedis;
  private queue!: Queue;
  private worker?: Worker;

  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly renewal: MembershipRenewalService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.env.NODE_ENV === 'test') return;
    this.connection = new IORedis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.connection.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
    this.queue = new Queue(MEMBERSHIP_RENEWAL_QUEUE, { connection: this.connection });
    this.worker = new Worker(
      MEMBERSHIP_RENEWAL_QUEUE,
      async (job: Job) => {
        if (job.name === MEMBERSHIP_RENEWAL_REMIND_JOB) {
          const out = await this.renewal.sendPendingRenewalReminders();
          this.logger.log(`Renewal reminders → found=${out.found} sent=${out.sent}`);
        } else {
          const out = await this.renewal.processAutoRenewals();
          this.logger.log(`Auto-renewal sweep → due=${out.due} created=${out.created} skipped=${out.skipped} failed=${out.failed}`);
        }
      },
      { connection: this.connection, concurrency: 1 },
    );
    // Daily at 09:00 UTC — create PENDING_PAYMENT renewals 7 days ahead
    try {
      await this.queue.add(
        MEMBERSHIP_RENEWAL_PROCESS_JOB,
        {},
        {
          repeat: { pattern: '0 9 * * *' },
          jobId: 'membership-renewal-process',
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      );
      // Daily at 09:30 UTC — final reminder for renewals starting within 3 days
      await this.queue.add(
        MEMBERSHIP_RENEWAL_REMIND_JOB,
        {},
        {
          repeat: { pattern: '30 9 * * *' },
          jobId: 'membership-renewal-remind',
          removeOnComplete: 50,
          removeOnFail: 100,
        },
      );
    } catch (err) {
      this.logger.error(`Failed to register renewal jobs: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async runProcessNow(): Promise<ReturnType<MembershipRenewalService['processAutoRenewals']>> {
    return this.renewal.processAutoRenewals();
  }

  async runRemindersNow(): Promise<ReturnType<MembershipRenewalService['sendPendingRenewalReminders']>> {
    return this.renewal.sendPendingRenewalReminders();
  }
}
