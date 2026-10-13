/*
  Warnings:

  - You are about to drop the column `insuranceSchemeId` on the `NHISWorker` table. All the data in the column will be lost.
  - You are about to drop the `InsuranceScheme` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `payerId` to the `NHISWorker` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "NHISWorker" DROP CONSTRAINT "NHISWorker_insuranceSchemeId_fkey";

-- AlterTable
ALTER TABLE "NHISWorker" DROP COLUMN "insuranceSchemeId",
ADD COLUMN     "payerId" TEXT NOT NULL;

-- DropTable
DROP TABLE "InsuranceScheme";

-- CreateIndex
CREATE INDEX "AccountEntry_branchId_idx" ON "AccountEntry"("branchId");

-- AddForeignKey
ALTER TABLE "NHISWorker" ADD CONSTRAINT "NHISWorker_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "Payer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
