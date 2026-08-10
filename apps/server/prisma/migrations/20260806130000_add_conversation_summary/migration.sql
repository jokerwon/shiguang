-- ADR-0012: 会话摘要两列
-- Conversation 表加 summary（滑窗外消息的压缩摘要）+ summaryUpToSeq（摘要已覆盖到的消息 seq）。
-- 幂等：ADD COLUMN IF NOT EXISTS，重跑不报错。

ALTER TABLE "Conversation"
  ADD COLUMN IF NOT EXISTS "summary" TEXT,
  ADD COLUMN IF NOT EXISTS "summaryUpToSeq" INTEGER;
