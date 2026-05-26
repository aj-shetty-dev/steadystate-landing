import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Headers,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.config';
import { DoorEventService } from './door-event.service';
import { verifySignature } from './hmac';

@Controller('door-events')
export class DoorEventController {
  constructor(
    private readonly service: DoorEventService,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  @Post('webhook/:tenantId')
  async webhook(
    @Param('tenantId') tenantId: string,
    @Req() req: Request,
    @Headers('x-door-signature') signature: string | undefined,
    @Body() body: unknown,
  ) {
    if (!signature) throw new UnauthorizedException('Missing X-Door-Signature header');
    const raw = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8') ?? JSON.stringify(body);
    if (!verifySignature(this.env.DOOR_WEBHOOK_SECRET, raw, signature)) {
      throw new UnauthorizedException('Invalid signature');
    }
    if (!tenantId) throw new BadRequestException('tenantId required');
    return this.service.ingest(tenantId, body);
  }

  @Get('events')
  @UseGuards(ClerkAuthGuard)
  listEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(25), ParseIntPipe) pageSize: number,
  ) {
    return this.service.listEvents(user.tenantId, page, pageSize);
  }

  @Get('signals')
  @UseGuards(ClerkAuthGuard)
  listSignals(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(25), ParseIntPipe) pageSize: number,
  ) {
    return this.service.listSignals(user.tenantId, page, pageSize);
  }
}
