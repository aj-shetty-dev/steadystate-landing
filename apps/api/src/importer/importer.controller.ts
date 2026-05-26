import { BadRequestException, Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ImporterService } from './importer.service';

interface ImportBody { csv: string; apply?: boolean }

function validate(body: unknown): ImportBody {
  if (!body || typeof body !== 'object') throw new BadRequestException('Body required');
  const b = body as Record<string, unknown>;
  if (typeof b.csv !== 'string' || !b.csv.trim()) throw new BadRequestException('csv required');
  return { csv: b.csv, apply: b.apply === true };
}

@Controller('importer/members')
@UseGuards(ClerkAuthGuard)
export class ImporterController {
  constructor(private readonly svc: ImporterService) {}

  @Post('preview')
  @HttpCode(200)
  preview(@CurrentUser() u: AuthenticatedUser, @Body() body: unknown) {
    const b = validate(body);
    return this.svc.planMembers(u.tenantId, b.csv);
  }

  @Post('apply')
  @HttpCode(200)
  apply(@CurrentUser() u: AuthenticatedUser, @Body() body: unknown) {
    const b = validate(body);
    return this.svc.applyMembers(u.tenantId, b.csv);
  }
}
