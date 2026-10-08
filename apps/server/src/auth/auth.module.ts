import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

@Global()
@Module({
  imports: [
    // ADR-0013：access token 15 分钟短命，长效续期走 refresh token（opaque，不挂 JwtModule）。
    // 用 registerAsync：register 的 secret 在装饰器求值时读取，那时 ConfigModule 还没加载
    // .env，只会拿到 undefined 而静默回退到硬编码公开密钥。
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('缺少 JWT_SECRET：请在 apps/server/.env 配置后启动');
        }
        return { secret, signOptions: { expiresIn: '15m' } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard],
  exports: [AuthService, JwtModule, JwtAuthGuard, OptionalJwtAuthGuard],
})
export class AuthModule {}
