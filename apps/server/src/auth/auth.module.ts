import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

@Global()
@Module({
  imports: [
    // ADR-0013：access token 15 分钟短命，长效续期走 refresh token（opaque，不挂 JwtModule）
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'shiguang-dev-secret',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard],
  exports: [AuthService, JwtModule, JwtAuthGuard, OptionalJwtAuthGuard],
})
export class AuthModule {}
