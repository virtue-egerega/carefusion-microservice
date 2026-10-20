-- DropForeignKey
ALTER TABLE "QueueEntry" DROP CONSTRAINT "QueueEntry_encounterId_fkey";

-- AlterTable
ALTER TABLE "QueueEntry" ALTER COLUMN "encounterId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
