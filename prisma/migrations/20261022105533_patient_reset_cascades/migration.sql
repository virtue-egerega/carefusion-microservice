-- DropForeignKey
ALTER TABLE "AccountEntry" DROP CONSTRAINT "AccountEntry_accountId_fkey";

-- DropForeignKey
ALTER TABLE "AccountEntry" DROP CONSTRAINT "AccountEntry_allocationId_fkey";

-- DropForeignKey
ALTER TABLE "AccountEntry" DROP CONSTRAINT "AccountEntry_patientId_fkey";

-- DropForeignKey
ALTER TABLE "AccountEntry" DROP CONSTRAINT "AccountEntry_requestId_fkey";

-- DropForeignKey
ALTER TABLE "AccountEntry" DROP CONSTRAINT "AccountEntry_reversesId_fkey";

-- DropForeignKey
ALTER TABLE "BillingAccount" DROP CONSTRAINT "BillingAccount_holderPatientId_fkey";

-- DropForeignKey
ALTER TABLE "BillingAccountMember" DROP CONSTRAINT "BillingAccountMember_accountId_fkey";

-- DropForeignKey
ALTER TABLE "BillingAccountMember" DROP CONSTRAINT "BillingAccountMember_patientId_fkey";

-- DropForeignKey
ALTER TABLE "Charge" DROP CONSTRAINT "Charge_billingAccountId_fkey";

-- DropForeignKey
ALTER TABLE "Charge" DROP CONSTRAINT "Charge_coverageId_fkey";

-- DropForeignKey
ALTER TABLE "Charge" DROP CONSTRAINT "Charge_encounterId_fkey";

-- DropForeignKey
ALTER TABLE "Charge" DROP CONSTRAINT "Charge_patientId_fkey";

-- DropForeignKey
ALTER TABLE "ChargeAllocation" DROP CONSTRAINT "ChargeAllocation_billingAccountId_fkey";

-- DropForeignKey
ALTER TABLE "ChargeAllocation" DROP CONSTRAINT "ChargeAllocation_chargeId_fkey";

-- DropForeignKey
ALTER TABLE "ChargeAllocation" DROP CONSTRAINT "ChargeAllocation_coverageId_fkey";

-- DropForeignKey
ALTER TABLE "ChargeAllocation" DROP CONSTRAINT "ChargeAllocation_replacesId_fkey";

-- DropForeignKey
ALTER TABLE "ChargeAllocation" DROP CONSTRAINT "ChargeAllocation_requestId_fkey";

-- DropForeignKey
ALTER TABLE "Coverage" DROP CONSTRAINT "Coverage_patientId_fkey";

-- DropForeignKey
ALTER TABLE "Coverage" DROP CONSTRAINT "Coverage_policyId_fkey";

-- DropForeignKey
ALTER TABLE "Encounter" DROP CONSTRAINT "Encounter_coverageId_fkey";

-- DropForeignKey
ALTER TABLE "Encounter" DROP CONSTRAINT "Encounter_followUpOfId_fkey";

-- DropForeignKey
ALTER TABLE "Encounter" DROP CONSTRAINT "Encounter_parentEncounterId_fkey";

-- DropForeignKey
ALTER TABLE "Encounter" DROP CONSTRAINT "Encounter_patientId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialRequest" DROP CONSTRAINT "FinancialRequest_billingAccountId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialRequest" DROP CONSTRAINT "FinancialRequest_chargeId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialRequestApproval" DROP CONSTRAINT "FinancialRequestApproval_requestId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialRequestAttachment" DROP CONSTRAINT "FinancialRequestAttachment_requestId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialRequestTarget" DROP CONSTRAINT "FinancialRequestTarget_allocationId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialRequestTarget" DROP CONSTRAINT "FinancialRequestTarget_requestId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentApplication" DROP CONSTRAINT "PaymentApplication_allocationId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentApplication" DROP CONSTRAINT "PaymentApplication_creditEntryId_fkey";

-- DropForeignKey
ALTER TABLE "Policy" DROP CONSTRAINT "Policy_principalPatientId_fkey";

-- DropForeignKey
ALTER TABLE "QueueEntry" DROP CONSTRAINT "QueueEntry_encounterId_fkey";

-- DropForeignKey
ALTER TABLE "QueueEntry" DROP CONSTRAINT "QueueEntry_fromEntryId_fkey";

-- DropForeignKey
ALTER TABLE "QueueEntry" DROP CONSTRAINT "QueueEntry_patientId_fkey";

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_parentEncounterId_fkey" FOREIGN KEY ("parentEncounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_followUpOfId_fkey" FOREIGN KEY ("followUpOfId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_coverageId_fkey" FOREIGN KEY ("coverageId") REFERENCES "Coverage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_fromEntryId_fkey" FOREIGN KEY ("fromEntryId") REFERENCES "QueueEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_holderPatientId_fkey" FOREIGN KEY ("holderPatientId") REFERENCES "Patient"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAccountMember" ADD CONSTRAINT "BillingAccountMember_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAccountMember" ADD CONSTRAINT "BillingAccountMember_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "ChargeAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FinancialRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountEntry" ADD CONSTRAINT "AccountEntry_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "AccountEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_principalPatientId_fkey" FOREIGN KEY ("principalPatientId") REFERENCES "Patient"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coverage" ADD CONSTRAINT "Coverage_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coverage" ADD CONSTRAINT "Coverage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_coverageId_fkey" FOREIGN KEY ("coverageId") REFERENCES "Coverage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeAllocation" ADD CONSTRAINT "ChargeAllocation_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeAllocation" ADD CONSTRAINT "ChargeAllocation_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeAllocation" ADD CONSTRAINT "ChargeAllocation_coverageId_fkey" FOREIGN KEY ("coverageId") REFERENCES "Coverage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeAllocation" ADD CONSTRAINT "ChargeAllocation_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "ChargeAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeAllocation" ADD CONSTRAINT "ChargeAllocation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FinancialRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentApplication" ADD CONSTRAINT "PaymentApplication_creditEntryId_fkey" FOREIGN KEY ("creditEntryId") REFERENCES "AccountEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentApplication" ADD CONSTRAINT "PaymentApplication_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "ChargeAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRequest" ADD CONSTRAINT "FinancialRequest_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRequest" ADD CONSTRAINT "FinancialRequest_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRequestTarget" ADD CONSTRAINT "FinancialRequestTarget_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FinancialRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRequestTarget" ADD CONSTRAINT "FinancialRequestTarget_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "ChargeAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRequestApproval" ADD CONSTRAINT "FinancialRequestApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FinancialRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRequestAttachment" ADD CONSTRAINT "FinancialRequestAttachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FinancialRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
