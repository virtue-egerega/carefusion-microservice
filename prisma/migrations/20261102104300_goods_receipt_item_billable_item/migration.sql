-- A goods receipt item names the product received by its billable item (PRD 15 §10.1): itemId -> billableItemId.
-- Prisma reads a rename as drop + add, which would lose every item's product; renamed here instead.
ALTER TABLE "GoodsReceiptItem" RENAME COLUMN "itemId" TO "billableItemId";
ALTER TABLE "GoodsReceiptItem" RENAME CONSTRAINT "GoodsReceiptItem_itemId_fkey" TO "GoodsReceiptItem_billableItemId_fkey";
ALTER INDEX "GoodsReceiptItem_itemId_idx" RENAME TO "GoodsReceiptItem_billableItemId_idx";
