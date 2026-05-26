import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { StatsService } from './stats.service';

@Controller('stats')
@UseGuards(ClerkAuthGuard)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.stats.overview(user.tenantId);
  }
}
