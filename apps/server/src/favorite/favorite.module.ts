import { Module } from '@nestjs/common';
import { FavoriteController } from './favorite.controller';
import { FavoriteService } from './favorite.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule], // 拿到 JwtAuthGuard + JwtService
  controllers: [FavoriteController],
  providers: [FavoriteService],
  exports: [FavoriteService], // ChatModule 写工具复用 set 语义（ADR-0009）
})
export class FavoriteModule {}
