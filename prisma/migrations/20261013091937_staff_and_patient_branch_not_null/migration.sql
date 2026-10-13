/*
  Warnings:

  - Made the column `branchId` on table `HospitalStaff` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "HospitalStaff" DROP CONSTRAINT "HospitalStaff_branchId_fkey";

-- AlterTable
ALTER TABLE "HospitalStaff" ALTER COLUMN "branchId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "HospitalStaff" ADD CONSTRAINT "HospitalStaff_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
