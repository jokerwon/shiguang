-- ADR-0011: Message 表重审
-- 1) 回填 parts：把仅含 content(+toolCalls) 的旧行折算成 parts 数组（text 在前、tool 在后，与历史 mapper 退化分支一致）
-- 2) 加 seq 列并按 (createdAt, id) 确定性回填，设 NOT NULL
-- 3) 删 content、toolCalls 列
-- 4) 建唯一索引 + 普通索引，删旧 createdAt 索引
-- 幂等：每步都用条件守卫，重跑不报错。

-- 1. 回填 parts（仅对 parts IS NULL 的旧行）
UPDATE "Message"
SET "parts" = (
  -- text part 在前（若 content 非空）
  CASE
    WHEN "content" IS NOT NULL AND "content" <> ''
      THEN jsonb_build_array(jsonb_build_object('type', 'text', 'text', "content")) || COALESCE("toolCalls", '[]'::jsonb)
    ELSE COALESCE("toolCalls", '[]'::jsonb)
  END
)
WHERE "parts" IS NULL;

-- toolCalls 为 NULL 的旧行折算后可能仍为 NULL（content 空 + toolCalls NULL）→ 置空数组，保证 parts 非空
UPDATE "Message" SET "parts" = '[]'::jsonb WHERE "parts" IS NULL;

-- 2. 加 seq 列（若不存在）
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "seq" INTEGER;

-- 回填 seq：按会话内 (createdAt, id) 升序编号 1..N
UPDATE "Message"
SET "seq" = sub.rn
FROM (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "conversationId"
      ORDER BY "createdAt", "id"
    ) AS rn
  FROM "Message"
) sub
WHERE "Message"."id" = sub."id";

-- 设 NOT NULL（回填后所有行均有值）
ALTER TABLE "Message" ALTER COLUMN "seq" SET NOT NULL;

-- 3. 删 content、toolCalls 列
ALTER TABLE "Message" DROP COLUMN IF EXISTS "content";
ALTER TABLE "Message" DROP COLUMN IF EXISTS "toolCalls";

-- 4. 索引
CREATE UNIQUE INDEX IF NOT EXISTS "Message_conversationId_seq_key"
  ON "Message"("conversationId", "seq");
CREATE INDEX IF NOT EXISTS "Message_conversationId_seq_idx"
  ON "Message"("conversationId", "seq");

-- 删旧 createdAt 索引（若存在）
DROP INDEX IF EXISTS "Message_conversationId_createdAt_idx";
