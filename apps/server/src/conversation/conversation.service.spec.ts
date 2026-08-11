/* eslint-disable @typescript-eslint/require-await */
// 会话服务单测（Phase 3.5 / W2.1）：appendMessage seq 不变量。
// 零 DB：注入对象字面量 fake prisma，只实现 message.aggregate / message.create，
// 验证 ADR-0011 两个核心不变量——seq = max(seq)+1（空会话从 1 起）、
// @@unique 冲突重试后落库正确 seq。
// jest.mock 拦截 PrismaService，避免加载真实 PrismaClient（generated/prisma/client
// 运行时导入在 jest 下解析失败）。
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class {},
}));
import type { UIMessage } from 'ai';
import { ConversationService } from './conversation.service';

/** 构造一条带 text part 的 UIMessage（fromUIMessage 需 parts 非空才落库） */
function textMessage(id: string, text: string): UIMessage {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text }],
  } as unknown as UIMessage;
}

/** P2002 唯一约束冲突（Prisma 已知错误码） */
function p2002(): { code: 'P2002' } {
  return { code: 'P2002' };
}

/**
 * fake prisma：aggregate 返回给定 max seq（null 表空会话）；
 * create 按预设的错误序列抛错，耗尽后正常落库。记录每次 create 收到的 seq。
 */
function makeFakePrisma(maxSeq: number | null, createErrors: unknown[] = []) {
  const createdSeqs: number[] = [];
  const errorQueue = [...createErrors];
  return {
    createdSeqs,
    prisma: {
      message: {
        aggregate: async () => ({ _max: { seq: maxSeq } }),
        create: async (args: { data: { seq: number } }) => {
          createdSeqs.push(args.data.seq);
          if (errorQueue.length > 0) {
            const err = errorQueue.shift()!;
            throw err;
          }
          return args.data;
        },
      },
    },
  };
}

describe('ConversationService.appendMessage seq 不变量', () => {
  it('空会话首条消息 seq 从 1 起（aggregate 返 null → 0+1）', async () => {
    const { createdSeqs, prisma } = makeFakePrisma(null);
    const svc = new ConversationService(prisma as never);

    await svc.appendMessage('c1', textMessage('m1', '你好'));

    expect(createdSeqs).toEqual([1]);
  });

  it('seq = max(seq)+1：已有 5 条时新消息 seq=6', async () => {
    const { createdSeqs, prisma } = makeFakePrisma(5);
    const svc = new ConversationService(prisma as never);

    await svc.appendMessage('c1', textMessage('m6', '继续'));

    expect(createdSeqs).toEqual([6]);
  });

  it('@@unique 冲突重试：第一次 P2002 → 重算重试 → 第二次成功落库 seq=max+1', async () => {
    // 关键：重试时再次 aggregate 重算 seq，仍得 6（max 未变），冲突后第二次 create 成功
    const { createdSeqs, prisma } = makeFakePrisma(5, [p2002()]);
    const svc = new ConversationService(prisma as never);

    await svc.appendMessage('c1', textMessage('m6', '继续'));

    // 两次 create 都用 seq=6（max+1），第二次成功
    expect(createdSeqs).toEqual([6, 6]);
  });

  it('连续两次 P2002 后第三次成功（MAX_RETRY=3 内）', async () => {
    const { createdSeqs, prisma } = makeFakePrisma(5, [p2002(), p2002()]);
    const svc = new ConversationService(prisma as never);

    await svc.appendMessage('c1', textMessage('m6', '继续'));

    expect(createdSeqs).toEqual([6, 6, 6]);
  });

  it('重试耗尽（3 次均 P2002）后抛出 P2002，不吞错', async () => {
    const { prisma } = makeFakePrisma(5, [p2002(), p2002(), p2002()]);
    const svc = new ConversationService(prisma as never);

    await expect(
      svc.appendMessage('c1', textMessage('m6', '继续')),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('非 P2002 错误不重试，直接抛出', async () => {
    const { createdSeqs, prisma } = makeFakePrisma(5, [new Error('连接超时')]);
    const svc = new ConversationService(prisma as never);

    await expect(
      svc.appendMessage('c1', textMessage('m6', '继续')),
    ).rejects.toThrow('连接超时');
    // 只 create 一次，未重试
    expect(createdSeqs).toEqual([6]);
  });

  it('空 parts 消息跳过落库（fromUIMessage 返 null）', async () => {
    const { createdSeqs, prisma } = makeFakePrisma(5);
    const svc = new ConversationService(prisma as never);

    await svc.appendMessage('c1', { id: 'm', role: 'user', parts: [] });

    expect(createdSeqs).toEqual([]);
  });
});
