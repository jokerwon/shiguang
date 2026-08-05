// mapper 单测：覆盖 text-only / 含 toolCalls / 空 content 三种形态（W0.4 验收）。
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
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe('conversation.mapper', () => {
  describe('toUIMessage', () => {
    it('text-only: content → 单个 text part', () => {
      const u = toUIMessage(row({ role: 'user', content: '你好' }));
      expect(u.role).toBe('user');
      expect(u.parts).toEqual([{ type: 'text', text: '你好' }]);
    });

    it('含 toolCalls: text part + tool parts 无损还原', () => {
      const toolPart = {
        type: 'tool-search_recipes',
        toolCallId: 'call_1',
        state: 'output-available',
        input: { keyword: '鸡蛋' },
        output: [{ id: 'r1', name: '番茄炒蛋' }],
      } as unknown as AnyPart;
      const u = toUIMessage(
        row({ content: '已为你找到菜谱', toolCalls: [toolPart] }),
      );
      expect(u.parts).toHaveLength(2);
      expect(u.parts[0]).toEqual({ type: 'text', text: '已为你找到菜谱' });
      expect(u.parts[1]).toEqual(toolPart);
    });

    it('空 content 且无 toolCalls: parts 为空数组', () => {
      const u = toUIMessage(row({ content: '', toolCalls: null }));
      expect(u.parts).toEqual([]);
    });
  });

  describe('fromUIMessage', () => {
    it('text-only: 合并为 content，toolCalls 为 null', () => {
      const msg: UIMessage = {
        id: 'm1',
        role: 'user',
        parts: [{ type: 'text', text: '你好' }],
      };
      expect(fromUIMessage(msg)).toEqual({
        role: 'user',
        content: '你好',
        toolCalls: null,
      });
    });

    it('多个 text parts 合并拼接', () => {
      const msg: UIMessage = {
        id: 'm1',
        role: 'assistant',
        parts: [
          { type: 'text', text: '第一段。' },
          { type: 'text', text: '第二段。' },
        ],
      };
      expect(fromUIMessage(msg)?.content).toBe('第一段。第二段。');
    });

    it('含 tool parts: content 取文本，toolCalls 存非文本 parts', () => {
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
    });

    it('空 parts: 返回 null', () => {
      const msg: UIMessage = { id: 'm1', role: 'user', parts: [] };
      expect(fromUIMessage(msg)).toBeNull();
    });
  });

  describe('往返一致性', () => {
    it('text-only toUIMessage → fromUIMessage 无损', () => {
      const original: UIMessage = {
        id: 'm1',
        role: 'user',
        parts: [{ type: 'text', text: '你好' }],
      };
      const cols = fromUIMessage(original);
      const restored = toUIMessage({
        id: original.id,
        role: cols.role,
        content: cols.content,
        toolCalls: cols.toolCalls,
        createdAt: new Date(),
      });
      expect(restored.parts).toEqual(original.parts);
    });
  });
});
