-- AlterTable
ALTER TABLE "Dataset" ADD COLUMN     "categories" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "DailyRollup" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "metric1" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "metric2" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "metric3" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyRollup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyRollup_workspaceId_date_idx" ON "DailyRollup"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "DailyRollup_workspaceId_category_idx" ON "DailyRollup"("workspaceId", "category");

-- CreateIndex
CREATE INDEX "DailyRollup_organizationId_date_idx" ON "DailyRollup"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRollup_datasetId_date_category_key" ON "DailyRollup"("datasetId", "date", "category");

-- AddForeignKey
ALTER TABLE "DailyRollup" ADD CONSTRAINT "DailyRollup_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRollup" ADD CONSTRAINT "DailyRollup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRollup" ADD CONSTRAINT "DailyRollup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
