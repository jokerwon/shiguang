-- AlterTable
-- 先加列并给默认值 0,避免已有 12 行无值;随后 seed 会用真实营养值覆盖
ALTER TABLE "Recipe" ADD COLUMN     "carb" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fat" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "protein" INTEGER NOT NULL DEFAULT 0;
