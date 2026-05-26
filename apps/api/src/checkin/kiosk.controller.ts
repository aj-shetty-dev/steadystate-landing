import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { CheckInService } from './checkin.service';
import { StaffService } from '../staff/staff.service';

const kioskPinSchema = z.object({
  tenantId: z.string().min(1),
  pin: z.string().regex(/^\d{4,8}$/),
});

const kioskCheckInSchema = z.object({
  tenantId: z.string().min(1),
  staffId: z.string().min(1),
  pin: z.string().regex(/^\d{4,8}$/),
  memberId: z.string().optional(),
  phone: z.string().optional(),
  qrToken: z.string().optional(),
});

@Controller('kiosk')
export class KioskController {
  constructor(
    private readonly checkinService: CheckInService,
    private readonly staff: StaffService,
  ) {}

  @Post('staff-auth')
  @HttpCode(200)
  async authenticateStaff(@Body() body: unknown) {
    const parsed = kioskPinSchema.parse(body);
    const staff = await this.staff.findActiveByPin(parsed.tenantId, parsed.pin);
    if (!staff) throw new BadRequestException('Invalid PIN');
    return staff;
  }

  @Post('checkin')
  @HttpCode(200)
  async kioskCheckIn(@Body() body: unknown) {
    const parsed = kioskCheckInSchema.parse(body);
    const ok = await this.staff.verifyPin(parsed.tenantId, parsed.staffId, parsed.pin);
    if (!ok) throw new BadRequestException('Invalid staff PIN');
    return this.checkinService.create(parsed.tenantId, {
      source: 'KIOSK_PIN',
      memberId: parsed.memberId,
      phone: parsed.phone,
      qrToken: parsed.qrToken,
      staffId: parsed.staffId,
    });
  }
}
