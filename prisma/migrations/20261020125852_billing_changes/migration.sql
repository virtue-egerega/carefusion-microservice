-- AddForeignKey
ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
