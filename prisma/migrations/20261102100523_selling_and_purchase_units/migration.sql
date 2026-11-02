/*
  Warnings:

  - You are about to drop the column `packId` on the `GoodsReceiptItem` table. All the data in the column will be lost.
  - You are about to drop the `ItemPack` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "GoodsReceiptItem" DROP CONSTRAINT "GoodsReceiptItem_packId_fkey";

-- DropForeignKey
ALTER TABLE "ItemPack" DROP CONSTRAINT "ItemPack_itemId_fkey";

-- DropIndex
DROP INDEX "BillableCategory_organizationId_name_key";

-- DropIndex
DROP INDEX "Manufacturer_organizationId_name_key";

-- DropIndex
DROP INDEX "Supplier_organizationId_name_key";

-- AlterTable
ALTER TABLE "GoodsReceiptItem" DROP COLUMN "packId";

-- AlterTable
ALTER TABLE "StockBalance" ALTER COLUMN "sellingUnitQuantity" SET DEFAULT 0,
ALTER COLUMN "sellingUnitQuantity" SET DATA TYPE DECIMAL(12,1);

-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN     "sellableInHalves" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shelfNumber" TEXT,
ALTER COLUMN "purchaseUnitName" DROP DEFAULT,
ALTER COLUMN "sellingUnitsPerPurchaseUnit" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StockMovement" ALTER COLUMN "sellingUnitQuantity" SET DATA TYPE DECIMAL(12,1);

-- AlterTable
ALTER TABLE "StorageLocation" ALTER COLUMN "createdBy" DROP NOT NULL;

-- DropTable
DROP TABLE "ItemPack";

-- CreateTable
CREATE TABLE "GoodsReceiptAttachment" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "fileRef" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "description" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReceiptAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceiptAttachment_receiptId_sha256_key" ON "GoodsReceiptAttachment"("receiptId", "sha256");

-- AddForeignKey
ALTER TABLE "GoodsReceiptAttachment" ADD CONSTRAINT "GoodsReceiptAttachment_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
