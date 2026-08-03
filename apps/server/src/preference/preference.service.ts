import { Injectable } from '@nestjs/common';
import type { HealthGoal } from 'generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdatePreferenceDto } from './preference.dto';

export interface PreferenceResponse {
  dislikedIngredients: string[];
  allergens: string[];
  healthGoal: HealthGoal;
}

const DEFAULT: PreferenceResponse = {
  dislikedIngredients: [],
  allergens: [],
  healthGoal: 'BALANCED',
};

@Injectable()
export class PreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** 返回用户偏好,无记录则返默认值 */
  async find(userId: string): Promise<PreferenceResponse> {
    const p = await this.prisma.userPreference.findUnique({
      where: { userId },
    });
    if (!p) return { ...DEFAULT };
    return {
      dislikedIngredients: p.dislikedIngredients,
      allergens: p.allergens,
      healthGoal: p.healthGoal,
    };
  }

  /** upsert 用户偏好(userId @unique,用 upsert) */
  async upsert(
    userId: string,
    dto: UpdatePreferenceDto,
  ): Promise<PreferenceResponse> {
    const p = await this.prisma.userPreference.upsert({
      where: { userId },
      create: {
        userId,
        dislikedIngredients: dto.dislikedIngredients ?? [],
        allergens: dto.allergens ?? [],
        healthGoal: dto.healthGoal ?? 'BALANCED',
      },
      update: {
        ...(dto.dislikedIngredients && {
          dislikedIngredients: dto.dislikedIngredients,
        }),
        ...(dto.allergens && { allergens: dto.allergens }),
        ...(dto.healthGoal && { healthGoal: dto.healthGoal }),
      },
    });
    return {
      dislikedIngredients: p.dislikedIngredients,
      allergens: p.allergens,
      healthGoal: p.healthGoal,
    };
  }
}
