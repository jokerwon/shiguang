import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  convertToModelMessages,
  generateId,
  generateText,
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
import {
  ConversationService,
  CONTEXT_WINDOW,
} from '../conversation/conversation.service';
import {
  toUIMessage,
  type MessageRow,
} from '../conversation/conversation.mapper';
import { buildSystemPrompt } from './prompts';
import { createChatTools, type ChatToolDeps } from './tools';
import {
  summarizeOverflow,
  SUMMARY_TRIGGER_THRESHOLD,
  type SummaryModel,
} from './summary';

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
  private readonly logger = new Logger(ChatService.name);

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

    // 3. DB 取最近 N 条组装上下文（滑窗，ADR-0010）+ 会话摘要（ADR-0012）
    const [history, conversationSummary] = await Promise.all([
      this.conversation.recentMessages(userId, conversationId),
      this.conversation.summary(userId, conversationId),
    ]);

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
      conversationSummary: conversationSummary ?? undefined,
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
        // 溢出摘要触发（ADR-0012 决策 4）：fire-and-forget，不阻塞用户路径。
        // 失败降级 = 纯滑窗，仅记日志。
        void this.maybeSummarize(conversationId).catch((e) => {
          this.logger.error(
            `会话 ${conversationId} 摘要生成失败（降级为纯滑窗）：${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        });
      },
    });

    return { stream, conversationId };
  }

  /**
   * 溢出摘要触发（ADR-0012 决策 4）。
   * 溢出区 = seq ≤ maxSeq − CONTEXT_WINDOW 且 seq > summaryUpToSeq；
   * 攒够 SUMMARY_TRIGGER_THRESHOLD 条才起摘要。失败由调用方捕获，降级 = 纯滑窗。
   */
  private async maybeSummarize(conversationId: string): Promise<void> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { summary: true, summaryUpToSeq: true },
    });
    const maxAgg = await this.prisma.message.aggregate({
      where: { conversationId },
      _max: { seq: true },
    });
    const maxSeq = maxAgg._max.seq ?? 0;
    const summaryUpToSeq = conv?.summaryUpToSeq ?? 0;

    const overflowStart = summaryUpToSeq + 1;
    const overflowEnd = maxSeq - CONTEXT_WINDOW;
    if (overflowStart > overflowEnd) return; // 尚无溢出
    const overflowCount = overflowEnd - overflowStart + 1;
    if (overflowCount < SUMMARY_TRIGGER_THRESHOLD) return; // 未攒够阈值

    const rows = await this.prisma.message.findMany({
      where: { conversationId, seq: { gte: overflowStart, lte: overflowEnd } },
      orderBy: { seq: 'asc' },
    });
    const messages = rows.map((r) => toUIMessage(r as MessageRow));

    const newSummary = await summarizeOverflow(
      this.summaryModel(),
      conv?.summary ?? null,
      messages,
    );
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { summary: newSummary, summaryUpToSeq: overflowEnd },
    });
    this.logger.log(
      `会话 ${conversationId} 摘要更新至 seq ${overflowEnd}（新增 ${overflowCount} 条）`,
    );
  }

  /** 摘要用的模型适配器（复用 CHAT_MODEL，一次 generateText 调用） */
  private summaryModel(): SummaryModel {
    return {
      summarize: async (text: string) => {
        const { text: out } = await generateText({
          model: this.model,
          prompt: text,
        });
        return out;
      },
    };
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
