// UIMessage ↔ DB 映射器（ADR-0010/0011）。
// parts 字段存原始 parts 数组（保序，含 text 与 tool 调用/结果的交错结构），是还原的唯一来源。
// content/toolCalls 列已砍除（ADR-0011：死重量，无活读取者）；旧行已在迁移中折算进 parts。
import type { UIMessage } from 'ai';

/** 任意 UIMessage part（宽松类型，DB 还原时不关心具体 data/tool 泛型） */
type AnyPart = UIMessage['parts'][number];

/** DB 中的 Message 行（Prisma 模型子集） */
export interface MessageRow {
  id: string;
  seq: number;
  role: string;
  parts: unknown;
  createdAt: Date;
}

/** 从一组 UIMessage parts 提取拼接文本（title 生成仍用，见 chat.service.ts 的 messageText） */
export function partsToText(parts: AnyPart[]): string {
  return parts
    .filter((p): p is Extract<AnyPart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

/**
 * DB Message → UIMessage（无损还原，保留原始交错顺序）。
 * parts 从 `parts` 列原样取回（迁移后必有值）。
 */
export function toUIMessage(msg: MessageRow): UIMessage {
  const parts = Array.isArray(msg.parts) ? (msg.parts as AnyPart[]) : [];
  return {
    id: msg.id,
    role: msg.role as UIMessage['role'],
    parts,
  };
}

/**
 * UIMessage → DB 列（parts 保序）。
 * parts 原样落库（保序，保留 text 与 tool 的交错结构）。
 * 返回 null 表示该消息无可落库内容（既无文本也无任何 parts）。
 */
export function fromUIMessage(message: UIMessage): {
  role: string;
  parts: unknown;
} | null {
  const parts = message.parts;
  if (parts.length === 0) return null;
  return {
    role: message.role,
    parts,
  };
}
