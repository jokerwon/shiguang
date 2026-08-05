import { Inject, Injectable } from '@nestjs/common';
import {
  convertToModelMessages,
  generateId,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type UIMessage,
} from 'ai';
import { PrismaService } from '../prisma/prisma.service';
import { RecommendationService } from '../recipe/recommendation.service';
import { PantryService } from '../pantry/pantry.service';
import { FavoriteService } from '../favorite/favorite.service';
import { PreferenceService } from '../preference/preference.service';
import { ConversationService } from '../conversation/conversation.service';
import { buildSystemPrompt } from './prompts';
import { createChatTools, type ChatToolDeps } from './tools';

/** 按服务器本地月份推导季节 */
function currentSeason(): 'spring' | 'summer' | 'autumn' | 'winter' {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

/** 从 UIMessage parts 中提取纯文本（用于生成会话标题） */
function messageText(message: UIMessage): string {
  return (message.parts as { type: string; text?: string }[])
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('');
}

/** tool-loop 最大步数（ADR-0009：多轮 tool round-trip 上限） */
const MAX_STEPS = 5;

@Injectable()
export class ChatService {
  constructor(
    @Inject('CHAT_MODEL') private readonly model: LanguageModel,
    private readonly recommendation: RecommendationService,
    private readonly prisma: PrismaService,
    private readonly pantry: PantryService,
    private readonly favorite: FavoriteService,
    private readonly preference: PreferenceService,
    private readonly conversation: ConversationService,
  ) {}

  /**
   * 流式对话（ADR-0009 tool-loop + ADR-0010 持久化）。
   * 入参：conversationId（可选，无则创建会话）+ 最新一条用户消息。
   * 后端从 DB 取最近 N 条组装上下文（不信客户端全量历史）。
   */
  async stream(params: {
    conversationId?: string;
    message: UIMessage;
    userId: string;
  }) {
    const { userId, message } = params;
    const messageTextValue = messageText(message);

    // 1. 会话：无 id 则创建（title = 用户消息截断 ~20 字）
    let conversationId = params.conversationId;
    if (!conversationId) {
      const created = await this.conversation.create(userId, messageTextValue);
      conversationId = created.id;
    }

    // 2. 落库用户消息
    await this.conversation.appendMessage(conversationId, message);

    // 3. DB 取最近 N 条组装上下文（滑窗，ADR-0010）
    const history = await this.conversation.recentMessages(
      userId,
      conversationId,
    );

    // 4. 偏好/pantry 注入（仍需 loadSignals 拿 blocked + pantry + healthGoal）
    const [signals, user] = await Promise.all([
      this.recommendation.loadSignals(userId),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      }),
    ]);

    const system = buildSystemPrompt({
      userName: user?.displayName ?? undefined,
      dietaryRestrictions: signals.blocked,
      healthGoal: signals.healthGoal,
      pantryIngredients: signals.pantry,
      season: currentSeason(),
    });

    // 5. 装配工具集（闭包捕获 userId）
    const tools = createChatTools(this.toolDeps(), userId);

    // 6. 流式 tool-loop
    const result = streamText({
      model: this.model,
      system,
      messages: await convertToModelMessages(history),
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
    });

    // 7. 落库 assistant 消息（含 tool parts）+ touch 会话时间。
    //    用 toUIMessageStream 的 onFinish 拿最终 UIMessage[]，取最后一条 assistant。
    const conversationService = this.conversation;
    const stream = toUIMessageStream({
      stream: result.stream,
      // 显式生成 assistant message id：否则 onFinish 拿到的 message.id 为 ""，
      // 落库后 DB 主键变成空串（覆盖 @default(cuid())），且与客户端 useChat
      // 自行生成的 id 不一致。传入 generateMessageId 后，服务端生成 id 经
      // start chunk 下发客户端，DB 亦存同一 id——三方一致。
      generateMessageId: generateId,
      onFinish: async ({ messages }) => {
        const last = messages[messages.length - 1];
        if (last && last.role === 'assistant') {
          await conversationService.appendMessage(conversationId, last);
        }
        await conversationService.touch(conversationId);
      },
    });

    return { stream, conversationId };
  }

  /** 构造工具依赖（uid 由各方法入参传入） */
  private toolDeps(): ChatToolDeps {
    return {
      loadSignals: (uid) => this.recommendation.loadSignals(uid),
      findRecipes: () => this.prisma.recipe.findMany(),
      findRecipeById: async (id) =>
        this.prisma.recipe.findUnique({ where: { id } }),
      pantryFindAll: (uid) => this.pantry.findAll(uid),
      pantryReplace: (uid, names) => this.pantry.replace(uid, names),
      favoriteFindAll: (uid) => this.favorite.findAll(uid),
      favoriteSet: (uid, recipeId, saved) =>
        this.favorite.set(uid, recipeId, saved),
      preferenceFind: async (uid) => {
        const p = await this.preference.find(uid);
        return {
          dislikedIngredients: p.dislikedIngredients,
          allergens: p.allergens,
          healthGoal: p.healthGoal,
        };
      },
    };
  }
}
