import { Module } from '@nestjs/common';
import { CrmConnectorFactory } from './crm-connector.factory';
// import { CrmController } from './crm.controller'; // TODO(future): re-enable when CRM integrations are activated
import { CrmSyncQueue } from './crm-sync.queue';
import { CrmSyncService } from './crm-sync.service';
import { MembersRepository } from './members.repository';

@Module({
  // CRM integration endpoints are temporarily disabled.
  // Re-enable CrmController here once a real CRM integration is ready.
  controllers: [],
  providers: [CrmConnectorFactory, CrmSyncService, CrmSyncQueue, MembersRepository],
  exports: [CrmSyncService, CrmSyncQueue],
})
export class CrmModule {}
