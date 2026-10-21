/*
  Warnings:

  - You are about to alter the column `quantity` on the `Charge` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(12,3)`.

*/
-- AlterTable
ALTER TABLE "Charge" ADD COLUMN     "agreementId" TEXT,
ADD COLUMN     "billableItemId" TEXT,
ADD COLUMN     "itemCostId" TEXT,
ADD COLUMN     "itemPriceId" TEXT,
ADD COLUMN     "payerDiscountId" TEXT,
ADD COLUMN     "pricePercent" DECIMAL(5,2),
ADD COLUMN     "priceSource" "PriceSource",
ADD COLUMN     "pricingBasis" "PriceBasis",
ALTER COLUMN "quantity" SET DEFAULT 1,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(12,3);

-- CreateIndex
CREATE INDEX "Charge_billableItemId_idx" ON "Charge"("billableItemId");

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_billableItemId_fkey" FOREIGN KEY ("billableItemId") REFERENCES "BillableItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_itemPriceId_fkey" FOREIGN KEY ("itemPriceId") REFERENCES "ItemPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_itemCostId_fkey" FOREIGN KEY ("itemCostId") REFERENCES "ItemCost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "PayerAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_payerDiscountId_fkey" FOREIGN KEY ("payerDiscountId") REFERENCES "PayerDiscount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
