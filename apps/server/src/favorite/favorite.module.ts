import { Module } from '@nestjs/common';
import { FavoriteController } from './favorite.controller';
import { FavoriteService } from './favorite.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule], // 拿到 JwtAuthGuard + JwtService
  controllers: [FavoriteController],
  providers: [FavoriteService],
})
export class FavoriteModule {}
