-- CreateTable
CREATE TABLE "TherapeuticUse" (
    "id" TEXT NOT NULL,
    "atcCode" TEXT,
    "atcLevel" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parentId" TEXT,
    "sourceSystem" TEXT,
    "sourceUrl" TEXT,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TherapeuticUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TherapeuticUse_atcCode_key" ON "TherapeuticUse"("atcCode");

-- CreateIndex
CREATE INDEX "TherapeuticUse_parentId_idx" ON "TherapeuticUse"("parentId");

-- CreateIndex
CREATE INDEX "TherapeuticUse_name_idx" ON "TherapeuticUse"("name");

-- AddForeignKey
ALTER TABLE "TherapeuticUse" ADD CONSTRAINT "TherapeuticUse_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TherapeuticUse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
