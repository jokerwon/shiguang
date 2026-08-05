// UIMessage ↔ DB 映射器（ADR-0010）。
// parts 字段存原始 parts 数组（保序，含 text 与 tool 调用/结果的交错结构）；
// content 仍存拼接文本（= text parts 合并）作为冗余，供 title 生成 / 调试 / 全文场景使用，
// 不再作为还原 parts 的来源。toolCalls 保留为兼容列，但还原已改走 parts。
import type { UIMessage } from 'ai';

/** 任意 UIMessage part（宽松类型，DB 还原时不关心具体 data/tool 泛型） */
type AnyPart = UIMessage['parts'][number];

/** DB 中的 Message 行（Prisma 模型子集） */
export interface MessageRow {
  id: string;
  role: string;
  content: string;
  toolCalls: unknown;
  parts: unknown;
  createdAt: Date;
}

/** 从一组 UIMessage parts 提取拼接文本 */
function partsToText(parts: AnyPart[]): string {
  return parts
    .filter((p): p is Extract<AnyPart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

/**
 * DB Message → UIMessage（无损还原，保留原始交错顺序）。
 * parts 从 `parts` 列原样取回；旧数据若无 parts 列则退化到 content + toolCalls 拼装
 * （此时 text 在前、tool 在后，与历史行为一致）。
 */
export function toUIMessage(msg: MessageRow): UIMessage {
  let parts: AnyPart[];
  if (Array.isArray(msg.parts)) {
    parts = msg.parts as AnyPart[];
  } else {
    // 兼容旧数据（无 parts 列）：content → text part，toolCalls → tool parts
    parts = [];
    if (msg.content) {
      parts.push({ type: 'text', text: msg.content });
    }
    if (Array.isArray(msg.toolCalls)) {
      for (const p of msg.toolCalls as AnyPart[]) {
        parts.push(p);
      }
    }
  }
  return {
    id: msg.id,
    role: msg.role as UIMessage['role'],
    parts,
  };
}

/**
 * UIMessage → DB 列（parts 保序 + content 派生）。
 * parts 原样落库（保序，保留 text 与 tool 的交错结构）；
 * content 为 text parts 合并的冗余字段；toolCalls 仍存非文本 parts（兼容旧消费者）。
 * 返回 null 表示该消息无可落库内容（既无文本也无任何 parts）。
 */
export function fromUIMessage(message: UIMessage): {
  role: string;
  content: string;
  toolCalls: unknown;
  parts: unknown;
} | null {
  const parts = message.parts;
  const content = partsToText(parts);
  const toolParts = parts.filter((p) => p.type !== 'text');
  if (!content && toolParts.length === 0 && parts.length === 0) return null;
  return {
    role: message.role,
    content,
    toolCalls: toolParts.length > 0 ? toolParts : null,
    parts,
  };
}
