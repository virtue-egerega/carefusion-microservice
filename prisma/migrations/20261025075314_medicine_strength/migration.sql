/*
  Warnings:

  - You are about to drop the column `nhisCodes` on the `Medicine` table. All the data in the column will be lost.
  - You are about to drop the column `presentations` on the `Medicine` table. All the data in the column will be lost.
  - You are about to drop the column `strengths` on the `Medicine` table. All the data in the column will be lost.
  - You are about to drop the column `strength` on the `StockItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Medicine" DROP COLUMN "nhisCodes",
DROP COLUMN "presentations",
DROP COLUMN "strengths",
ADD COLUMN     "nhisCode" TEXT,
ADD COLUMN     "presentation" TEXT,
ADD COLUMN     "strength" TEXT;

-- AlterTable
ALTER TABLE "StockItem" DROP COLUMN "strength";
