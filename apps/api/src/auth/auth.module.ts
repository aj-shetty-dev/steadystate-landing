import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { SeedModule } from '../seed/seed.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ClerkAuthGuard } from './clerk.guard';
import { JwtStrategy } from './jwt.strategy';
import { MemberAuthGuard } from './member-auth.guard';
import { PasswordHasher } from './password-hasher.service';

@Global()
@Module({
  imports: [PassportModule, JwtModule.register({}), PrismaModule, SeedModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PasswordHasher, ClerkAuthGuard, MemberAuthGuard],
  exports: [AuthService, JwtStrategy, PasswordHasher, ClerkAuthGuard, MemberAuthGuard],
})
export class AuthModule {}
