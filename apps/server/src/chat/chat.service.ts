import { Inject, Injectable } from '@nestjs/common';
import {
  convertToModelMessages,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type UIMessage,
} from 'ai';
import type { Recipe } from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecommendationService } from '../recipe/recommendation.service';
import { CUISINE_ZH, TAG_ZH, toResponse } from '../recipe/recipe.mapper';
import type { CandidateRecipe } from './prompts';
import { buildSystemPrompt } from './prompts';

/** 按服务器本地月份推导季节 */
function currentSeason(): 'spring' | 'summer' | 'autumn' | 'winter' {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

function toCandidate(recipe: Recipe): CandidateRecipe {
  const r = toResponse(recipe);
  return {
    name: r.name,
    cuisine: CUISINE_ZH[r.cuisine] ?? r.cuisine,
    time: r.time,
    kcal: r.kcal,
    protein: r.protein,
    tags: r.tags.map((t) => TAG_ZH[t] ?? t),
  };
}

@Injectable()
export class ChatService {
  constructor(
    @Inject('CHAT_MODEL') private readonly model: LanguageModel,
    private readonly recommendation: RecommendationService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 流式对话（ADR-0006）：每次请求重新构建 system prompt，
   * 注入偏好档案 + pantry + 个性化 top 8 候选菜谱。
   * 注意：必须是请求级构建——曾经的单例 systemPrompt 会在多用户间串上下文。
   */
  async stream(messages: UIMessage[], userId: string) {
    const [signals, candidates, user] = await Promise.all([
      this.recommendation.loadSignals(userId),
      this.recommendation.recommend(userId, 8),
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
      candidates: candidates.map(toCandidate),
    });

    const result = streamText({
      model: this.model,
      system,
      messages: await convertToModelMessages(messages),
    });

    return toUIMessageStream({ stream: result.stream });
  }
}
