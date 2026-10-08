-- Phase 9（ADR-0019）：菜谱原料以关联行为唯一事实源，下线 Recipe.ingredients。
-- 顺序：换主键 → 按正文补齐缺失关联行 → 删列。
-- 已存在的关联行自带正文（name/amount/note），无需回填；本迁移只补被旧去重逻辑
-- 合并掉的项（当前唯一一条：「夫妻肺片」的花椒粉 1茶匙，身份同为「花椒」）。
-- 身份解析口径与 `src/ingredient/normalize.ts` 一致：剥离尾部全角括号说明，
-- 再按身份规范名或别名整体相等归一；命中不了就不插行（删列前会先由调用方核对）。

-- 1) 先换主键：同一道菜要能为同一身份保留多行（花椒与花椒粉写法与用量不同）
ALTER TABLE "RecipeIngredient" DROP CONSTRAINT "RecipeIngredient_pkey";
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("recipeId", "position");

-- 2) 按正文补齐缺失的关联行（正文列删除前取用）
INSERT INTO "RecipeIngredient" ("recipeId", "ingredientId", "name", "amount", "note", "position")
SELECT r.id,
       i.id,
       btrim(regexp_replace(x.item ->> 'name', '（.*$', '')),
       x.item ->> 'amount',
       nullif(btrim(substring(x.item ->> 'name' from '（(.*)）$')), ''),
       x.ord - 1
FROM "Recipe" r
CROSS JOIN LATERAL jsonb_array_elements(r."ingredients") WITH ORDINALITY AS x(item, ord)
LEFT JOIN "RecipeIngredient" ri
  ON ri."recipeId" = r.id AND ri."position" = x.ord - 1
JOIN "Ingredient" i
  ON i.published
 AND (
   i.name = btrim(regexp_replace(x.item ->> 'name', '（.*$', ''))
   OR EXISTS (
     SELECT 1 FROM "IngredientAlias" a
     WHERE a."ingredientId" = i.id
       AND a.alias = btrim(regexp_replace(x.item ->> 'name', '（.*$', ''))
   )
 )
WHERE ri."recipeId" IS NULL;

-- 3) 下线正文列：唯一事实源只剩关联行
ALTER TABLE "Recipe" DROP COLUMN "ingredients";
