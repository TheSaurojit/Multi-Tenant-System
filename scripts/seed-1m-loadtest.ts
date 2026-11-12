import './mock-server-only.js'
import { prisma } from '../src/lib/db'

async function seed1MLoadTest() {
  console.log('🚀 Preparing 1,000,000 row load-test dataset for Acme Analytics Inc. ...')

  // 1. Locate Acme Org and Sales Workspace
  const acmeOrg = await prisma.organization.findUnique({
    where: { slug: 'acme-analytics' },
    include: {
      workspaces: true,
      memberships: { include: { user: true } },
    },
  })

  if (!acmeOrg) {
    throw new Error('Acme Analytics org not found! Run npm run db:seed first.')
  }

  const salesWs = acmeOrg.workspaces.find((w) => w.slug === 'sales-ops') || acmeOrg.workspaces[0]
  const ownerUser = acmeOrg.memberships.find((m) => m.role === 'OWNER')?.user || acmeOrg.memberships[0]?.user

  if (!salesWs || !ownerUser) {
    throw new Error('Sales workspace or Owner user not found!')
  }

  console.log(`Using Org: ${acmeOrg.name} (${acmeOrg.id})`)
  console.log(`Using Workspace: ${salesWs.name} (${salesWs.id})`)
  console.log(`Using User: ${ownerUser.name} (${ownerUser.id})`)

  const categories = [
    'Enterprise Software',
    'Hardware Solutions',
    'Cloud Services',
    'Consulting',
    'Security Systems',
    'Data Warehousing',
    'AI Platforms',
    'Support Contracts',
  ]

  const datasetId = 'ds_loadtest_1m'

  // 2. Clean up any previous 1M load test dataset
  console.log('Cleaning up any previous 1M test dataset...')
  await prisma.dailyRollup.deleteMany({ where: { datasetId } })
  await prisma.dataPoint.deleteMany({ where: { datasetId } })
  await prisma.dataset.deleteMany({ where: { id: datasetId } })

  // 3. Create Dataset record
  console.log('Creating Dataset record...')
  await prisma.dataset.create({
    data: {
      id: datasetId,
      name: '1M Enterprise Sales Benchmark Dataset',
      type: 'SALES',
      fileSize: 85 * 1024 * 1024,
      rowCount: 1000000,
      status: 'COMPLETED',
      organizationId: acmeOrg.id,
      workspaceId: salesWs.id,
      uploadedById: ownerUser.id,
      categories,
    },
  })

  // 4. Fast SQL Generation of 1,000,000 DataPoints
  console.log('⚡ Inserting 1,000,000 DataPoint rows via PostgreSQL generate_series...')
  const startTime = Date.now()

  await prisma.$executeRawUnsafe(`
    INSERT INTO "DataPoint" (
      "id", "datasetId", "organizationId", "workspaceId", "date",
      "category", "subCategory", "metric1", "metric2", "metric3",
      "region", "channel", "createdAt"
    )
    SELECT
      'dp_1m_' || s.i,
      '${datasetId}',
      '${acmeOrg.id}',
      '${salesWs.id}',
      (CURRENT_DATE - ((s.i % 365) || ' days')::interval)::timestamp,
      (ARRAY['Enterprise Software', 'Hardware Solutions', 'Cloud Services', 'Consulting', 'Security Systems', 'Data Warehousing', 'AI Platforms', 'Support Contracts'])[1 + (s.i % 8)],
      'SubCategory-' || (s.i % 20),
      ROUND((10 + ((s.i * 17) % 500))::numeric, 2),
      ROUND((5 + ((s.i * 7) % 250))::numeric, 2),
      FLOOR(1 + ((s.i * 3) % 10)),
      (ARRAY['North America', 'Europe', 'APAC'])[1 + (s.i % 3)],
      (ARRAY['Direct', 'Partner', 'Web'])[1 + (s.i % 3)],
      NOW()
    FROM generate_series(1, 1000000) AS s(i);
  `)

  const dataPointDuration = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log(`✅ 1,000,000 DataPoints inserted in ${dataPointDuration}s!`)

  // 5. Populate DailyRollup (~2,920 rows)
  console.log('⚡ Generating DailyRollup pre-aggregations...')
  const rollupStartTime = Date.now()

  await prisma.$executeRawUnsafe(`
    INSERT INTO "DailyRollup" (
      "id", "datasetId", "organizationId", "workspaceId", "date",
      "category", "metric1", "metric2", "metric3", "recordCount", "createdAt"
    )
    SELECT
      'dr_1m_' || md5(dp."datasetId" || ':' || dp."date"::date::text || ':' || dp."category"),
      dp."datasetId",
      dp."organizationId",
      dp."workspaceId",
      dp."date"::date,
      dp."category",
      SUM(dp."metric1"),
      SUM(dp."metric2"),
      SUM(dp."metric3"),
      COUNT(dp."id"),
      NOW()
    FROM "DataPoint" dp
    WHERE dp."datasetId" = '${datasetId}'
    GROUP BY dp."datasetId", dp."organizationId", dp."workspaceId", dp."date"::date, dp."category";
  `)

  const rollupDuration = ((Date.now() - rollupStartTime) / 1000).toFixed(2)
  const rollupCount = await prisma.dailyRollup.count({ where: { datasetId } })
  console.log(`✅ ${rollupCount} DailyRollup rows created in ${rollupDuration}s!`)

  console.log('\n🎉 Successfully prepared 1M row benchmark dataset!')
}

seed1MLoadTest()
  .catch((err) => {
    console.error('❌ Failed to seed 1M dataset:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
