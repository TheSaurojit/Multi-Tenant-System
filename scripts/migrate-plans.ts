import { prisma } from '../src/lib/db'

async function migratePlans() {
  console.log('🔄 Migrating Plan enum and default in PostgreSQL...')

  try {
    // 1. Add BASIC and ADVANCED to enum Plan if not exist
    await prisma.$executeRawUnsafe(`ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'BASIC';`)
    await prisma.$executeRawUnsafe(`ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'ADVANCED';`)
    console.log('✅ Added BASIC and ADVANCED to Plan enum')

    // 2. Set default value for Organization.plan to 'BASIC'
    await prisma.$executeRawUnsafe(`ALTER TABLE "Organization" ALTER COLUMN "plan" SET DEFAULT 'BASIC'::"Plan";`)
    console.log('✅ Updated Organization.plan default to BASIC')

    // 3. Update existing organizations: FREE -> BASIC, ENTERPRISE -> ADVANCED
    await prisma.$executeRawUnsafe(`UPDATE "Organization" SET "plan" = 'BASIC'::"Plan" WHERE "plan"::text = 'FREE';`)
    await prisma.$executeRawUnsafe(`UPDATE "Organization" SET "plan" = 'ADVANCED'::"Plan" WHERE "plan"::text = 'ENTERPRISE';`)
    console.log('✅ Migrated legacy organization records to BASIC and ADVANCED')
  } catch (error) {
    console.error('Migration error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

migratePlans()
