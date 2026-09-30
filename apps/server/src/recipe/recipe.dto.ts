import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryRecipesDto {
  /** 逗号分隔的菜系：home,western,japanese,sichuan,light */
  @IsOptional()
  @IsString()
  cuisine?: string;

  /** 逗号分隔的标签：vegetarian,high-protein,low-cal,low-carb,quick,rice-friendly,comforting */
  @IsOptional()
  @IsString()
  tags?: string;

  /** 最长烹饪时间（分钟） */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  maxTime?: number;

  /** 逗号分隔的食材身份 id（全部包含语义，需同时具备全部所选食材） */
  @IsOptional()
  @IsString()
  ingredients?: string;

  /** 关键词搜索（匹配菜名和描述） */
  @IsOptional()
  @IsString()
  keyword?: string;

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
  limit?: number = 12;
}
