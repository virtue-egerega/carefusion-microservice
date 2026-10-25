/*
  Warnings:

  - You are about to drop the column `drugId` on the `StockItem` table. All the data in the column will be lost.
  - You are about to drop the column `aliases` on the `TherapeuticUse` table. All the data in the column will be lost.
  - You are about to drop the column `atcCode` on the `TherapeuticUse` table. All the data in the column will be lost.
  - You are about to drop the column `atcLevel` on the `TherapeuticUse` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `TherapeuticUse` table. All the data in the column will be lost.
  - You are about to drop the column `parentName` on the `TherapeuticUse` table. All the data in the column will be lost.
  - You are about to drop the column `sourceSystem` on the `TherapeuticUse` table. All the data in the column will be lost.
  - You are about to drop the column `sourceUrl` on the `TherapeuticUse` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `TherapeuticUse` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `TherapeuticUse` table. All the data in the column will be lost.
  - You are about to drop the `Drug` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[code]` on the table `TherapeuticUse` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `code` to the `TherapeuticUse` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MedicineRoute" AS ENUM ('ORAL', 'SUBLINGUAL', 'BUCCAL', 'OROMUCOSAL', 'PARENTERAL', 'INTRAVENOUS', 'INTRAMUSCULAR', 'SUBCUTANEOUS', 'INTRADERMAL', 'INTRATHECAL', 'EPIDURAL', 'TOPICAL', 'TRANSDERMAL', 'INHALATION', 'NASAL', 'OPHTHALMIC', 'OTIC', 'RECTAL', 'VAGINAL', 'INSTILLATION', 'IMPLANT', 'OTHER');

-- CreateEnum
CREATE TYPE "MedicineBodySystem" AS ENUM ('GASTROINTESTINAL', 'CARDIOVASCULAR', 'RESPIRATORY', 'CENTRAL_NERVOUS_SYSTEM', 'INFECTIONS', 'ENDOCRINE', 'OBSTETRICS_GYNAECOLOGY_URINARY', 'MALIGNANT_DISEASE_IMMUNOSUPPRESSION', 'NUTRITION_AND_BLOOD', 'MUSCULOSKELETAL', 'EYE', 'EAR_NOSE_OROPHARYNX', 'SKIN', 'VACCINES_IMMUNOLOGICAL', 'ANAESTHESIA', 'POISONING_ANTIDOTES');

-- CreateEnum
CREATE TYPE "LegalCategory" AS ENUM ('POM', 'P', 'OTC');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DosageForm" ADD VALUE 'FILM_COATED_TABLET';
ALTER TYPE "DosageForm" ADD VALUE 'CHEWABLE_TABLET';
ALTER TYPE "DosageForm" ADD VALUE 'DISPERSIBLE_TABLET';
ALTER TYPE "DosageForm" ADD VALUE 'EFFERVESCENT_TABLET';
ALTER TYPE "DosageForm" ADD VALUE 'ORODISPERSIBLE_TABLET';
ALTER TYPE "DosageForm" ADD VALUE 'SUBLINGUAL_TABLET';
ALTER TYPE "DosageForm" ADD VALUE 'GASTRO_RESISTANT_TABLET';
ALTER TYPE "DosageForm" ADD VALUE 'MODIFIED_RELEASE_TABLET';
ALTER TYPE "DosageForm" ADD VALUE 'GASTRO_RESISTANT_CAPSULE';
ALTER TYPE "DosageForm" ADD VALUE 'MODIFIED_RELEASE_CAPSULE';
ALTER TYPE "DosageForm" ADD VALUE 'GRANULES';
ALTER TYPE "DosageForm" ADD VALUE 'LOZENGE';
ALTER TYPE "DosageForm" ADD VALUE 'ORAL_SOLUTION';
ALTER TYPE "DosageForm" ADD VALUE 'ORAL_SUSPENSION';
ALTER TYPE "DosageForm" ADD VALUE 'ELIXIR';
ALTER TYPE "DosageForm" ADD VALUE 'EMULSION';
ALTER TYPE "DosageForm" ADD VALUE 'ORAL_DROPS';
ALTER TYPE "DosageForm" ADD VALUE 'MOUTHWASH';
ALTER TYPE "DosageForm" ADD VALUE 'POWDER_FOR_ORAL_SOLUTION';
ALTER TYPE "DosageForm" ADD VALUE 'POWDER_FOR_ORAL_SUSPENSION';
ALTER TYPE "DosageForm" ADD VALUE 'SOLUTION_FOR_INJECTION';
ALTER TYPE "DosageForm" ADD VALUE 'SUSPENSION_FOR_INJECTION';
ALTER TYPE "DosageForm" ADD VALUE 'EMULSION_FOR_INJECTION';
ALTER TYPE "DosageForm" ADD VALUE 'POWDER_FOR_INJECTION';
ALTER TYPE "DosageForm" ADD VALUE 'POWDER_FOR_SOLUTION_FOR_INJECTION';
ALTER TYPE "DosageForm" ADD VALUE 'SOLUTION_FOR_INFUSION';
ALTER TYPE "DosageForm" ADD VALUE 'EMULSION_FOR_INFUSION';
ALTER TYPE "DosageForm" ADD VALUE 'POWDER_FOR_SOLUTION_FOR_INFUSION';
ALTER TYPE "DosageForm" ADD VALUE 'CONCENTRATE_FOR_SOLUTION_FOR_INFUSION';
ALTER TYPE "DosageForm" ADD VALUE 'LOTION';
ALTER TYPE "DosageForm" ADD VALUE 'PASTE';
ALTER TYPE "DosageForm" ADD VALUE 'DUSTING_POWDER';
ALTER TYPE "DosageForm" ADD VALUE 'SHAMPOO';
ALTER TYPE "DosageForm" ADD VALUE 'CUTANEOUS_SPRAY';
ALTER TYPE "DosageForm" ADD VALUE 'TRANSDERMAL_PATCH';
ALTER TYPE "DosageForm" ADD VALUE 'EYE_DROPS';
ALTER TYPE "DosageForm" ADD VALUE 'EYE_OINTMENT';
ALTER TYPE "DosageForm" ADD VALUE 'EAR_DROPS';
ALTER TYPE "DosageForm" ADD VALUE 'NASAL_DROPS';
ALTER TYPE "DosageForm" ADD VALUE 'NASAL_SPRAY';
ALTER TYPE "DosageForm" ADD VALUE 'PRESSURISED_INHALATION';
ALTER TYPE "DosageForm" ADD VALUE 'INHALATION_POWDER';
ALTER TYPE "DosageForm" ADD VALUE 'NEBULISER_SOLUTION';
ALTER TYPE "DosageForm" ADD VALUE 'INHALATION_LIQUID';
ALTER TYPE "DosageForm" ADD VALUE 'MEDICINAL_GAS';
ALTER TYPE "DosageForm" ADD VALUE 'ENEMA';
ALTER TYPE "DosageForm" ADD VALUE 'VAGINAL_CREAM';
ALTER TYPE "DosageForm" ADD VALUE 'VAGINAL_GEL';
ALTER TYPE "DosageForm" ADD VALUE 'IMPLANT';

-- DropForeignKey
ALTER TABLE "Drug" DROP CONSTRAINT "Drug_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "StockItem" DROP CONSTRAINT "StockItem_drugId_fkey";

-- DropIndex
DROP INDEX "StockItem_drugId_idx";

-- DropIndex
DROP INDEX "TherapeuticUse_atcCode_key";

-- DropIndex
DROP INDEX "TherapeuticUse_name_idx";

-- AlterTable
ALTER TABLE "StockItem" DROP COLUMN "drugId",
ADD COLUMN     "medicineId" TEXT,
ADD COLUMN     "strength" TEXT;

-- AlterTable
ALTER TABLE "TherapeuticUse" DROP COLUMN "aliases",
DROP COLUMN "atcCode",
DROP COLUMN "atcLevel",
DROP COLUMN "description",
DROP COLUMN "parentName",
DROP COLUMN "sourceSystem",
DROP COLUMN "sourceUrl",
DROP COLUMN "status",
DROP COLUMN "updatedAt",
ADD COLUMN     "code" TEXT NOT NULL;

-- DropTable
DROP TABLE "Drug";

-- DropEnum
DROP TYPE "DrugRoute";

-- CreateTable
CREATE TABLE "Medicine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "genericName" TEXT NOT NULL,
    "dosageForm" "DosageForm" NOT NULL,
    "route" "MedicineRoute" NOT NULL,
    "ingredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bodySystems" "MedicineBodySystem"[] DEFAULT ARRAY[]::"MedicineBodySystem"[],
    "atcCode" TEXT,
    "legalCategory" "LegalCategory" NOT NULL DEFAULT 'POM',
    "controlled" BOOLEAN,
    "strengths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "presentations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nhisCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "sourceSystem" TEXT,
    "sourceUrl" TEXT,
    "searchText" TEXT NOT NULL DEFAULT '',
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Medicine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineTherapeuticUse" (
    "medicineId" TEXT NOT NULL,
    "useId" TEXT NOT NULL,

    CONSTRAINT "MedicineTherapeuticUse_pkey" PRIMARY KEY ("medicineId","useId")
);

-- CreateIndex
CREATE INDEX "Medicine_organizationId_idx" ON "Medicine"("organizationId");

-- CreateIndex
CREATE INDEX "MedicineTherapeuticUse_useId_idx" ON "MedicineTherapeuticUse"("useId");

-- CreateIndex
CREATE INDEX "StockItem_medicineId_idx" ON "StockItem"("medicineId");

-- CreateIndex
CREATE UNIQUE INDEX "TherapeuticUse_code_key" ON "TherapeuticUse"("code");

-- AddForeignKey
ALTER TABLE "Medicine" ADD CONSTRAINT "Medicine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineTherapeuticUse" ADD CONSTRAINT "MedicineTherapeuticUse_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineTherapeuticUse" ADD CONSTRAINT "MedicineTherapeuticUse_useId_fkey" FOREIGN KEY ("useId") REFERENCES "TherapeuticUse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
