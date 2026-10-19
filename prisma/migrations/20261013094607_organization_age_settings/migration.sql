-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "childMaxYears" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "geriatricMinAge" INTEGER,
ADD COLUMN     "infantBelowYears" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "neonateMaxDays" INTEGER NOT NULL DEFAULT 28,
ADD COLUMN     "paediatricMaxAge" INTEGER,
ADD COLUMN     "underFiveBelowYears" INTEGER NOT NULL DEFAULT 5;
