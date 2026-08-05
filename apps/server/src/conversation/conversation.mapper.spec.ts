// mapper 单测：覆盖 text-only / 含 toolCalls / 交错保序 / 旧数据兼容 / 空 content 五种形态。
// 零 DB，纯函数。
import {
  toUIMessage,
  fromUIMessage,
  type MessageRow,
} from './conversation.mapper';
import type { UIMessage } from 'ai';

type AnyPart = UIMessage['parts'][number];

const row = (over: Partial<MessageRow> = {}): MessageRow => ({
  id: 'm1',
  role: 'assistant',
  content: '',
  toolCalls: null,
  parts: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe('conversation.mapper', () => {
  describe('toUIMessage', () => {
    it('text-only: parts 列 → 单个 text part', () => {
      const u = toUIMessage(
        row({
          role: 'user',
          content: '你好',
          parts: [{ type: 'text', text: '你好' }],
        }),
      );
      expect(u.role).toBe('user');
      expect(u.parts).toEqual([{ type: 'text', text: '你好' }]);
    });

    it('含 tool parts: parts 列原样还原（含交错顺序）', () => {
      const textPart = { type: 'text', text: '已为你找到菜谱' };
      const toolPart = {
        type: 'tool-search_recipes',
        toolCallId: 'call_1',
        state: 'output-available',
        input: { keyword: '鸡蛋' },
        output: [{ id: 'r1', name: '番茄炒蛋' }],
      } as unknown as AnyPart;
      const u = toUIMessage(
        row({ content: '已为你找到菜谱', parts: [textPart, toolPart] }),
      );
      expect(u.parts).toEqual([textPart, toolPart]);
    });

    it('tool 在前、text 在后的交错顺序被保留', () => {
      const toolPart = {
        type: 'tool-search_recipes',
        toolCallId: 'call_1',
        state: 'output-available',
        input: {},
        output: [],
      } as unknown as AnyPart;
      const textPart = { type: 'text', text: '找到了' };
      const u = toUIMessage(row({ parts: [toolPart, textPart] }));
      // 还原后仍是 tool 在前、text 在后——不被重排为 text 优先
      expect(u.parts).toEqual([toolPart, textPart]);
    });

    it('旧数据兼容：无 parts 列时退化到 content + toolCalls 拼装（text 在前）', () => {
      const toolPart = {
        type: 'tool-set_favorite',
        toolCallId: 'call_2',
        state: 'output-available',
        input: { recipeId: 'r1', saved: true },
        output: { saved: true, favorites: ['r1'] },
      } as unknown as AnyPart;
      const u = toUIMessage(
        row({ content: '已收藏', toolCalls: [toolPart], parts: null }),
      );
      expect(u.parts).toHaveLength(2);
      expect(u.parts[0]).toEqual({ type: 'text', text: '已收藏' });
      expect(u.parts[1]).toEqual(toolPart);
    });

    it('空 content 且无 parts: parts 为空数组', () => {
      const u = toUIMessage(row({ content: '', parts: null }));
      expect(u.parts).toEqual([]);
    });
  });

  describe('fromUIMessage', () => {
    it('text-only: 合并为 content，toolCalls 为 null，parts 原样', () => {
      const msg: UIMessage = {
        id: 'm1',
        role: 'user',
        parts: [{ type: 'text', text: '你好' }],
      };
      expect(fromUIMessage(msg)).toEqual({
        role: 'user',
        content: '你好',
        toolCalls: null,
        parts: [{ type: 'text', text: '你好' }],
      });
    });

    it('多个 text parts 合并拼接，parts 保留原始分段', () => {
      const msg: UIMessage = {
        id: 'm1',
        role: 'assistant',
        parts: [
          { type: 'text', text: '第一段。' },
          { type: 'text', text: '第二段。' },
        ],
      };
      const cols = fromUIMessage(msg);
      expect(cols?.content).toBe('第一段。第二段。');
      expect(cols?.parts).toEqual(msg.parts);
    });

    it('含 tool parts: content 取文本，toolCalls 存非文本 parts，parts 保序', () => {
      const toolPart = {
        type: 'tool-set_favorite',
        toolCallId: 'call_2',
        state: 'output-available',
        input: { recipeId: 'r1', saved: true },
        output: { saved: true, favorites: ['r1'] },
      } as unknown as AnyPart;
      const msg: UIMessage = {
        id: 'm1',
        role: 'assistant',
        parts: [{ type: 'text', text: '已收藏' }, toolPart],
      };
      const cols = fromUIMessage(msg);
      expect(cols?.content).toBe('已收藏');
      expect(cols?.toolCalls).toEqual([toolPart]);
      expect(cols?.parts).toEqual(msg.parts);
    });

    it('空 parts: 返回 null', () => {
      const msg: UIMessage = { id: 'm1', role: 'user', parts: [] };
      expect(fromUIMessage(msg)).toBeNull();
    });
  });

  describe('往返一致性', () => {
    it('含交错的 toUIMessage → fromUIMessage 无损（顺序保留）', () => {
      const toolPart = {
        type: 'tool-search_recipes',
        toolCallId: 'call_1',
        state: 'output-available',
        input: { keyword: '鸡蛋' },
        output: [{ id: 'r1', name: '番茄炒蛋' }],
      } as unknown as AnyPart;
      const original: UIMessage = {
        id: 'm1',
        role: 'assistant',
        parts: [toolPart, { type: 'text', text: '找到了' }],
      };
      const cols = fromUIMessage(original);
      const restored = toUIMessage({
        id: original.id,
        role: cols.role,
        content: cols.content,
        toolCalls: cols.toolCalls,
        parts: cols.parts,
        createdAt: new Date(),
      });
      expect(restored.parts).toEqual(original.parts);
    });
  });
});
