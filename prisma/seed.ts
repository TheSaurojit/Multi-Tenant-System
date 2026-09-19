import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/db'

async function main() {
  console.log('🌱 Starting database seeding with Parent-Child Organization -> Workspace structure...')

  // Clean existing demo data in proper cascade order
  await prisma.auditLog.deleteMany()
  await prisma.savedReport.deleteMany()
  await prisma.dataPoint.deleteMany()
  await prisma.dataset.deleteMany()
  await prisma.invitation.deleteMany()
  await prisma.membership.deleteMany()
  await prisma.workspace.deleteMany()
  await prisma.organization.deleteMany()
  await prisma.user.deleteMany()

  const passwordHash = await bcrypt.hash('password123', 10)

  // 1. Create Users
  const ownerUser = await prisma.user.create({
    data: {
      email: 'owner@acme.com',
      name: 'Sarah Connor (Owner)',
      passwordHash,
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    },
  })

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@acme.com',
      name: 'Alex Rivers (Admin)',
      passwordHash,
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    },
  })

  const memberUser = await prisma.user.create({
    data: {
      email: 'member@acme.com',
      name: 'Marcus Vance (Member)',
      passwordHash,
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    },
  })

  const viewerUser = await prisma.user.create({
    data: {
      email: 'viewer@acme.com',
      name: 'Elena Rostova (Viewer)',
      passwordHash,
      avatarUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150',
    },
  })

  // 2. Create Parent Organizations
  const acmeOrg = await prisma.organization.create({
    data: {
      name: 'Acme Analytics Inc.',
      slug: 'acme-analytics',
      plan: 'PRO',
      subscriptionStatus: 'ACTIVE',
      stripeCustomerId: 'cus_simulated_acme_pro',
      stripeSubscriptionId: 'sub_simulated_acme_pro',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  })

  const betaOrg = await prisma.organization.create({
    data: {
      name: 'Beta Launch Labs',
      slug: 'beta-labs',
      plan: 'FREE',
      subscriptionStatus: 'INACTIVE',
    },
  })

  // 3. Create Child Workspaces inside Organizations
  // Acme has PRO plan (allows up to 5 workspaces): create 2 distinct workspaces
  const acmeSalesWs = await prisma.workspace.create({
    data: {
      name: 'Sales Operations',
      slug: 'sales-ops',
      description: 'Enterprise revenue metrics, sales pipeline, and hardware fulfillment',
      organizationId: acmeOrg.id,
    },
  })

  const acmeMarketingWs = await prisma.workspace.create({
    data: {
      name: 'Marketing Labs',
      slug: 'marketing-labs',
      description: 'Omnichannel campaign performance, paid acquisition, and ad ROI',
      organizationId: acmeOrg.id,
    },
  })

  // Beta has FREE plan (allows 1 workspace): create 1 primary workspace
  const betaMainWs = await prisma.workspace.create({
    data: {
      name: 'Beta Primary Workspace',
      slug: 'main',
      description: 'Default operational workspace for Beta Launch Labs',
      organizationId: betaOrg.id,
    },
  })

  // 4. Assign Memberships to Organizations
  await prisma.membership.createMany({
    data: [
      { userId: ownerUser.id, organizationId: acmeOrg.id, role: 'OWNER' },
      { userId: adminUser.id, organizationId: acmeOrg.id, role: 'ADMIN' },
      { userId: memberUser.id, organizationId: acmeOrg.id, role: 'MEMBER' },
      { userId: viewerUser.id, organizationId: acmeOrg.id, role: 'VIEWER' },
      // Owner also owns betaOrg
      { userId: ownerUser.id, organizationId: betaOrg.id, role: 'OWNER' },
    ],
  })

  // 5. Create Datasets inside specific Workspaces
  const salesDataset = await prisma.dataset.create({
    data: {
      name: 'Q3 Enterprise Sales Performance.csv',
      type: 'SALES',
      fileSize: 45200,
      rowCount: 20,
      status: 'COMPLETED',
      organizationId: acmeOrg.id,
      workspaceId: acmeSalesWs.id,
      uploadedById: adminUser.id,
    },
  })

  const marketingDataset = await prisma.dataset.create({
    data: {
      name: 'Fall Omnichannel Campaign ROI.csv',
      type: 'MARKETING',
      fileSize: 32800,
      rowCount: 15,
      status: 'COMPLETED',
      organizationId: acmeOrg.id,
      workspaceId: acmeMarketingWs.id,
      uploadedById: memberUser.id,
    },
  })

  // 6. Insert Data Points for Sales Workspace
  const salesData = [
    { date: new Date('2026-08-01'), category: 'Enterprise Software', subCategory: 'Cloud ERP Suite', metric1: 24500, metric2: 4200, metric3: 5, region: 'North America' },
    { date: new Date('2026-08-03'), category: 'Hardware Solutions', subCategory: 'Workstation Pro X', metric1: 18200, metric2: 8900, metric3: 12, region: 'EMEA' },
    { date: new Date('2026-08-05'), category: 'Cloud Services', subCategory: 'Managed Kubernetes', metric1: 12400, metric2: 2100, metric3: 24, region: 'North America' },
    { date: new Date('2026-08-07'), category: 'Consulting', subCategory: 'Architecture Review', metric1: 8500, metric2: 1800, metric3: 2, region: 'APAC' },
    { date: new Date('2026-08-10'), category: 'Enterprise Software', subCategory: 'Security Shield AI', metric1: 31200, metric2: 5100, metric3: 8, region: 'North America' },
    { date: new Date('2026-08-12'), category: 'Hardware Solutions', subCategory: 'Edge Gateway', metric1: 9800, metric2: 4500, metric3: 10, region: 'EMEA' },
    { date: new Date('2026-08-14'), category: 'Cloud Services', subCategory: 'Replication Cluster', metric1: 15600, metric2: 2800, metric3: 16, region: 'APAC' },
    { date: new Date('2026-08-17'), category: 'Consulting', subCategory: 'Compliance Audit', metric1: 14000, metric2: 2900, metric3: 3, region: 'North America' },
    { date: new Date('2026-08-19'), category: 'Enterprise Software', subCategory: 'DevOps Pipeline', metric1: 19800, metric2: 3300, metric3: 9, region: 'EMEA' },
    { date: new Date('2026-08-22'), category: 'Hardware Solutions', subCategory: 'Fiber Switch', metric1: 11500, metric2: 5400, metric3: 7, region: 'North America' },
    { date: new Date('2026-08-25'), category: 'Cloud Services', subCategory: 'Serverless Pool', metric1: 8900, metric2: 1400, metric3: 28, region: 'APAC' },
    { date: new Date('2026-08-28'), category: 'Enterprise Software', subCategory: 'Data Connector', metric1: 27400, metric2: 4600, metric3: 6, region: 'North America' },
    { date: new Date('2026-08-30'), category: 'Hardware Solutions', subCategory: 'Storage NVMe', metric1: 22900, metric2: 10500, metric3: 4, region: 'EMEA' },
    { date: new Date('2026-09-02'), category: 'Cloud Services', subCategory: 'CDN Acceleration', metric1: 13700, metric2: 2200, metric3: 19, region: 'North America' },
    { date: new Date('2026-09-04'), category: 'Enterprise Software', subCategory: 'Cloud ERP Suite', metric1: 26000, metric2: 4300, metric3: 5, region: 'APAC' },
    { date: new Date('2026-09-07'), category: 'Hardware Solutions', subCategory: 'Workstation Pro X', metric1: 16500, metric2: 8100, metric3: 11, region: 'North America' },
    { date: new Date('2026-09-09'), category: 'Consulting', subCategory: 'Transformation', metric1: 19500, metric2: 3800, metric3: 4, region: 'EMEA' },
    { date: new Date('2026-09-11'), category: 'Enterprise Software', subCategory: 'Security Shield AI', metric1: 33500, metric2: 5400, metric3: 9, region: 'North America' },
    { date: new Date('2026-09-14'), category: 'Cloud Services', subCategory: 'Managed Kubernetes', metric1: 14200, metric2: 2300, metric3: 26, region: 'APAC' },
    { date: new Date('2026-09-16'), category: 'Hardware Solutions', subCategory: 'Edge Gateway', metric1: 10400, metric2: 4800, metric3: 11, region: 'North America' },
  ]

  for (const p of salesData) {
    await prisma.dataPoint.create({
      data: {
        datasetId: salesDataset.id,
        organizationId: acmeOrg.id,
        workspaceId: acmeSalesWs.id,
        ...p,
      },
    })
  }

  // 7. Insert Data Points for Marketing Workspace
  const marketingData = [
    { date: new Date('2026-08-01'), category: 'Google Search Ads', subCategory: 'Brand Awareness', metric1: 1200, metric2: 45000, metric3: 92, channel: 'Search' },
    { date: new Date('2026-08-03'), category: 'LinkedIn Ads', subCategory: 'Enterprise LeadGen', metric1: 2400, metric2: 28000, metric3: 44, channel: 'Social' },
    { date: new Date('2026-08-05'), category: 'Meta Ads', subCategory: 'Cart Retargeting', metric1: 850, metric2: 52000, metric3: 118, channel: 'Social' },
    { date: new Date('2026-08-08'), category: 'Tech Newsletter', subCategory: 'Sponsorship', metric1: 1500, metric2: 65000, metric3: 85, channel: 'Email' },
    { date: new Date('2026-08-11'), category: 'Google Search Ads', subCategory: 'Brand Awareness', metric1: 1350, metric2: 48000, metric3: 105, channel: 'Search' },
    { date: new Date('2026-08-14'), category: 'LinkedIn Ads', subCategory: 'Enterprise LeadGen', metric1: 2900, metric2: 31000, metric3: 58, channel: 'Social' },
    { date: new Date('2026-08-17'), category: 'Meta Ads', subCategory: 'Cart Retargeting', metric1: 920, metric2: 54000, metric3: 132, channel: 'Social' },
    { date: new Date('2026-08-20'), category: 'Google Search Ads', subCategory: 'AI Agent Launch', metric1: 1800, metric2: 62000, metric3: 140, channel: 'Search' },
    { date: new Date('2026-08-24'), category: 'Tech Newsletter', subCategory: 'Sponsorship', metric1: 1500, metric2: 67000, metric3: 90, channel: 'Email' },
    { date: new Date('2026-08-28'), category: 'LinkedIn Ads', subCategory: 'Enterprise LeadGen', metric1: 3100, metric2: 34000, metric3: 62, channel: 'Social' },
    { date: new Date('2026-09-01'), category: 'Google Search Ads', subCategory: 'Brand Awareness', metric1: 1450, metric2: 51000, metric3: 112, channel: 'Search' },
    { date: new Date('2026-09-05'), category: 'Meta Ads', subCategory: 'Cart Retargeting', metric1: 980, metric2: 56000, metric3: 145, channel: 'Social' },
    { date: new Date('2026-09-09'), category: 'Google Search Ads', subCategory: 'AI Agent Launch', metric1: 2100, metric2: 71000, metric3: 168, channel: 'Search' },
    { date: new Date('2026-09-13'), category: 'LinkedIn Ads', subCategory: 'Enterprise LeadGen', metric1: 3300, metric2: 36000, metric3: 71, channel: 'Social' },
    { date: new Date('2026-09-16'), category: 'Tech Newsletter', subCategory: 'Sponsorship', metric1: 1500, metric2: 68000, metric3: 95, channel: 'Email' },
  ]

  for (const p of marketingData) {
    await prisma.dataPoint.create({
      data: {
        datasetId: marketingDataset.id,
        organizationId: acmeOrg.id,
        workspaceId: acmeMarketingWs.id,
        ...p,
      },
    })
  }

  // 8. Create Saved Reports inside specific Workspaces
  await prisma.savedReport.create({
    data: {
      name: 'High Margin Cloud & Enterprise Software',
      description: 'Tracks revenue and unit sales for high-margin SaaS software suites across North America and APAC.',
      filters: {
        datasetId: salesDataset.id,
        categories: ['Enterprise Software', 'Cloud Services'],
        dateRange: 'last90',
      },
      organizationId: acmeOrg.id,
      workspaceId: acmeSalesWs.id,
      createdById: adminUser.id,
    },
  })

  await prisma.savedReport.create({
    data: {
      name: 'Search & Paid Social Conversion ROI',
      description: 'Performance overview of Google Search and LinkedIn ad spend with conversion counts.',
      filters: {
        datasetId: marketingDataset.id,
        categories: ['Google Search Ads', 'LinkedIn Ads'],
        dateRange: 'last30',
      },
      organizationId: acmeOrg.id,
      workspaceId: acmeMarketingWs.id,
      createdById: memberUser.id,
    },
  })

  // 9. Create Audit Logs
  await prisma.auditLog.createMany({
    data: [
      {
        organizationId: acmeOrg.id,
        userId: ownerUser.id,
        action: 'PLAN_UPGRADED',
        entityType: 'Organization',
        entityId: acmeOrg.id,
        details: { fromPlan: 'FREE', toPlan: 'PRO', amount: 1499 },
      },
      {
        organizationId: acmeOrg.id,
        userId: adminUser.id,
        action: 'USER_INVITED',
        entityType: 'User',
        entityId: viewerUser.id,
        details: { email: viewerUser.email, role: 'VIEWER' },
      },
      {
        organizationId: acmeOrg.id,
        userId: adminUser.id,
        action: 'DATASET_UPLOADED',
        entityType: 'Dataset',
        entityId: salesDataset.id,
        details: { fileName: salesDataset.name, rowCount: 20, type: 'SALES', workspaceId: acmeSalesWs.id },
      },
      {
        organizationId: acmeOrg.id,
        userId: memberUser.id,
        action: 'DATASET_UPLOADED',
        entityType: 'Dataset',
        entityId: marketingDataset.id,
        details: { fileName: marketingDataset.name, rowCount: 15, type: 'MARKETING', workspaceId: acmeMarketingWs.id },
      },
      {
        organizationId: acmeOrg.id,
        userId: adminUser.id,
        action: 'REPORT_CREATED',
        entityType: 'SavedReport',
        details: { reportName: 'High Margin Cloud & Enterprise Software', workspaceId: acmeSalesWs.id },
      },
    ],
  })

  console.log('✅ Database successfully seeded with Parent Organization -> Child Workspaces!')
  console.log('Demo Logins (Password for all: password123):')
  console.log(' - Owner:  owner@acme.com')
  console.log(' - Admin:  admin@acme.com')
  console.log(' - Member: member@acme.com')
  console.log(' - Viewer: viewer@acme.com')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
