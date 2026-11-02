/*
  Warnings:

  - You are about to drop the column `billableItemId` on the `GoodsReceiptItem` table. All the data in the column will be lost.
  - Added the required column `stockItemId` to the `GoodsReceiptItem` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "GoodsReceiptItem" DROP CONSTRAINT "GoodsReceiptItem_billableItemId_fkey";

-- DropIndex
DROP INDEX "GoodsReceiptItem_billableItemId_idx";

-- AlterTable
ALTER TABLE "GoodsReceiptItem" DROP COLUMN "billableItemId",
ADD COLUMN     "stockItemId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "GoodsReceiptItem_stockItemId_idx" ON "GoodsReceiptItem"("stockItemId");

-- AddForeignKey
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("itemId") ON DELETE RESTRICT ON UPDATE CASCADE;
