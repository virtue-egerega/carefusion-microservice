/*
  Warnings:

  - You are about to drop the column `parentId` on the `TherapeuticUse` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "TherapeuticUse" DROP CONSTRAINT "TherapeuticUse_parentId_fkey";

-- DropIndex
DROP INDEX "TherapeuticUse_parentId_idx";

-- AlterTable
ALTER TABLE "TherapeuticUse" DROP COLUMN "parentId",
ADD COLUMN     "parentName" TEXT;
