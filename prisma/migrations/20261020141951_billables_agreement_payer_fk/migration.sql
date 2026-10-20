/*
  Warnings:

  - A unique constraint covering the columns `[id,payerId]` on the table `PayerAgreement` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "ItemPrice" DROP CONSTRAINT "ItemPrice_agreementId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "PayerAgreement_id_payerId_key" ON "PayerAgreement"("id", "payerId");

-- AddForeignKey
ALTER TABLE "ItemPrice" ADD CONSTRAINT "ItemPrice_agreementId_payerId_fkey" FOREIGN KEY ("agreementId", "payerId") REFERENCES "PayerAgreement"("id", "payerId") ON DELETE RESTRICT ON UPDATE CASCADE;
