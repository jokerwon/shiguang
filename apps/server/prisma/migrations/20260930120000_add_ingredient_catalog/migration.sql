-- Phase 8-1（ADR-0018）：食材稳定身份、别名、菜谱关联与过敏原关系。
-- 只新增表与关系，不改动现存列；Recipe.ingredients 保持原样，关联由 prisma/seed.ts 归一写入。

CREATE TYPE "IngredientCategory" AS ENUM ('VEGETABLE', 'MEAT', 'POULTRY', 'EGG', 'SEAFOOD', 'SOY', 'GRAIN', 'SEASONING', 'OTHER');

CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "IngredientCategory" NOT NULL,
    "summary" TEXT,
    "selection" TEXT,
    "storage" TEXT,
    "preparation" TEXT,
    "sources" TEXT[],
    "reviewedAt" TIMESTAMP(3),
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IngredientAlias" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    CONSTRAINT "IngredientAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IngredientAllergen" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "allergen" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    CONSTRAINT "IngredientAllergen_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecipeIngredient" (
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "note" TEXT,
    "position" INTEGER NOT NULL,
    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("recipeId","ingredientId")
);

CREATE UNIQUE INDEX "Ingredient_name_key" ON "Ingredient"("name");
CREATE INDEX "Ingredient_category_idx" ON "Ingredient"("category");
CREATE UNIQUE INDEX "IngredientAlias_alias_key" ON "IngredientAlias"("alias");
CREATE INDEX "IngredientAlias_ingredientId_idx" ON "IngredientAlias"("ingredientId");
CREATE UNIQUE INDEX "IngredientAllergen_ingredientId_allergen_key" ON "IngredientAllergen"("ingredientId", "allergen");
CREATE INDEX "RecipeIngredient_ingredientId_idx" ON "RecipeIngredient"("ingredientId");

ALTER TABLE "IngredientAlias" ADD CONSTRAINT "IngredientAlias_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IngredientAllergen" ADD CONSTRAINT "IngredientAllergen_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
