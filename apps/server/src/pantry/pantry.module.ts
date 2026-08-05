import { Module } from '@nestjs/common';
import { PantryController } from './pantry.controller';
import { PantryService } from './pantry.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule], // 拿到 JwtAuthGuard + JwtService
  controllers: [PantryController],
  providers: [PantryService],
  exports: [PantryService], // ChatModule 写工具复用 replace 语义（ADR-0009）
})
export class PantryModule {}
