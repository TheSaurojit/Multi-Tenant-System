import { prisma } from '../src/lib/db'

async function migrateToFreePlan() {
  console.log('🔄 Migrating PostgreSQL Plan enum and organization records from BASIC to FREE...')

  try {
    // 1. Add FREE to enum Plan if not exists
    await prisma.$executeRawUnsafe(`ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'FREE';`)
    console.log('✅ Added FREE to Plan enum in PostgreSQL')

    // 2. Set default value for Organization.plan to 'FREE'
    await prisma.$executeRawUnsafe(`ALTER TABLE "Organization" ALTER COLUMN "plan" SET DEFAULT 'FREE'::"Plan";`)
    console.log('✅ Updated Organization.plan default to FREE')

    // 3. Update existing organizations: BASIC -> FREE
    await prisma.$executeRawUnsafe(`UPDATE "Organization" SET "plan" = 'FREE'::"Plan" WHERE "plan"::text = 'BASIC';`)
    console.log('✅ Migrated all existing BASIC organization records to FREE')

    const orgs = await prisma.organization.findMany({
      select: { name: true, slug: true, plan: true, subscriptionStatus: true },
    })
    console.log('📋 Current Organizations after migration:', orgs)
  } catch (error) {
    console.error('Migration error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

migrateToFreePlan()
