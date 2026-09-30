-- ADR-0017: retire inventory without deleting ordinary conversation text.
-- Back up the database and stop chat writes before applying this migration.
BEGIN;

-- UIMessage tool parts contain both the call input and its result/state.
-- Remove the entire part, including unfinished calls, and preserve other parts.
CREATE TEMP TABLE "_retired_pantry_messages" ON COMMIT DROP AS
SELECT
  m."id",
  m."conversationId",
  COALESCE(
    jsonb_agg(p.part ORDER BY p.ordinality) FILTER (WHERE NOT p.retired),
    '[]'::jsonb
  ) AS parts
FROM "Message" m
CROSS JOIN LATERAL (
  SELECT
    part,
    ordinality,
    COALESCE(
      part->>'type' IN (
        'tool-get_pantry',
        'tool-add_pantry_items',
        'tool-remove_pantry_items'
      ) OR (
        part->>'type' = 'dynamic-tool'
        AND part->>'toolName' IN (
          'get_pantry', 'add_pantry_items', 'remove_pantry_items'
        )
      ),
      false
    ) AS retired
  FROM jsonb_array_elements(m."parts") WITH ORDINALITY AS entry(part, ordinality)
) p
GROUP BY m."id", m."conversationId"
HAVING bool_or(p.retired);

UPDATE "Conversation" c
SET "summary" = NULL, "summaryUpToSeq" = NULL
WHERE c."id" IN (
  SELECT "conversationId" FROM "_retired_pantry_messages"
);

-- A tool-only message may leave SDK step markers behind. Such a message has
-- nothing to replay; remove it without renumbering the surviving message seqs.
DELETE FROM "Message" m
USING "_retired_pantry_messages" retired
WHERE m."id" = retired."id"
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(retired.parts) AS entry(part)
    WHERE part->>'type' IS DISTINCT FROM 'step-start'
  );

UPDATE "Message" m
SET "parts" = retired.parts
FROM "_retired_pantry_messages" retired
WHERE m."id" = retired."id";

DROP TABLE "PantryItem";

COMMIT;
