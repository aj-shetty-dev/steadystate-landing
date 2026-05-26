import { Module } from '@nestjs/common';
import { MembershipExpiryScheduler } from './membership-expiry.scheduler';
import { MembershipRenewalScheduler } from './membership-renewal.scheduler';
import { MembershipRenewalService } from './membership-renewal.service';
import { MembershipPlansService } from './membership-plans.service';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';

@Module({
  controllers: [MembershipsController],
  providers: [
    MembershipsService,
    MembershipPlansService,
    MembershipExpiryScheduler,
    MembershipRenewalService,
    MembershipRenewalScheduler,
  ],
  exports: [MembershipsService, MembershipPlansService, MembershipRenewalService],
})
export class MembershipsModule {}
