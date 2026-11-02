/*
  Warnings:

  - You are about to drop the column `fileName` on the `GoodsReceiptAttachment` table. All the data in the column will be lost.
  - You are about to drop the column `fileRef` on the `GoodsReceiptAttachment` table. All the data in the column will be lost.
  - You are about to drop the column `mimeType` on the `GoodsReceiptAttachment` table. All the data in the column will be lost.
  - You are about to drop the column `sha256` on the `GoodsReceiptAttachment` table. All the data in the column will be lost.
  - You are about to drop the column `uploadedAt` on the `GoodsReceiptAttachment` table. All the data in the column will be lost.
  - You are about to drop the column `uploadedBy` on the `GoodsReceiptAttachment` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[receiptId,storedFileId]` on the table `GoodsReceiptAttachment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `attachedBy` to the `GoodsReceiptAttachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storedFileId` to the `GoodsReceiptAttachment` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "GoodsReceiptAttachment_receiptId_sha256_key";

-- AlterTable
ALTER TABLE "GoodsReceiptAttachment" DROP COLUMN "fileName",
DROP COLUMN "fileRef",
DROP COLUMN "mimeType",
DROP COLUMN "sha256",
DROP COLUMN "uploadedAt",
DROP COLUMN "uploadedBy",
ADD COLUMN     "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "attachedBy" TEXT NOT NULL,
ADD COLUMN     "storedFileId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoredFile_organizationId_uploadedAt_idx" ON "StoredFile"("organizationId", "uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_organizationId_sha256_key" ON "StoredFile"("organizationId", "sha256");

-- CreateIndex
CREATE INDEX "GoodsReceiptAttachment_storedFileId_idx" ON "GoodsReceiptAttachment"("storedFileId");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceiptAttachment_receiptId_storedFileId_key" ON "GoodsReceiptAttachment"("receiptId", "storedFileId");

-- AddForeignKey
ALTER TABLE "GoodsReceiptAttachment" ADD CONSTRAINT "GoodsReceiptAttachment_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
