/*
  Warnings:

  - You are about to drop the column `patientId` on the `Patient` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[patientNumber]` on the table `Patient` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `patientNumber` to the `Patient` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Patient" DROP COLUMN "patientId",
ADD COLUMN     "patientNumber" TEXT NOT NULL,
ALTER COLUMN "nfcId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Counter" (
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "Patient_patientNumber_key" ON "Patient"("patientNumber");
