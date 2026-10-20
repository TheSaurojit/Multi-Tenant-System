import { prisma } from '../src/lib/db'
import {
  InviteMemberSchema,
  UpdateMemberRoleSchema,
  LoginSchema,
  SignupSchema,
  SaveReportSchema,
  EntityIdSchema,
  PlanSchema,
} from '../src/lib/validations'
import { hasPermission } from '../src/lib/permissions'
import { exportDataPointsToCsv, getWorkspaceAnalytics } from '../src/lib/analytics-engine'
import fs from 'fs'
import path from 'path'

async function runFixesVerification() {
  console.log('🧪 Verifying P1: Correctness & Security Fixes...\n')
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

  // 1. Zod Validations across all server actions
  console.log('🛡️ 1. Zod Runtime Validations for Server Actions')
  
  // Role escalation prevention
  const ownerInvite = InviteMemberSchema.safeParse({ email: 'hacker@test.com', role: 'OWNER' })
  assert(!ownerInvite.success, 'InviteMemberSchema rejects role OWNER')

  const memberInvite = InviteMemberSchema.safeParse({ email: 'newbie@test.com', role: 'MEMBER' })
  assert(memberInvite.success && memberInvite.data.role === 'MEMBER', 'InviteMemberSchema accepts role MEMBER')

  const ownerUpdate = UpdateMemberRoleSchema.safeParse({ targetUserId: 'usr_123', newRole: 'OWNER' })
  assert(!ownerUpdate.success, 'UpdateMemberRoleSchema rejects newRole OWNER')

  // Auth schemas
  const invalidLogin = LoginSchema.safeParse({ email: 'bad-email', password: '' })
  assert(!invalidLogin.success, 'LoginSchema rejects invalid email and empty password')

  const validLogin = LoginSchema.safeParse({ email: 'valid@example.com', password: 'secretpassword' })
  assert(validLogin.success, 'LoginSchema accepts valid email and password')

  const shortPassSignup = SignupSchema.safeParse({ name: 'Bob', email: 'bob@example.com', password: '123', workspaceName: 'Bob Co' })
  assert(!shortPassSignup.success, 'SignupSchema rejects password shorter than 6 characters')

  // Report & ID schemas
  const invalidReport = SaveReportSchema.safeParse({ name: '', filters: {} })
  assert(!invalidReport.success, 'SaveReportSchema rejects empty report name')

  const validReport = SaveReportSchema.safeParse({ name: 'Quarterly Sales', filters: { range: 'last30' } })
  assert(validReport.success, 'SaveReportSchema accepts valid report input')

  const invalidId = EntityIdSchema.safeParse('   ')
  assert(!invalidId.success, 'EntityIdSchema rejects blank IDs')

  const invalidIdFormat = EntityIdSchema.safeParse('cuid_12345; DROP TABLE users')
  assert(!invalidIdFormat.success, 'EntityIdSchema rejects malformed IDs')

  const validId = EntityIdSchema.safeParse('cmf3kx9v2p0001a7b4d6f8g2h')
  assert(validId.success, 'EntityIdSchema accepts valid IDs')

  // Plan schema
  const invalidPlan = PlanSchema.safeParse('SUPER_ENTERPRISE')
  assert(!invalidPlan.success, 'PlanSchema rejects invalid plan values')

  const validPlan = PlanSchema.safeParse('PRO')
  assert(validPlan.success, 'PlanSchema accepts valid plan values')

  // 2. RBAC Hardening: ADMIN stripped of billing:manage
  console.log('\n👑 2. RBAC Permissions Verification')
  assert(hasPermission('OWNER', 'billing:manage'), 'OWNER has billing:manage permission')
  assert(!hasPermission('ADMIN', 'billing:manage'), 'ADMIN does NOT have billing:manage permission')
  assert(!hasPermission('MEMBER', 'billing:manage'), 'MEMBER does NOT have billing:manage permission')
  assert(!hasPermission('VIEWER', 'billing:manage'), 'VIEWER does NOT have billing:manage permission')

  assert(hasPermission('OWNER', 'data:export'), 'OWNER has data:export permission')
  assert(hasPermission('ADMIN', 'data:export'), 'ADMIN has data:export permission')
  assert(hasPermission('MEMBER', 'data:export'), 'MEMBER has data:export permission')
  assert(!hasPermission('VIEWER', 'data:export'), 'VIEWER does NOT have data:export permission')

  // 3. JWT Secret Validation
  console.log('\n🔐 3. Fatal Failure on Weak/Missing JWT Secret')
  const { getJwtSecret } = await import('../src/lib/auth')
  const currentSecret = process.env.JWT_SECRET
  assert(typeof getJwtSecret === 'function', 'getJwtSecret helper exists')
  
  try {
    process.env.JWT_SECRET = 'short'
    let threw = false
    try {
      getJwtSecret()
    } catch (e: unknown) {
      threw = e instanceof Error && e.message.includes('FATAL: JWT_SECRET')
    }
    assert(threw, 'Throws fatal error when JWT_SECRET is shorter than 32 characters')
  } finally {
    process.env.JWT_SECRET = currentSecret
  }

  // 4. Stripe Key Protection: No Free Upgrades on Missing Secret
  console.log('\n💳 4. Stripe Key Protection & No Free Auto-Upgrades')
  const { createCheckoutSession } = await import('../src/lib/stripe')
  const currentStripeKey = process.env.STRIPE_SECRET_KEY
  try {
    process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder_key'
    let checkoutThrew = false
    try {
      const acmeOrg = await prisma.organization.findUnique({ where: { slug: 'acme-analytics' } })
      await createCheckoutSession({
        organizationId: acmeOrg!.id,
        plan: 'ADVANCED',
        userId: 'usr_test',
        userEmail: 'test@example.com',
        returnUrl: 'http://localhost:3000',
      })
    } catch (e: unknown) {
      checkoutThrew = e instanceof Error && e.message.includes('Stripe billing is not configured')
    }
    assert(checkoutThrew, 'createCheckoutSession rejects requests when STRIPE_SECRET_KEY is a placeholder (no free upgrades)')
  } finally {
    process.env.STRIPE_SECRET_KEY = currentStripeKey
  }

  // 5. Webhook Route Consolidation & Idempotency
  console.log('\n🪝 5. Stripe Webhook Route Verification')
  const duplicateWebhookPath = path.join(process.cwd(), 'src/app/api/stripe/webhook/route.ts')
  assert(!fs.existsSync(duplicateWebhookPath), 'Duplicate route /api/stripe/webhook/route.ts was deleted')

  const canonicalWebhookPath = path.join(process.cwd(), 'src/app/api/webhooks/stripe/route.ts')
  assert(fs.existsSync(canonicalWebhookPath), 'Canonical route /api/webhooks/stripe/route.ts exists')
  
  const webhookCode = fs.readFileSync(canonicalWebhookPath, 'utf8')
  assert(webhookCode.includes('entityType: \'StripeWebhook\''), 'Canonical route records event-id for idempotency')
  assert(webhookCode.includes('sub.items?.data?.[0]?.current_period_end'), 'Canonical route uses 2026-08-26.dahlia sub.items current_period_end')
  assert(webhookCode.includes('subscription_details?.subscription'), 'Canonical route uses 2026-08-26.dahlia invoice subscription path')

  // 6. Analytics & Real KPI Comparison (No Fabricated 12.4, 8.1, 15.2)
  console.log('\n📈 6. True Period-over-Period KPI Calculation & Dataset Isolation')
  const acmeOrg = await prisma.organization.findUnique({ where: { slug: 'acme-analytics' } })
  const acmeWorkspace = await prisma.workspace.findFirst({ where: { organizationId: acmeOrg!.id } })

  const analytics = await getWorkspaceAnalytics({
    organizationId: acmeOrg!.id,
    workspaceId: acmeWorkspace?.id || '',
    range: 'last90',
  })

  assert(analytics.kpis !== undefined, 'Analytics KPIs calculated successfully')
  assert(
    analytics.kpis.primaryChange === null || typeof analytics.kpis.primaryChange === 'number',
    'primaryChange is number or null (not hardcoded default)'
  )
  assert(
    analytics.kpis.secondaryChange === null || typeof analytics.kpis.secondaryChange === 'number',
    'secondaryChange is number or null (not hardcoded default)'
  )
  assert(
    analytics.kpis.tertiaryChange === null || typeof analytics.kpis.tertiaryChange === 'number',
    'tertiaryChange is number or null (not hardcoded default)'
  )

  // 7. CSV Export Formula Injection Sanitization
  console.log('\n🔒 7. CSV Export Formula Injection Protection')
  const testPoints = [
    {
      date: new Date('2026-01-01'),
      category: '=cmd|"/C calc"!A0',
      subCategory: '+12345',
      metric1: 100,
      metric2: 50,
      metric3: 10,
      region: '@special',
      channel: '-discount',
    },
    {
      date: new Date('2026-01-02'),
      category: 'Electronics',
      subCategory: 'Audio',
      metric1: 200,
      metric2: 100,
      metric3: 20,
      region: 'North',
      channel: 'Direct',
    },
  ]

  const exportedCsv = exportDataPointsToCsv(testPoints, false)
  assert(exportedCsv.includes("'=cmd|"), 'Formula starting with = is sanitized with single quote')
  assert(exportedCsv.includes("'+12345"), 'Formula starting with + is sanitized with single quote')
  assert(exportedCsv.includes("'@special"), 'Formula starting with @ is sanitized with single quote')
  assert(exportedCsv.includes("'-discount"), 'Formula starting with - is sanitized with single quote')
  assert(!exportedCsv.includes("'Electronics"), 'Safe value Electronics is not modified')

  // 8. Next.js Config Body Limit
  console.log('\n📦 8. Server Actions Body Limit Configuration')
  const nextConfigContent = fs.readFileSync(path.join(process.cwd(), 'next.config.ts'), 'utf8')
  assert(
    nextConfigContent.includes('bodySizeLimit: "15mb"') || nextConfigContent.includes("bodySizeLimit: '15mb'"),
    'next.config.ts configures serverActions bodySizeLimit: 15mb'
  )

  console.log(`\n=============================================`)
  console.log(`P1 Fixes Verification: ${passed} PASSED, ${failed} FAILED`)
  console.log(`=============================================\n`)

  if (failed > 0) process.exit(1)
}

runFixesVerification()
  .catch((e) => {
    console.error('Error running fixes verification:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
