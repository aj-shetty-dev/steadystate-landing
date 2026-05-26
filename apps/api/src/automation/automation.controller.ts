import {
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { ChurnEngineService } from './churn-engine.service';
import { ChurnQueue } from './churn.queue';

@Controller('automation/churn')
@UseGuards(ClerkAuthGuard)
export class AutomationController {
  constructor(
    private readonly engine: ChurnEngineService,
    private readonly queue: ChurnQueue,
    private readonly prisma: PrismaService,
  ) {}

  @Get('signals')
  async listSignals(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(25), ParseIntPipe) pageSize: number,
  ) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.churnSignal.findMany({
        where: { tenantId: user.tenantId },
        orderBy: { detectedAt: 'desc' },
        skip,
        take,
        include: {
          member: { select: { id: true, fullName: true, phone: true } },
        },
      }),
      this.prisma.churnSignal.count({ where: { tenantId: user.tenantId } }),
    ]);
    return { items, total, page: Math.max(page, 1), pageSize: take };
  }

  @Post('run')
  @HttpCode(200)
  async runNow(@CurrentUser() user: AuthenticatedUser) {
    // Synchronous execution — useful for dashboards and the on-demand "Run now" button.
    // For scheduled execution, enqueue via the BullMQ repeatable scheduler.
    return this.engine.runCycle(user.tenantId);
  }

  @Post('enqueue')
  @HttpCode(202)
  async enqueue(@CurrentUser() user: AuthenticatedUser) {
    const jobId = await this.queue.enqueueNow({ tenantId: user.tenantId });
    return { jobId };
  }
}
