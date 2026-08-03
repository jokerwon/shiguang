import { Module } from '@nestjs/common';
import { PreferenceController } from './preference.controller';
import { PreferenceService } from './preference.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule], // 拿到 JwtAuthGuard + JwtService
  controllers: [PreferenceController],
  providers: [PreferenceService],
})
export class PreferenceModule {}
