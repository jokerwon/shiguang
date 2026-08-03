import { IsOptional, IsArray, IsString, IsEnum } from 'class-validator';
import { HealthGoal } from 'generated/prisma/client';

/**
 * PUT /preferences body:部分更新用户偏好档案。
 * 所有字段可选,只更新传了的字段。
 */
export class UpdatePreferenceDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dislikedIngredients?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @IsOptional()
  @IsEnum(HealthGoal, { message: 'healthGoal 非法' })
  healthGoal?: HealthGoal;
}
