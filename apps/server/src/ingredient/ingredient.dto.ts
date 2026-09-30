import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import type { IngredientCategory } from 'generated/prisma/client';

/** 一层浏览分类取值（与 prisma/schema.prisma 的 IngredientCategory 对应） */
export const INGREDIENT_CATEGORIES = [
  'VEGETABLE',
  'MEAT',
  'POULTRY',
  'EGG',
  'SEAFOOD',
  'SOY',
  'GRAIN',
  'SEASONING',
  'OTHER',
] as const;

export class QueryIngredientsDto {
  /** 名称或别名关键词 */
  @IsOptional()
  @IsString()
  keyword?: string;

  /** 主要浏览分类（单层，不做多级树） */
  @IsOptional()
  @IsIn(INGREDIENT_CATEGORIES)
  category?: IngredientCategory;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 24;
}

/** 身份解析入参：`terms` 逗号分隔或多个同名参数；非字符串（嵌套对象等）一律忽略 */
export class IdentifyIngredientsDto {
  @IsOptional()
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : [value])
      .filter((v): v is string => typeof v === 'string')
      .flatMap((v) => v.split(','))
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20),
  )
  @IsString({ each: true })
  terms: string[] = [];
}
