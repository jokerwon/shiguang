/* eslint-disable @typescript-eslint/require-await */
// refresh-token 纯逻辑单测（ADR-0013）：对象字面量 fake prisma（对齐
// conversation.service.spec.ts 的风格），零 DB、零 Nest 容器。
// 顶部 disable：fake 方法用 async 关键字满足接口形状但无真实 await。
import { hash } from 'bcryptjs';
import {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  ReuseDetectedError,
  RefreshTokenInvalidError,
  REFRESH_TOKEN_TTL_MS,
  type RefreshTokenRow,
  type RefreshTokenStore,
} from './refresh-token';

/** 内存行表 fake：满足 RefreshTokenStore 形状的最小实现 */
function fakePrisma(initial: RefreshTokenRow[] = []) {
  const rows: RefreshTokenRow[] = [...initial];
  const calls = { create: 0, delete: 0, deleteMany: 0 };
  const prisma: RefreshTokenStore = {
    refreshToken: {
      async findMany() {
        return [...rows];
      },
      async create({ data }) {
        calls.create++;
        rows.push({ id: `row-${rows.length}`, ...data });
        return {};
      },
      async delete({ where }) {
        calls.delete++;
        const i = rows.findIndex((r) => r.id === where.id);
        if (i >= 0) rows.splice(i, 1);
        return {};
      },
      async deleteMany({ where }) {
        calls.deleteMany++;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].userId === where.userId) rows.splice(i, 1);
        }
        return {};
      },
    },
  };
  return { prisma, rows, calls };
}

const HOURS = 60 * 60 * 1000;

