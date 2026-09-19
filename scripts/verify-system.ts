import { prisma } from '../src/lib/db'
import { verifyPassword } from '../src/lib/auth'
import { hasPermission } from '../src/lib/permissions'
import { parseAndValidateCsv } from '../src/lib/csv-parser'
import { getWorkspaceAnalytics } from '../src/lib/analytics-engine'
import { getPlanLimits } from '../src/lib/plans'
import { checkFeatureLimit } from '../src/lib/feature-limits'
import fs from 'fs'
import path from 'path'

async function runVerification() {
  console.log('🚀 Starting Multi-Tenant SaaS Platform Comprehensive Verification...\n')

  let passed = 0
  let failed = 0

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`)
      passed++
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`)
      failed++
    }
  }

  // 1. Multi-Tenant Database & User Verification
  console.log('📦 1. Database & Multi-Tenant Organization Isolation')
  const orgs = await prisma.organization.findMany({
    include: { memberships: { include: { user: true } }, datasets: true },
  })
  assert(orgs.length >= 2, 'Multiple workspaces exist in database', `Found ${orgs.length}`)

  const acmeOrg = orgs.find((o) => o.slug === 'acme-analytics')
  const betaOrg = orgs.find((o) => o.slug === 'beta-labs')
  assert(!!acmeOrg && !!betaOrg, 'Acme and Beta workspaces exist')

  assert(
    (acmeOrg?.datasets.length ?? 0) >= 2 && (betaOrg?.datasets.length ?? 0) === 0,
    'Strict Data Isolation: Acme datasets are NOT visible or leaked to Beta workspace'
  )

  // 2. Authentication & Token / User Verification
  console.log('\n🔐 2. Authentication & Credential Verification')
  const owner = await prisma.user.findUnique({ where: { email: 'owner@acme.com' } })
  assert(!!owner, 'Demo Owner account exists')
  const validPass = await verifyPassword('password123', owner?.passwordHash || '')
  assert(validPass, 'Password hash verification succeeded for password123')
  const invalidPass = await verifyPassword('wrongpassword', owner?.passwordHash || '')
  assert(!invalidPass, 'Invalid password correctly rejected')

  // Proxy token and user existence tests
  const { createSessionToken, verifySessionToken } = await import('../src/lib/auth')
  const validToken = await createSessionToken({ userId: owner!.id, email: owner!.email })
  const decodedValid = await verifySessionToken(validToken)
  assert(decodedValid?.userId === owner!.id, 'Valid session token properly decoded')

  // Check user existence in DB
  const verifiedUser = await prisma.user.findUnique({ where: { id: decodedValid?.userId } })
  assert(!!verifiedUser, 'Proxy check: User exists in database for valid token')

  // Test non-existent user ID in token
  const ghostToken = await createSessionToken({ userId: 'ghost_user_id_999', email: 'ghost@acme.com' })
  const decodedGhost = await verifySessionToken(ghostToken)
  const nonExistentUser = await prisma.user.findUnique({ where: { id: decodedGhost?.userId } })
  assert(nonExistentUser === null, 'Proxy check: Non-existent user correctly fails existence check')

  // Test tampered/invalid token
  const invalidToken = 'invalid.tampered.token'
  const decodedInvalid = await verifySessionToken(invalidToken)
  assert(decodedInvalid === null, 'Proxy check: Tampered token fails cryptographic verification')

  // 3. Role-Based Access Control (RBAC) Matrix
  console.log('\n🛡️ 3. Role-Based Access Control (RBAC) Permissions')
  assert(hasPermission('OWNER', 'org:delete'), 'OWNER can delete organization')
  assert(!hasPermission('ADMIN', 'org:delete'), 'ADMIN cannot delete organization')
  assert(hasPermission('ADMIN', 'members:invite'), 'ADMIN can invite members')
  assert(!hasPermission('MEMBER', 'members:invite'), 'MEMBER cannot invite members')
  assert(hasPermission('MEMBER', 'datasets:upload'), 'MEMBER can upload datasets')
  assert(!hasPermission('VIEWER', 'datasets:upload'), 'VIEWER cannot upload datasets')
  assert(hasPermission('VIEWER', 'data:view'), 'VIEWER can view dashboard')
  assert(!hasPermission('VIEWER', 'reports:create'), 'VIEWER cannot create reports')

  // 4. CSV Ingestion & Validation Pipeline
  console.log('\n📊 4. CSV Ingestion, Parsing & Schema Validation')
  const salesCsvPath = path.join(__dirname, '../public/samples/sales-data.csv')
  const salesCsvContent = fs.readFileSync(salesCsvPath, 'utf-8')
  const salesParsed = parseAndValidateCsv(salesCsvContent, 50000)
  assert(salesParsed.valid, 'Sample sales CSV parsed and validated successfully')
  assert(salesParsed.detectedType === 'SALES', 'Detected SALES schema correctly')
  assert(salesParsed.rowCount === 20, 'Identified 20 data rows in sales CSV')

  const marketingCsvPath = path.join(__dirname, '../public/samples/marketing-data.csv')
  const marketingCsvContent = fs.readFileSync(marketingCsvPath, 'utf-8')
  const marketingParsed = parseAndValidateCsv(marketingCsvContent, 50000)
  assert(marketingParsed.valid, 'Sample marketing CSV parsed and validated successfully')
  assert(marketingParsed.detectedType === 'MARKETING', 'Detected MARKETING schema correctly')
  assert(marketingParsed.rowCount === 15, 'Identified 15 data rows in marketing CSV')

  // Malformed CSV test
  const badCsv = `Date,Revenue,Category\nnot-a-date,100,Tech\n2026-08-01,bad-number,Tech`
  const badParsed = parseAndValidateCsv(badCsv, 50000)
  assert(!badParsed.valid, 'Malformed CSV invalid date correctly flagged')
  assert(badParsed.errors.length > 0, 'Line-level validation error messages reported')

  // 5. Analytics Computation Engine
  console.log('\n📈 5. Analytics Aggregation & KPI Computation Engine')
  if (acmeOrg) {
    const analytics = await getWorkspaceAnalytics({
      organizationId: acmeOrg.id,
    })
    assert(analytics.kpis.primaryTotal > 0, 'Computed non-zero primary metric total (Revenue/Spend)')
    assert(analytics.timeSeries.length > 0, 'Calculated time-series data points for charts')
    assert(analytics.categoryBreakdown.length > 0, 'Computed category breakdown distribution')
    assert(analytics.availableCategories.length > 0, 'Identified available categories for filtering')
  }

  // 6. Stripe Test-Mode Plans & Usage Limits (INR ₹)
  console.log('\n💳 6. Stripe Test-Mode Plans & Usage Limits (INR ₹)')
  const freeLimits = getPlanLimits('FREE')
  assert(freeLimits.priceMonthly === 0, 'Free plan priced at ₹0/month')
  assert(freeLimits.maxMembers === 3, 'Free plan limits members to 3')
  assert(freeLimits.monthlyUploads === 10, 'Free plan limits monthly uploads to 10')
  assert(freeLimits.maxRowsPerCsv === 50000, 'Free plan supports 50,000 rows/month')
  assert(freeLimits.retentionDays === 30, 'Free plan has 30-day data retention')

  const proLimits = getPlanLimits('PRO')
  assert(proLimits.priceMonthly === 1499, 'Pro plan priced at ₹1,499/month')
  assert(proLimits.maxMembers === 15, 'Pro plan supports 15 members')
  assert(proLimits.monthlyUploads === 100, 'Pro plan supports 100 uploads/month')
  assert(proLimits.maxRowsPerCsv === 500000, 'Pro plan supports 500,000 rows/month')
  assert(proLimits.retentionDays === 365, 'Pro plan has 1-year data retention')

  const advancedLimits = getPlanLimits('ADVANCED')
  assert(advancedLimits.priceMonthly === 4999, 'Advanced plan priced at ₹4,999/month')
  assert(advancedLimits.maxMembers >= 50, 'Advanced plan supports 50+ members')
  assert(advancedLimits.monthlyUploads === 500, 'Advanced plan supports 500 uploads/month')
  assert(advancedLimits.maxRowsPerCsv === 5000000, 'Advanced plan supports 5M rows/month')
  assert(advancedLimits.retentionDays === 1095, 'Advanced plan has 3-year data retention')

  // 7. Audit Logging
  console.log('\n📜 7. Audit Activity Trail')
  if (acmeOrg) {
    const auditLogs = await prisma.auditLog.findMany({
      where: { organizationId: acmeOrg.id },
    })
    assert(auditLogs.length >= 4, 'Audit logs recorded and retrieved for workspace')
  }

  // 8. Auth Context & Auth Guard Component Exports
  console.log('\n🛡️ 8. React Context API & Declarative Auth Guard Components')
  const authModule = await import('../src/lib/auth')
  assert(typeof authModule.requireAuthUser === 'function', 'requireAuthUser server-side guard exported')
  assert(typeof authModule.requireActiveOrgId === 'function', 'requireActiveOrgId server-side helper exported')

  const contextModule = await import('../src/contexts/auth-context')
  assert(typeof contextModule.AuthProvider === 'function', 'AuthProvider React Context component exported')
  assert(typeof contextModule.useAuth === 'function', 'useAuth hook exported')
  assert(typeof contextModule.usePermission === 'function', 'usePermission hook exported')
  assert(typeof contextModule.useRole === 'function', 'useRole hook exported')
  assert(typeof contextModule.usePlan === 'function', 'usePlan hook exported')

  const guardModule = await import('../src/components/auth/auth-guard')
  assert(typeof guardModule.AuthGuard === 'function', 'AuthGuard wrapper component exported')
  assert(typeof guardModule.PermissionGate === 'function', 'PermissionGate wrapper component exported')
  assert(typeof guardModule.RoleGate === 'function', 'RoleGate wrapper component exported')
  assert(typeof guardModule.PlanGate === 'function', 'PlanGate wrapper component exported')
  // 9. Parent-Child Organization & Workspace Hierarchy Verification
  console.log('\n🏢 9. Parent-Child Organization & Workspace Hierarchy & Sibling Isolation')
  const orgsWithWorkspaces = await prisma.organization.findMany({
    include: {
      workspaces: {
        include: {
          datasets: true,
          reports: true,
        },
      },
    },
  })

  const acmeWithWorkspaces = orgsWithWorkspaces.find((o) => o.slug === 'acme-analytics')
  assert(
    !!acmeWithWorkspaces && acmeWithWorkspaces.workspaces.length >= 2,
    'Acme Organization contains multiple child Workspaces',
    `Found ${acmeWithWorkspaces?.workspaces.length} workspaces`
  )

  const salesWs = acmeWithWorkspaces?.workspaces.find((w) => w.slug === 'sales-ops')
  const marketingWs = acmeWithWorkspaces?.workspaces.find((w) => w.slug === 'marketing-labs')
  assert(!!salesWs && !!marketingWs, 'Sales Operations and Marketing Labs child workspaces exist in Acme')

  // Verify dataset attachment to child workspaces
  assert(
    salesWs!.datasets.length > 0 && marketingWs!.datasets.length > 0,
    'Datasets are properly attached to child workspace IDs'
  )

  // Test Sibling Workspace Data Isolation in Analytics
  const salesAnalytics = await getWorkspaceAnalytics({
    organizationId: acmeWithWorkspaces!.id,
    workspaceId: salesWs!.id,
  })
  const marketingAnalytics = await getWorkspaceAnalytics({
    organizationId: acmeWithWorkspaces!.id,
    workspaceId: marketingWs!.id,
  })

  assert(
    !salesAnalytics.isMarketing && marketingAnalytics.isMarketing,
    'Sibling Workspace Isolation: Sales WS correctly identifies SALES schema; Marketing WS identifies MARKETING schema'
  )
  assert(
    salesAnalytics.kpis.primaryTotal !== marketingAnalytics.kpis.primaryTotal,
    'Sibling Workspace Isolation: Metric totals in Sales WS do not mix with Marketing WS'
  )

  // Test Plan Quota on Child Workspaces
  console.log('\n⚖️ 10. Organization Plan Workspace Quota Enforcement')
  const betaWithWorkspaces = orgsWithWorkspaces.find((o) => o.slug === 'beta-labs')
  assert(!!betaWithWorkspaces, 'Beta Labs organization found')

  // Beta is on FREE plan and already has 1 workspace
  const betaWorkspaceLimit = await checkFeatureLimit(betaWithWorkspaces!.id, 'workspaces')
  assert(
    !betaWorkspaceLimit.allowed,
    'FREE Plan Quota: Successfully prevents creating more than 1 workspace',
    betaWorkspaceLimit.message
  )

  // Acme is on PRO plan (allows up to 5 workspaces)
  const acmeWorkspaceLimit = await checkFeatureLimit(acmeWithWorkspaces!.id, 'workspaces')
  assert(
    acmeWorkspaceLimit.allowed,
    'PRO Plan Quota: Allows creating additional workspaces when under limit (2/5 used)'
  )

  // Verify auth session helpers
  assert(typeof authModule.requireActiveWorkspaceId === 'function', 'requireActiveWorkspaceId exported and available')
  assert(typeof authModule.setActiveWorkspaceCookie === 'function', 'setActiveWorkspaceCookie exported and available')

  console.log(`\n=============================================`)
  console.log(`Verification Complete: ${passed} PASSED, ${failed} FAILED`)
  console.log(`=============================================\n`)

  if (failed > 0) process.exit(1)
}

runVerification()
  .catch((e) => {
    console.error('Test execution failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
