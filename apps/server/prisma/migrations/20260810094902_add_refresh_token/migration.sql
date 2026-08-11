-- ADR-0013: 认证双轨改造（幂等 sync 迁移）
-- 背景：本目录由 `prisma migrate dev` 生成但 SQL 未落盘即中断；数据库里却已应用了一个
-- 旧草稿 schema（RefreshToken 带 familyId/revokedAt/replacedByTokenId 三列，User.role 仍在）。
-- 本文件补齐该目录迁移，把数据库拉到 ADR-0013 定稿 schema：
--   1) RefreshToken 表 = {id, userId, tokenHash, expiresAt, createdAt}（唯一 tokenHash + userId 索引 + 级联 FK）
--   2) 删 User.role 列 + Role enum（零消费方死重，ADR-0013 决策 6）
-- 全部 IF [NOT] EXISTS / 条件建约束：既能在干净历史（shadow 回放）下建表，也能在旧草稿表上收口。
-- 收口方式见实施清单 W0 备注（resolve --rolled-back 对已应用迁移无效，采用删账本行 + deploy）。

-- CreateTable（旧草稿表已存在则跳过；干净回放则建规范表）
CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- DropIndex/DropColumn：清掉旧草稿表的残留列（列删了，其 familyId 索引随之消失）
ALTER TABLE "RefreshToken" DROP COLUMN IF EXISTS "familyId";
ALTER TABLE "RefreshToken" DROP COLUMN IF EXISTS "revokedAt";
ALTER TABLE "RefreshToken" DROP COLUMN IF EXISTS "replacedByTokenId";

-- CreateIndex（已存在则跳过）
CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- AddForeignKey（已存在则跳过）
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'RefreshToken_userId_fkey'
          AND conrelid = to_regclass('"RefreshToken"')
    ) THEN
        ALTER TABLE "RefreshToken"
            ADD CONSTRAINT "RefreshToken_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AlterTable：Message.parts 补 NOT NULL（幂等；schema.prisma 为必填，
-- 但历史迁移只 ADD COLUMN + 回填、从未 SET NOT NULL，属存量缺口，随本迁移一并补齐）
ALTER TABLE "Message" ALTER COLUMN "parts" SET NOT NULL;

-- AlterTable：删 User.role（幂等）
ALTER TABLE "User" DROP COLUMN IF EXISTS "role";

-- DropEnum：删 Role enum（幂等）
DROP TYPE IF EXISTS "Role";
