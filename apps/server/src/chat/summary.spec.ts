// 摘要纯逻辑单测（W0.5）：序列化规则（text/tool 混合 parts）、增量拼接、空溢出早退。
// 零 DB 风格（参考 recommendation.scoring.spec.ts）；不导入 ai 运行时值（ts-jest 不转换 node_modules），
// 只 import type UIMessage（编译期擦除）。
import type { UIMessage } from 'ai';
import {
  serializeMessages,
  summarizeOverflow,
  SUMMARY_TRIGGER_THRESHOLD,
  type SummaryModel,
} from './summary';

let seq = 0;
const msg = (
  role: 'user' | 'assistant',
  parts: UIMessage['parts'],
): UIMessage => ({
  id: `m${++seq}`,
  role,
  parts,
});

/** fake 模型：记录每次调用入参，返回固定结果 */
function makeModel(result = '新摘要'): {
  model: SummaryModel;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    model: {
      summarize: (text: string) => {
        calls.push(text);
        return Promise.resolve(result);
      },
    },
  };
}

describe('serializeMessages 序列化规则', () => {
  it('text part 取原文，带角色前缀', () => {
    const text = serializeMessages([
      msg('user', [{ type: 'text', text: '我在减脂，晚上吃什么？' }]),
      msg('assistant', [{ type: 'text', text: '推荐西兰花炒鸡胸。' }]),
    ]);
    expect(text).toContain('用户：');
    expect(text).toContain('我在减脂，晚上吃什么？');
    expect(text).toContain('助手：');
    expect(text).toContain('推荐西兰花炒鸡胸。');
  });

  it('tool part 折成一行（语义对齐前端 TOOL_LABELS）', () => {
    const text = serializeMessages([
      msg('assistant', [
        {
          type: 'tool-add_pantry_items',
          toolCallId: 't1',
          state: 'input-available',
          input: { names: ['牛腩', '鸡蛋'] },
        },
      ]),
    ]);
    expect(text).toContain('[操作] 添加食材：牛腩、鸡蛋');
  });

  it('混合 text/tool parts 保序，reasoning 等结构噪音被跳过', () => {
    const text = serializeMessages([
      msg('assistant', [
        { type: 'reasoning', text: '（内部推理）' },
        { type: 'text', text: '我不吃香菜。' },
        {
          type: 'tool-update_preferences',
          toolCallId: 't2',
          state: 'input-available',
          input: { addDisliked: ['香菜'] },
        },
      ]),
    ]);
    expect(text).toContain('我不吃香菜。');
    expect(text).toContain('[操作] 偏好变更：新增忌口 香菜');
    expect(text).not.toContain('内部推理');
  });
});

describe('summarizeOverflow 增量拼接', () => {
  it('有旧摘要时，把旧摘要 + 新溢出消息一起喂给模型，返回新摘要', async () => {
    const { model, calls } = makeModel();
    const result = await summarizeOverflow(model, '旧摘要：减脂餐话题', [
      msg('user', [{ type: 'text', text: '我们改成吃火锅吧。' }]),
    ]);
    expect(result).toBe('新摘要');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('旧摘要：减脂餐话题');
    expect(calls[0]).toContain('我们改成吃火锅吧。');
  });

  it('无旧摘要时，只喂溢出消息（首轮生成）', async () => {
    const { model, calls } = makeModel();
    await summarizeOverflow(model, null, [
      msg('user', [{ type: 'text', text: '减脂餐怎么安排？' }]),
    ]);
    expect(calls[0]).toContain('减脂餐怎么安排？');
    expect(calls[0]).not.toContain('已有会话摘要');
  });

  it('空溢出早退：不调模型，直接返回旧摘要', async () => {
    const { model, calls } = makeModel();
    const result = await summarizeOverflow(model, '旧摘要', [
      msg('assistant', []),
    ]);
    expect(result).toBe('旧摘要');
    expect(calls).toHaveLength(0);
  });

  it('仅含结构噪音（全部被跳过）的消息序列化为空，同样早退', async () => {
    const { model, calls } = makeModel();
    const result = await summarizeOverflow(model, '旧摘要', [
      msg('assistant', [{ type: 'reasoning', text: '思考中' }]),
    ]);
    expect(result).toBe('旧摘要');
    expect(calls).toHaveLength(0);
  });
});

describe('SUMMARY_TRIGGER_THRESHOLD', () => {
  it('导出了触发阈值常量（ADR-0012：以代码为准）', () => {
    expect(SUMMARY_TRIGGER_THRESHOLD).toBeGreaterThan(0);
  });
});
