import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';

@Module({
  imports: [AuthModule], // JwtAuthGuard
  controllers: [ConversationController],
  providers: [ConversationService],
  exports: [ConversationService], // ChatModule 落库消息需要
})
export class ConversationModule {}
