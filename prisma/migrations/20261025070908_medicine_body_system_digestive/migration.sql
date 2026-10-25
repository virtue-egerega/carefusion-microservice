/*
  Warnings:

  - The values [IMMUNE_SYSTEM] on the enum `MedicineBodySystem` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "MedicineBodySystem_new" AS ENUM ('GASTROINTESTINAL', 'CARDIOVASCULAR', 'RESPIRATORY', 'CENTRAL_NERVOUS_SYSTEM', 'INFECTIONS', 'ENDOCRINE', 'OBSTETRICS_GYNAECOLOGY_URINARY', 'MALIGNANT_DISEASE_IMMUNOSUPPRESSION', 'NUTRITION_AND_BLOOD', 'MUSCULOSKELETAL', 'EYE', 'EAR', 'EAR_NOSE_OROPHARYNX', 'SKIN', 'VACCINES_IMMUNOLOGICAL', 'ANAESTHESIA', 'POISONING_ANTIDOTES', 'RENAL', 'AUTONOMIC_NERVOUS_SYSTEM', 'IMMUNESYSTEM', 'DIGESTIVE_SYSTEM');
ALTER TABLE "public"."Medicine" ALTER COLUMN "bodySystems" DROP DEFAULT;
ALTER TABLE "Medicine" ALTER COLUMN "bodySystems" TYPE "MedicineBodySystem_new"[] USING ("bodySystems"::text::"MedicineBodySystem_new"[]);
ALTER TYPE "MedicineBodySystem" RENAME TO "MedicineBodySystem_old";
ALTER TYPE "MedicineBodySystem_new" RENAME TO "MedicineBodySystem";
DROP TYPE "public"."MedicineBodySystem_old";
ALTER TABLE "Medicine" ALTER COLUMN "bodySystems" SET DEFAULT ARRAY[]::"MedicineBodySystem"[];
COMMIT;