describe('issueRefreshToken', () => {
  it('插行（存哈希不落明文）并返回明文 token + 30 天滑动过期', async () => {
    const { prisma, rows } = fakePrisma();
    const before = Date.now();
    const issued = await issueRefreshToken(prisma, 'u1');

    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32B base64url
    expect(issued.expiresAt.getTime()).toBeGreaterThan(
      before + REFRESH_TOKEN_TTL_MS - 1000,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe('u1');
    expect(rows[0].tokenHash).not.toBe(issued.token); // 只存哈希
    expect(rows[0].tokenHash).toMatch(/^\$2[aby]\$/); // bcrypt 哈希格式
  });
});

describe('rotateRefreshToken', () => {
  it('正常路径：作废旧行 + 发新行，旧 token 立即失效', async () => {
    const { prisma, rows } = fakePrisma();
    const first = await issueRefreshToken(prisma, 'u1');
    const tombstones: RefreshTokenRow[] = [];

    const rotated = await rotateRefreshToken(prisma, first.token, tombstones);

    expect(rotated.userId).toBe('u1');
    expect(rotated.token).not.toBe(first.token);
    expect(rows).toHaveLength(1); // 旧删新增
    expect(tombstones).toHaveLength(1); // 旧行进 tombstone

    // 旧 token 再提交 → 命中 tombstone → 复用检测（详见下条用例）
    await expect(
      rotateRefreshToken(prisma, first.token, tombstones),
    ).rejects.toBeInstanceOf(ReuseDetectedError);
  });

  it('滑动过期：新行 expiresAt 重置为 now + 30 天', async () => {
    const stale: RefreshTokenRow = {
      id: 'old',
      userId: 'u1',
      tokenHash: '',
      expiresAt: new Date(Date.now() + 1 * HOURS), // 旧行只剩 1 小时
    };
    const oldToken = 'stale-token';
    stale.tokenHash = await hash(oldToken, 4); // 测试用低 cost 提速
    const { prisma, rows } = fakePrisma([stale]);

    const before = Date.now();
    const rotated = await rotateRefreshToken(prisma, oldToken, []);

    expect(rotated.expiresAt.getTime()).toBeGreaterThan(
      before + REFRESH_TOKEN_TTL_MS - 1000,
    );
    expect(rows).toHaveLength(1);
  });

  it('过期 refresh 拒绝，且顺手清掉过期行', async () => {
    const expired: RefreshTokenRow = {
      id: 'expired',
      userId: 'u1',
      tokenHash: '',
      expiresAt: new Date(Date.now() - 1 * HOURS), // 已过期
    };
    const oldToken = 'expired-token';
    expired.tokenHash = await hash(oldToken, 4);
    const { prisma, rows } = fakePrisma([expired]);

    await expect(
      rotateRefreshToken(prisma, oldToken, []),
    ).rejects.toBeInstanceOf(RefreshTokenInvalidError);
    expect(rows).toHaveLength(0); // 过期行被清理
  });

  it('复用检测：已作废 token 再提交 → 该用户全部 refresh 行被清', async () => {
    const { prisma, rows } = fakePrisma();
    const first = await issueRefreshToken(prisma, 'u1');
    const tombstones: RefreshTokenRow[] = [];
    // 用户还有另一台设备的有效 refresh
    await issueRefreshToken(prisma, 'u1');
    // 别的用户的行不受影响
    const other = await issueRefreshToken(prisma, 'u2');

    // 第一次轮换成功（first 作废进 tombstone）
    await rotateRefreshToken(prisma, first.token, tombstones);
    expect(rows.filter((r) => r.userId === 'u1')).toHaveLength(2); // 新行 + 另一设备行

    // 同一个旧 token 再提交 → 复用检测 → u1 整族吊销
    await expect(
      rotateRefreshToken(prisma, first.token, tombstones),
    ).rejects.toBeInstanceOf(ReuseDetectedError);
    expect(rows.filter((r) => r.userId === 'u1')).toHaveLength(0);
    expect(rows.filter((r) => r.userId === 'u2')).toHaveLength(1); // u2 不动

    // u2 的 refresh 仍可用
    const u2Rotated = await rotateRefreshToken(prisma, other.token, tombstones);
    expect(u2Rotated.userId).toBe('u2');
  });

  it('伪造 token（不命中任何行/tombstone）→ RefreshTokenInvalidError', async () => {
    const { prisma } = fakePrisma();
    await issueRefreshToken(prisma, 'u1');

    await expect(
      rotateRefreshToken(prisma, 'forged-token', []),
    ).rejects.toBeInstanceOf(RefreshTokenInvalidError);
  });

  it('tombstone 缺省（实例重启后）：已作废旧 token 表现为普通无效，不触发整族吊销', async () => {
    const { prisma, rows } = fakePrisma();
    const first = await issueRefreshToken(prisma, 'u1');
    const tombstones: RefreshTokenRow[] = [];
    await rotateRefreshToken(prisma, first.token, tombstones);
    // 模拟重启：tombstone 丢失（传空数组），现行行里旧 token 已删
    await expect(
      rotateRefreshToken(prisma, first.token, []),
    ).rejects.toBeInstanceOf(RefreshTokenInvalidError);
    expect(rows.filter((r) => r.userId === 'u1')).toHaveLength(1); // 新行不被误清
  });
});

describe('revokeRefreshToken', () => {
  it('删除匹配行；幂等（不存在/不匹配也正常返回）', async () => {
    const { prisma, rows } = fakePrisma();
    const a = await issueRefreshToken(prisma, 'u1');
    await issueRefreshToken(prisma, 'u1');

    await revokeRefreshToken(prisma, 'u1', a.token);
    expect(rows).toHaveLength(1);

    // 再撤一次（已不存在）→ 幂等不抛
    await expect(
      revokeRefreshToken(prisma, 'u1', a.token),
    ).resolves.toBeUndefined();
    // 伪造 token → 幂等不抛
    await expect(
      revokeRefreshToken(prisma, 'u1', 'forged'),
    ).resolves.toBeUndefined();
    expect(rows).toHaveLength(1);
  });

  it('只撤指定用户的行', async () => {
    const { prisma, rows } = fakePrisma();
    const a = await issueRefreshToken(prisma, 'u1');
    await issueRefreshToken(prisma, 'u2');

    // u1 的 token 不能撤 u2 的行（userId 过滤）
    await revokeRefreshToken(prisma, 'u2', a.token);
    expect(rows).toHaveLength(2);
  });
});
