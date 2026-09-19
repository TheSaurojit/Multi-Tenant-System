import { prisma } from '../src/lib/db'

async function migrateToParentChildWorkspaces() {
  console.log('🔄 Starting migration to Parent-Child Organization -> Workspace hierarchy...')

  try {
    // 1. Create Workspace table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Workspace" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "description" TEXT,
        "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_organizationId_slug_key" ON "Workspace"("organizationId", "slug");
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Workspace_organizationId_idx" ON "Workspace"("organizationId");
    `)
    console.log('✅ Created Workspace table and indexes')

    // 2. Populate a primary default Workspace for every existing Organization
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Workspace" ("id", "name", "slug", "description", "organizationId", "createdAt", "updatedAt")
      SELECT 
        'ws_' || "id",
        "name" || ' Workspace',
        'main',
        'Primary workspace for ' || "name",
        "id",
        NOW(),
        NOW()
      FROM "Organization"
      ON CONFLICT ("organizationId", "slug") DO NOTHING;
    `)
    console.log('✅ Created primary workspaces for all existing organizations')

    // 3. Add workspaceId column to Dataset, DataPoint, and SavedReport
    await prisma.$executeRawUnsafe(`ALTER TABLE "Dataset" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "DataPoint" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "SavedReport" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;`)
    console.log('✅ Added workspaceId columns')

    // 4. Backfill workspaceId
    await prisma.$executeRawUnsafe(`
      UPDATE "Dataset" d
      SET "workspaceId" = w."id"
      FROM "Workspace" w
      WHERE d."organizationId" = w."organizationId" AND d."workspaceId" IS NULL;
    `)
    await prisma.$executeRawUnsafe(`
      UPDATE "DataPoint" dp
      SET "workspaceId" = w."id"
      FROM "Workspace" w
      WHERE dp."organizationId" = w."organizationId" AND dp."workspaceId" IS NULL;
    `)
    await prisma.$executeRawUnsafe(`
      UPDATE "SavedReport" r
      SET "workspaceId" = w."id"
      FROM "Workspace" w
      WHERE r."organizationId" = w."organizationId" AND r."workspaceId" IS NULL;
    `)
    console.log('✅ Backfilled workspaceId references')

    // 5. Set NOT NULL & Foreign Key Constraints
    await prisma.$executeRawUnsafe(`ALTER TABLE "Dataset" ALTER COLUMN "workspaceId" SET NOT NULL;`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "DataPoint" ALTER COLUMN "workspaceId" SET NOT NULL;`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "SavedReport" ALTER COLUMN "workspaceId" SET NOT NULL;`)

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Dataset_workspaceId_fkey') THEN
          ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DataPoint_workspaceId_fkey') THEN
          ALTER TABLE "DataPoint" ADD CONSTRAINT "DataPoint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SavedReport_workspaceId_fkey') THEN
          ALTER TABLE "SavedReport" ADD CONSTRAINT "SavedReport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `)
    console.log('✅ Constraints and foreign keys applied successfully')

    // 6. Create indexes
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DataPoint_workspaceId_date_idx" ON "DataPoint"("workspaceId", "date");`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DataPoint_workspaceId_category_idx" ON "DataPoint"("workspaceId", "category");`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Dataset_workspaceId_idx" ON "Dataset"("workspaceId");`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SavedReport_workspaceId_idx" ON "SavedReport"("workspaceId");`)
    console.log('✅ Indexes created')

    console.log('🎉 Parent-Child Hierarchy Migration Completed Successfully!')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

migrateToParentChildWorkspaces()
