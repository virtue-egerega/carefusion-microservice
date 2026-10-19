/*
  Warnings:

  - You are about to drop the `Counter` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[hospital_id,patientNumber]` on the table `Patient` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `patientNumber` on the `Patient` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropIndex
DROP INDEX "Patient_patientNumber_key";

-- AlterTable
ALTER TABLE "Patient" DROP COLUMN "patientNumber",
ADD COLUMN     "patientNumber" INTEGER NOT NULL;

-- DropTable
DROP TABLE "Counter";

-- CreateIndex
CREATE UNIQUE INDEX "Patient_hospital_id_patientNumber_key" ON "Patient"("hospital_id", "patientNumber");
