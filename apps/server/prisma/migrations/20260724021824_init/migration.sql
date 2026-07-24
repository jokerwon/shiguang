-- CreateEnum
CREATE TYPE "Cuisine" AS ENUM ('HOME', 'WESTERN', 'JAPANESE', 'SICHUAN', 'LIGHT');

-- CreateEnum
CREATE TYPE "Tag" AS ENUM ('VEGETARIAN', 'HIGH_PROTEIN', 'LOW_CAL', 'LOW_CARB', 'QUICK', 'RICE_FRIENDLY', 'COMFORTING');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "cuisine" "Cuisine" NOT NULL,
    "time" INTEGER NOT NULL,
    "kcal" INTEGER NOT NULL,
    "img" TEXT NOT NULL DEFAULT '',
    "tags" "Tag"[],
    "ingredients" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Recipe_cuisine_idx" ON "Recipe"("cuisine");

-- CreateIndex
CREATE INDEX "Recipe_time_idx" ON "Recipe"("time");
