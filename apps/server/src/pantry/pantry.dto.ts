import { IsArray, IsString } from 'class-validator';

/**
 * PUT /pantry body:整体替换当前用户的食材清单(裸 string[])。
 * 允许空数组(清空 pantry 是合法操作)。
 * 空白/空字符串不在 DTO 层拦截,由 service 规整(trim + 过滤空 + 去重)。
 */
export class ReplacePantryDto {
  @IsArray()
  @IsString({ each: true })
  names: string[];
}
