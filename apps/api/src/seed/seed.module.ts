import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DemoSeedService } from './demo-seed.service';

@Module({
  imports: [PrismaModule],
  providers: [DemoSeedService],
  exports: [DemoSeedService],
})
export class SeedModule {}
