-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HospitalStaffRole" ADD VALUE 'MIDWIFE';
ALTER TYPE "HospitalStaffRole" ADD VALUE 'PHYSIOTHERAPIST';
ALTER TYPE "HospitalStaffRole" ADD VALUE 'RADIOGRAPHER';
ALTER TYPE "HospitalStaffRole" ADD VALUE 'ANAESTHETIST';
ALTER TYPE "HospitalStaffRole" ADD VALUE 'DIETITIAN';
ALTER TYPE "HospitalStaffRole" ADD VALUE 'SOCIAL_WORKER';
ALTER TYPE "HospitalStaffRole" ADD VALUE 'MEDICAL_RECORDS_OFFICER';
ALTER TYPE "HospitalStaffRole" ADD VALUE 'HEALTH_ASSISTANT';
