/*
  Warnings:

  - You are about to drop the column `findings` on the `ConsultationSystemReview` table. All the data in the column will be lost.
  - You are about to drop the column `normal` on the `ConsultationSystemReview` table. All the data in the column will be lost.
  - Added the required column `note` to the `ConsultationSystemReview` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ReviewFinding" AS ENUM ('POSITIVE', 'NEGATIVE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BodySystem" ADD VALUE 'HAEMATOLOGICAL_LYMPHATIC';
ALTER TYPE "BodySystem" ADD VALUE 'ALLERGIC_IMMUNOLOGICAL';

-- AlterTable
ALTER TABLE "ConsultationSystemReview" DROP COLUMN "findings",
DROP COLUMN "normal",
ADD COLUMN     "note" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ConsultationReviewFinding" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "symptom" TEXT NOT NULL,
    "finding" "ReviewFinding" NOT NULL,
    "note" TEXT,

    CONSTRAINT "ConsultationReviewFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosisChapter" (
    "codeSystem" "DiagnosisCodeSystem" NOT NULL,
    "number" TEXT NOT NULL,
    "numeral" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "DiagnosisChapter_pkey" PRIMARY KEY ("codeSystem","number")
);

-- CreateTable
CREATE TABLE "DiagnosisCodeGroup" (
    "codeSystem" "DiagnosisCodeSystem" NOT NULL,
    "firstCode" TEXT NOT NULL,
    "lastCode" TEXT NOT NULL,
    "chapter" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "DiagnosisCodeGroup_pkey" PRIMARY KEY ("codeSystem","firstCode")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationReviewFinding_consultationId_symptom_key" ON "ConsultationReviewFinding"("consultationId", "symptom");

-- CreateIndex
CREATE INDEX "DiagnosisCodeGroup_codeSystem_chapter_idx" ON "DiagnosisCodeGroup"("codeSystem", "chapter");

-- AddForeignKey
ALTER TABLE "ConsultationReviewFinding" ADD CONSTRAINT "ConsultationReviewFinding_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
