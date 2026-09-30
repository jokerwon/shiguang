-- Run with psql "$DIRECT_URL" -X -v ON_ERROR_STOP=1 -f scripts/check-pantry-removal.sql.
-- Temporary tables shadow application tables; no application data is modified.
CREATE TEMP TABLE "Conversation" (
  "id" text PRIMARY KEY, "summary" text, "summaryUpToSeq" integer
);
CREATE TEMP TABLE "Message" (
  "id" text PRIMARY KEY, "conversationId" text, "seq" integer, "parts" jsonb
);
CREATE TEMP TABLE "PantryItem" ("id" text);

INSERT INTO "Conversation" VALUES
  ('affected', 'old inventory summary', 9),
  ('untouched', 'ordinary summary', 4);
INSERT INTO "Message" VALUES
  ('mixed', 'affected', 1, '[
    {"type":"text","text":"保留正文"},
    {"type":"tool-get_pantry","toolCallId":"read","state":"output-available","input":{},"output":["鸡蛋"]},
    {"type":"tool-set_favorite","toolCallId":"favorite","state":"output-available","input":{"recipeId":"recipe"},"output":{"saved":true}},
    {"type":"tool-add_pantry_items","toolCallId":"write","state":"input-available","input":{"names":["番茄"]}},
    {"type":"text","text":"保留结尾"}
  ]'),
  ('tool-only', 'affected', 2, '[
    {"type":"step-start"},
    {"type":"tool-remove_pantry_items","toolCallId":"remove","state":"output-error","input":{"names":["鸡蛋"]},"errorText":"failed"}
  ]'),
  ('dynamic', 'affected', 3, '[
    {"type":"dynamic-tool","toolName":"get_pantry","toolCallId":"dynamic","state":"output-available","input":{},"output":[]},
    {"type":"text","text":"动态工具之后的正文"}
  ]'),
  ('ordinary', 'untouched', 4, '[{"type":"text","text":"我有鸡蛋，推荐一道菜"}]');

\ir ../prisma/migrations/20260930000000_remove_pantry/migration.sql

DO $$
BEGIN
  IF (SELECT "parts" FROM "Message" WHERE "id" = 'mixed') IS DISTINCT FROM '[
    {"type":"text","text":"保留正文"},
    {"type":"tool-set_favorite","toolCallId":"favorite","state":"output-available","input":{"recipeId":"recipe"},"output":{"saved":true}},
    {"type":"text","text":"保留结尾"}
  ]'::jsonb THEN
    RAISE EXCEPTION 'Mixed message lost text, unrelated tool, or ordering';
  END IF;
  IF EXISTS (SELECT 1 FROM "Message" WHERE "id" = 'tool-only') THEN
    RAISE EXCEPTION 'Tool-only message was not removed';
  END IF;
  IF (SELECT "parts" FROM "Message" WHERE "id" = 'dynamic') IS DISTINCT FROM
      '[{"type":"text","text":"动态工具之后的正文"}]'::jsonb
     OR (SELECT "seq" FROM "Message" WHERE "id" = 'dynamic') IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'Dynamic tool removal changed retained text or seq';
  END IF;
  IF EXISTS (SELECT 1 FROM "Conversation" WHERE "id" = 'affected'
      AND ("summary" IS NOT NULL OR "summaryUpToSeq" IS NOT NULL)) THEN
    RAISE EXCEPTION 'Affected summary was not reset';
  END IF;
  IF (SELECT "summary" FROM "Conversation" WHERE "id" = 'untouched') IS DISTINCT FROM 'ordinary summary'
     OR (SELECT "summaryUpToSeq" FROM "Conversation" WHERE "id" = 'untouched') IS DISTINCT FROM 4
     OR (SELECT "parts" FROM "Message" WHERE "id" = 'ordinary') IS DISTINCT FROM
        '[{"type":"text","text":"我有鸡蛋，推荐一道菜"}]'::jsonb THEN
    RAISE EXCEPTION 'Unrelated conversation changed';
  END IF;
  IF to_regclass('pg_temp."PantryItem"') IS NOT NULL THEN
    RAISE EXCEPTION 'Inventory table still exists';
  END IF;
END $$;

SELECT 'pantry removal migration boundary checks passed' AS result;
