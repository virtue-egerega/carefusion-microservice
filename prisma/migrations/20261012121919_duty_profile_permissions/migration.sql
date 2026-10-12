-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "departmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "DutyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyProfileQueue" (
    "id" TEXT NOT NULL,
    "dutyProfileId" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,

    CONSTRAINT "DutyProfileQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyProfilePermission" (
    "id" TEXT NOT NULL,
    "dutyProfileId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "DutyProfilePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAssignment" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "dutyProfileId" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),

    CONSTRAINT "StaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "DutyProfile_name_key" ON "DutyProfile"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DutyProfileQueue_dutyProfileId_queueId_key" ON "DutyProfileQueue"("dutyProfileId", "queueId");

-- CreateIndex
CREATE UNIQUE INDEX "DutyProfilePermission_dutyProfileId_permissionId_key" ON "DutyProfilePermission"("dutyProfileId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAssignment_staffId_dutyProfileId_key" ON "StaffAssignment"("staffId", "dutyProfileId");

-- AddForeignKey
ALTER TABLE "DutyProfile" ADD CONSTRAINT "DutyProfile_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyProfile" ADD CONSTRAINT "DutyProfile_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyProfileQueue" ADD CONSTRAINT "DutyProfileQueue_dutyProfileId_fkey" FOREIGN KEY ("dutyProfileId") REFERENCES "DutyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyProfileQueue" ADD CONSTRAINT "DutyProfileQueue_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyProfilePermission" ADD CONSTRAINT "DutyProfilePermission_dutyProfileId_fkey" FOREIGN KEY ("dutyProfileId") REFERENCES "DutyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyProfilePermission" ADD CONSTRAINT "DutyProfilePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "HospitalStaff"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_dutyProfileId_fkey" FOREIGN KEY ("dutyProfileId") REFERENCES "DutyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
