import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuditLogInterceptor } from './auth/audit-log.interceptor';
import { AuthModule } from './auth/auth.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { AutomationModule } from './automation/automation.module';
import { BillingModule } from './billing/billing.module';
import { CheckInModule } from './checkin/checkin.module';
import { ClassesModule } from './classes/classes.module';
import { ConfigModule } from './config/config.module';
import { CrmModule } from './crm/crm.module';
import { DoorEventsModule } from './door-events/door-events.module';
import { HealthModule } from './health/health.module';
import { ImporterModule } from './importer/importer.module';
import { LeadsModule } from './leads/leads.module';
import { MemberPortalModule } from './member-portal/member-portal.module';
import { MembersModule } from './members/members.module';
import { MembershipsModule } from './memberships/memberships.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { PosModule } from './pos/pos.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportingModule } from './reporting/reporting.module';
import { ShopModule } from './shop/shop.module';
import { StaffModule } from './staff/staff.module';
import { StatsModule } from './stats/stats.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    ConfigModule,
    PrismaModule,
    AuthModule,
    HealthModule,
    WhatsappModule,
    NotificationsModule,
    CrmModule,
    AutomationModule,
    MembersModule,
    MembershipsModule,
    PaymentsModule,
    StaffModule,
    ClassesModule,
    LeadsModule,
    CheckInModule,
    PosModule,
    ReportingModule,
    ImporterModule,
    MemberPortalModule,
    StatsModule,
    BillingModule,
    ShopModule,
    DoorEventsModule,
    SubscriptionsModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule {}
