/**
 * Refresh token 纯逻辑（ADR-0013）：签发 / 轮换 / 复用检测 / 吊销。
 *
 * 纯函数 + 显式依赖注入（对齐 chat/summary.ts、chat/tools 的单测友好风格）：
 * 本文件不 import PrismaService，prisma 形状以接口声明，测试用对象字面量 fake。
 *
 * 模型：refresh token 是 opaque 随机串（非 JWT），DB 只存 bcrypt 哈希；
 * 一次一换（rotation）= 作废旧行 + 发新行，新行 30 天滑动过期；
 * 复用检测 = 已作废的旧 token 再次被提交 → 该用户全部 refresh 行整族吊销。
 */
import { randomBytes } from 'node:crypto';
import { compare, hash } from 'bcryptjs';

/** refresh token 滑动有效期：30 天 */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** bcrypt cost 略低于密码的 12：refresh 校验频次远高于登录 */
const REFRESH_HASH_ROUNDS = 10;

/** 已作废的 refresh token 再次被提交 —— 凭据疑似泄露，行级吊销已在抛出前完成 */
export class ReuseDetectedError extends Error {
  constructor(public readonly userId: string) {
    super('检测到 refresh token 复用，已吊销该用户全部会话');
    this.name = 'ReuseDetectedError';
  }
}

export class RefreshTokenInvalidError extends Error {
  constructor() {
    super('refresh token 无效或已过期');
    this.name = 'RefreshTokenInvalidError';
  }
}

/** refresh token 行（含已作废旧行 —— tombstone 只存在于进程内） */
export interface RefreshTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

/** 本文件依赖的最小 prisma 形状（PrismaService 天然满足，测试用 fake） */
export interface RefreshTokenStore {
  refreshToken: {
    findMany(args?: {
      select?: {
        id: true;
        userId: true;
        tokenHash: true;
        expiresAt: true;
      };
    }): Promise<RefreshTokenRow[]>;
    create(args: {
      data: { userId: string; tokenHash: string; expiresAt: Date };
    }): Promise<unknown>;
    delete(args: { where: { id: string } }): Promise<unknown>;
    deleteMany(args: { where: { userId: string } }): Promise<unknown>;
  };
}

export interface IssuedRefreshToken {
  /** 明文 token，仅此一次返回给客户端，DB 不落明文 */
  token: string;
  expiresAt: Date;
}

/** 签发新 refresh token：插行（存哈希），返回明文 */
export async function issueRefreshToken(
  prisma: RefreshTokenStore,
  userId: string,
): Promise<IssuedRefreshToken> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = await hash(token, REFRESH_HASH_ROUNDS);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await prisma.refreshToken.create({
    data: { userId, tokenHash, expiresAt },
  });
  return { token, expiresAt };
}

/** 撤销单个 refresh token（登出）。幂等：找不到匹配行也正常返回 */
export async function revokeRefreshToken(
  prisma: RefreshTokenStore,
  userId: string,
  token: string,
): Promise<void> {
  const rows = await prisma.refreshToken.findMany({
    select: { id: true, userId: true, tokenHash: true, expiresAt: true },
  });
  for (const row of rows) {
    if (row.userId === userId && (await compare(token, row.tokenHash))) {
      await prisma.refreshToken.delete({ where: { id: row.id } });
      return;
    }
  }
}

/**
 * 轮换 refresh token：验哈希 + 过期 → 作废旧行 + 发新行。
 *
 * @param tombstones 已作废旧行的登记（进程内，单实例部署下够用）。
 *   旧 token 命中 tombstone 而非现行行 = 复用检测 → 整族吊销 + 抛 ReuseDetectedError。
 *   由调用方（AuthService）持有并在进程生命周期内累积；实例重启后 tombstone 清空，
 *   此时已泄露的旧 token 表现为普通 401（无法再伤害任何人——对应行早已删除）。
 */
export async function rotateRefreshToken(
  prisma: RefreshTokenStore,
  oldToken: string,
  tombstones: RefreshTokenRow[] = [],
): Promise<{ userId: string; token: string; expiresAt: Date }> {
  const rows = await prisma.refreshToken.findMany({
    select: { id: true, userId: true, tokenHash: true, expiresAt: true },
  });

  // tokenHash 是 bcrypt 单向哈希、无法反查索引，只能逐个 compare。
  // 候选集 = 全表现行行（30 天滑动 + 一次一换，行数极低）+ 进程内 tombstone。
  for (const row of rows) {
    if (await compare(oldToken, row.tokenHash)) {
      if (row.expiresAt.getTime() <= Date.now()) {
        // 过期行顺手清掉，按无效处理
        await prisma.refreshToken.delete({ where: { id: row.id } });
        throw new RefreshTokenInvalidError();
      }
      // 一次一换：作废旧行 + 发新行（新行 expiresAt = now + 30d，滑动过期天然完成）
      await prisma.refreshToken.delete({ where: { id: row.id } });
      tombstones.push(row);
      const issued = await issueRefreshToken(prisma, row.userId);
      return {
        userId: row.userId,
        token: issued.token,
        expiresAt: issued.expiresAt,
      };
    }
  }

  for (const row of tombstones) {
    if (await compare(oldToken, row.tokenHash)) {
      // 复用检测：已作废 token 再次提交 → 整族吊销
      await prisma.refreshToken.deleteMany({ where: { userId: row.userId } });
      throw new ReuseDetectedError(row.userId);
    }
  }

  throw new RefreshTokenInvalidError();
}
