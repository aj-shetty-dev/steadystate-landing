import { Body, Controller, Get, HttpCode, Post, UseGuards, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  loginRequestSchema,
  signupRequestSchema,
  type AuthResponse,
  type LoginRequest,
  type SignupRequest,
} from '@steady-state/shared-types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { ClerkAuthGuard } from './clerk.guard';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedUser } from './jwt.strategy';

const onboardSchema = z.object({
  tenantName: z.string().min(1).max(100),
  fullName: z.string().min(1).max(100),
  email: z.string().email(),
  clerkId: z.string().min(1),
});

@Controller('auth')
@Throttle({ default: { ttl: 60_000, limit: 10 } })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @UsePipes(new ZodValidationPipe(signupRequestSchema))
  signup(@Body() body: SignupRequest): Promise<AuthResponse> {
    return this.authService.signup(body);
  }

  @Post('login')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(loginRequestSchema))
  login(@Body() body: LoginRequest): Promise<AuthResponse> {
    return this.authService.login(body);
  }

  @Post('onboard')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(onboardSchema))
  onboard(@Body() body: z.infer<typeof onboardSchema>) {
    return this.authService.onboard(body);
  }

  @Get('me')
  @UseGuards(ClerkAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Post('me')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  meLegacy(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
