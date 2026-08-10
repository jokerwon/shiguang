// 会话摘要纯逻辑（ADR-0010/0012）：滑窗之外消息的增量压缩。
// 依赖显式注入（model.summarize），不进 Nest 容器也能跑（种子脚本进程内直调）。
// 序列化规则：text part 取原文；tool-* part 折成一行（语义对齐前端 TOOL_LABELS，tool.tsx）。
import type { UIMessage } from 'ai';

/** 触发阈值：溢出区（seq ≤ maxSeq−滑窗 且 seq > summaryUpToSeq）攒够多少条起一次摘要 */
export const SUMMARY_TRIGGER_THRESHOLD = 10;

/** 注入给摘要调用的模型接口（最小面，便于单测注入 fake） */
export interface SummaryModel {
  /** 把一段对话文本压缩为一段简洁的中文摘要 */
  summarize(messages: string): Promise<string>;
}

/** 与前端 TOOL_LABELS 语义对齐的工具中文名（apps/web/components/ai-elements/tool.tsx） */
const TOOL_LABELS: Record<string, string> = {
  search_recipes: '搜索菜谱',
  get_recipe: '查看菜谱详情',
  get_pantry: '查看食材清单',
  get_favorites: '查看收藏',
  get_preferences: '查看偏好',
  add_pantry_items: '添加食材',
  remove_pantry_items: '移除食材',
  set_favorite: '收藏操作',
  update_preferences: '偏好变更',
};

/** update_preferences 草稿操作集的中文标签 */
const PREFERENCE_OP_LABELS: Record<string, string> = {
  addDisliked: '新增忌口',
  removeDisliked: '解除忌口',
  addAllergens: '新增过敏原',
  removeAllergens: '解除过敏原',
  setHealthGoal: '健康目标',
};

/** 单个 part → 一行文本；text 取原文，tool-* 折一行，其余（reasoning 等）跳过 */
function partToLine(part: {
  type: string;
  text?: string;
  input?: unknown;
}): string | null {
  if (part.type === 'text') {
    const text = (part.text ?? '').trim();
    return text || null;
  }
  if (part.type.startsWith('tool-')) {
    const name = part.type.slice('tool-'.length);
    const label = TOOL_LABELS[name] ?? name;
    const input = (part.input ?? {}) as Record<string, unknown>;
    if (Array.isArray(input.names)) {
      const names = (input.names as unknown[])
        .filter((n) => typeof n === 'string')
        .join('、');
      return `[操作] ${label}${names ? `：${names}` : ''}`;
    }
    if (typeof input.recipeId === 'string') {
      return `[操作] ${label}：${input.recipeId}`;
    }
    if (name === 'update_preferences') {
      const bits: string[] = [];
      for (const [key, opLabel] of Object.entries(PREFERENCE_OP_LABELS)) {
        const v = input[key];
        if (Array.isArray(v) && v.length > 0) {
          bits.push(
            `${opLabel} ${v.filter((x) => typeof x === 'string').join('、')}`,
          );
        } else if (typeof v === 'string' && v) {
          bits.push(`${opLabel} ${v}`);
        }
      }
      return `[操作] ${label}${bits.length > 0 ? `：${bits.join('；')}` : ''}`;
    }
    return `[操作] ${label}`;
  }
  return null;
}

/** 把消息序列化为供摘要的纯文本（丢弃结构噪音，保留话题与关键动作） */
export function serializeMessages(messages: UIMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    const role = m.role === 'user' ? '用户' : '助手';
    const parts = m.parts as Array<{
      type: string;
      text?: string;
      input?: unknown;
    }>;
    const body = parts
      .map((p) => partToLine(p))
      .filter((l): l is string => l !== null)
      .join('\n');
    if (body) lines.push(`${role}：\n${body}`);
  }
  return lines.join('\n\n');
}

/**
 * 增量拼接摘要：新摘要 = 压缩(旧摘要 + 新溢出消息)。
 * - 空溢出（messages 序列化为空）→ 直接返回旧摘要，不调模型（早退）。
 * - model.summarize 抛错由调用方捕获（降级 = 纯滑窗，ADR-0012 决策 4）。
 */
export async function summarizeOverflow(
  model: SummaryModel,
  oldSummary: string | null | undefined,
  messages: UIMessage[],
): Promise<string> {
  const serialized = serializeMessages(messages);
  if (!serialized.trim()) return oldSummary ?? '';
  const prompt = oldSummary
    ? `已有会话摘要：\n${oldSummary}\n\n以下是滑窗之外新增的对话记录，请把新增内容合并进摘要（保留话题、关键偏好、已确定的菜谱选择），输出一段简洁的中文摘要：\n\n${serialized}`
    : `请把下面的对话记录提炼为一段简洁的中文摘要（保留话题、关键偏好、已确定的菜谱选择）：\n\n${serialized}`;
  return model.summarize(prompt);
}
