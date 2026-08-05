// UIMessage ↔ DB 映射器（ADR-0010）。
// content 存拼接文本（text parts 合并），toolCalls 存非文本 parts（工具调用/结果，
// 操作卡片渲染所需）。text 与 tool parts 都要能无损还原。
import type { UIMessage } from 'ai';

/** 任意 UIMessage part（宽松类型，DB 还原时不关心具体 data/tool 泛型） */
type AnyPart = UIMessage['parts'][number];

/** DB 中的 Message 行（Prisma 模型子集） */
export interface MessageRow {
  id: string;
  role: string;
  content: string;
  toolCalls: unknown;
  createdAt: Date;
}

/** 从一组 UIMessage parts 提取拼接文本 */
function partsToText(parts: AnyPart[]): string {
  return parts
    .filter((p): p is Extract<AnyPart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

/** 从一组 UIMessage parts 提取非文本 parts（工具调用/结果等，操作卡片渲染所需） */
function partsToToolParts(parts: AnyPart[]): AnyPart[] {
  return parts.filter((p) => p.type !== 'text');
}

/**
 * DB Message → UIMessage（无损还原）。
 * text part 从 content 重建；若 toolCalls 存在，原样拼回 parts 数组。
 */
export function toUIMessage(msg: MessageRow): UIMessage {
  const parts: AnyPart[] = [];
  if (msg.content) {
    parts.push({ type: 'text', text: msg.content });
  }
  if (Array.isArray(msg.toolCalls)) {
    for (const p of msg.toolCalls as AnyPart[]) {
      parts.push(p);
    }
  }
  return {
    id: msg.id,
    role: msg.role as UIMessage['role'],
    parts,
  };
}

/**
 * UIMessage → DB 列（content + toolCalls）。
 * text parts 合并为 content；非文本 parts 存入 toolCalls。
 * 返回 null 表示该消息无可落库内容（既无文本也无工具 parts）。
 */
export function fromUIMessage(message: UIMessage): {
  role: string;
  content: string;
  toolCalls: unknown;
} | null {
  const parts = message.parts;
  const content = partsToText(parts);
  const toolParts = partsToToolParts(parts);
  if (!content && toolParts.length === 0) return null;
  return {
    role: message.role,
    content,
    toolCalls: toolParts.length > 0 ? toolParts : null,
  };
}
