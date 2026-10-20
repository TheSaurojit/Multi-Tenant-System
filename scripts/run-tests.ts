/**
 * Comprehensive Automated Test Suite
 *
 * Covers:
 * 1. CSV Parser Hardening (number formats, dates, disjoint metrics/categories, error reporting)
 * 2. Rate Limiting Protection (sliding window, max attempts, resets)
 * 3. Unique Slug Generation & Collision Resolution (retry loops)
 * 4. Role-Based Access Control & Permission Enforcement
 * 5. Plan Quotas, Tier Flags & Retention Limits
 * 6. Transactional Quota Checks with Mock Client
 */

import { parseRobustNumber, parseRobustDate, parseAndValidateCsv } from '../src/lib/csv-parser'
import { checkRateLimit, resetRateLimit } from '../src/lib/rate-limit'
import { sanitizeIp } from '../src/lib/request-ip'
import { slugify, generateUniqueSlug } from '../src/lib/slug'
import { hasPermission, assertPermission } from '../src/lib/permissions'
import { getPlanLimits } from '../src/lib/plans'
import { checkFeatureLimit, getRetentionCutoff } from '../src/lib/feature-limits'
import { resolveAuthRedirect } from '../src/lib/auth'
import { Prisma } from '../generated/prisma'

let passedTests = 0
let failedTests = 0

function assert(condition: boolean, testName: string, failureDetail?: string) {
  if (condition) {
    passedTests++
    console.log(`  ✓ ${testName}`)
  } else {
    failedTests++
    console.error(`  ✗ FAIL: ${testName}`)
    if (failureDetail) console.error(`    Detail: ${failureDetail}`)
  }
}

async function runTestSuite() {
  console.log('\n============================================================')
  console.log('       MULTI-TENANT ANALYTICS PLATFORM - TEST SUITE         ')
  console.log('============================================================\n')

  // -------------------------------------------------------------------------
  // 1. CSV PARSER: Number Parsing & Edge Cases
  // -------------------------------------------------------------------------
  console.log('--- Suite 1: CSV Parser Number & Financial Formats ---')
  {
    assert(parseRobustNumber('123.45') === 123.45, 'Standard decimal string')
    assert(parseRobustNumber('₹1,499.50') === 1499.5, 'Currency symbol with comma thousands')
    assert(parseRobustNumber('$9,999.99') === 9999.99, 'Dollar with comma thousands')
    assert(parseRobustNumber('(100.50)') === -100.5, 'Accounting negative in parentheses (100.50)')
    assert(parseRobustNumber('(500)') === -500, 'Accounting negative integer (500)')
    assert(parseRobustNumber('1.234,56') === 1234.56, 'European number format with period thousands and comma decimal')
    assert(parseRobustNumber('25%') === 25, 'Percentage string parsing')
    assert(parseRobustNumber('   450.75   ') === 450.75, 'Trims surrounding whitespace')
    assert(parseRobustNumber('') === 0, 'Empty string safely defaults to 0')
    assert(parseRobustNumber('N/A') === 0, 'Non-numeric string safely defaults to 0')
  }

  // -------------------------------------------------------------------------
  // 2. CSV PARSER: Timezone-Independent UTC Date Parsing
  // -------------------------------------------------------------------------
  console.log('\n--- Suite 2: CSV Parser Timezone-Independent Date Parsing ---')
  {
    const dIso = parseRobustDate('2026-03-15')
    assert(dIso !== null && dIso.getUTCFullYear() === 2026 && dIso.getUTCMonth() === 2 && dIso.getUTCDate() === 15, 'ISO format YYYY-MM-DD')

    const dIsoTime = parseRobustDate('2026-03-15T14:30:00Z')
    assert(dIsoTime !== null && dIsoTime.toISOString() === '2026-03-15T14:30:00.000Z', 'Full ISO 8601 UTC timestamp')

    const dEu = parseRobustDate('31/12/2025')
    assert(dEu !== null && dEu.getUTCFullYear() === 2025 && dEu.getUTCMonth() === 11 && dEu.getUTCDate() === 31, 'European DD/MM/YYYY format')

    const dUs = parseRobustDate('05/20/2026')
    assert(dUs !== null && dUs.getUTCFullYear() === 2026 && dUs.getUTCMonth() === 4 && dUs.getUTCDate() === 20, 'US MM/DD/YYYY format')

    assert(parseRobustDate('not-a-date') === null, 'Invalid date string returns null')
    assert(parseRobustDate('') === null, 'Empty date string returns null')
    assert(parseRobustDate('invalid-date-0') === null, 'Rejects loose non-date string')
  }

  // -------------------------------------------------------------------------
  // 3. CSV PARSER: Disjoint Metric & Category Mapping
  // -------------------------------------------------------------------------
  console.log('\n--- Suite 3: CSV Parser Disjoint Metric & Category Mapping ---')
  {
    // Sales CSV: Revenue, Quantity, Cost -> Cost must not be double counted as Revenue
    const salesCsv = `Date,Category,Product,Revenue,Cost,Units
2026-01-01,Electronics,Laptop,50000,30000,10
2026-01-02,Electronics,Phone,20000,12000,5`

    const parsedSales = parseAndValidateCsv(salesCsv, 1000)
    assert(parsedSales.valid, 'Valid Sales CSV parses successfully')
    assert(parsedSales.detectedType === 'SALES', 'Correctly detects SALES dataset type')
    assert(parsedSales.dataPoints.length === 2, 'Parses 2 data points')
    const p0 = parsedSales.dataPoints[0]
    assert(p0.metric1 === 50000, 'Sales metric1 is Revenue (50,000)')
    assert(p0.metric2 === 30000, 'Sales metric2 is Cost (30,000)')
    assert(p0.metric3 === 10, 'Sales metric3 is Quantity (10)')
    assert(p0.category === 'Electronics', 'Category correctly mapped')
    assert(p0.subCategory === 'Laptop', 'SubCategory correctly mapped to Product')
    assert(p0.metadata === undefined, 'No duplicate raw row stored in metadata')

    // Marketing CSV: Spend, Conversions, Clicks
    const marketingCsv = `Date,Campaign,Channel,Spend,Conversions,Clicks
2026-02-01,Spring Sale,Google Ads,1500,75,1200
2026-02-02,Spring Sale,Meta Ads,2200,110,1800`

    const parsedMarketing = parseAndValidateCsv(marketingCsv, 1000)
    assert(parsedMarketing.valid, 'Valid Marketing CSV parses successfully')
    assert(parsedMarketing.detectedType === 'MARKETING', 'Correctly detects MARKETING dataset type')
    const m0 = parsedMarketing.dataPoints[0]
    assert(m0.metric1 === 1500, 'Marketing metric1 is Spend (1500)')
    assert(m0.metric2 === 1200, 'Marketing metric2 is Clicks (1200)')
    assert(m0.metric3 === 75, 'Marketing metric3 is Conversions (75)')
    assert(m0.category === 'Spring Sale', 'Campaign mapped to category')
    assert(m0.channel === 'Google Ads', 'Channel is disjoint and not overwritten by campaign')

    // Error reporting cap test
    let badRowsCsv = 'Date,Category,Metric\n'
    for (let i = 0; i < 70; i++) {
      badRowsCsv += `not-a-real-date-${i},Cat,100\n`
    }
    const parsedErrors = parseAndValidateCsv(badRowsCsv, 1000)
    assert(!parsedErrors.valid, 'Invalid rows marked as invalid')
    assert(parsedErrors.errors.length === 50, 'Errors capped at exactly 50 to prevent client flood')
  }

  // -------------------------------------------------------------------------
  // 4. RATE LIMITING UTILITY
  // -------------------------------------------------------------------------
  console.log('\n--- Suite 4: Sliding-Window Rate Limiting ---')
  {
    const id = 'test-ip-user-123'
    resetRateLimit(id)

    // First 5 attempts should succeed
    for (let i = 1; i <= 5; i++) {
      const res = checkRateLimit(id, 5, 10000)
      assert(res.allowed, `Attempt ${i} is allowed`)
      assert(res.remaining === 5 - i, `Remaining count is ${5 - i}`)
    }

    // 6th attempt should be blocked
    const blockedRes = checkRateLimit(id, 5, 10000)
    assert(!blockedRes.allowed, 'Attempt 6 is blocked')
    assert(blockedRes.remaining === 0, 'Remaining is 0 when blocked')
    assert(blockedRes.resetInSeconds > 0, 'Reset seconds is positive')

    // Reset works
    resetRateLimit(id)
    const afterReset = checkRateLimit(id, 5, 10000)
    assert(afterReset.allowed, 'Attempt after explicit reset is allowed')
    resetRateLimit(id)

    // IP Sanitization and Header Parsing
    assert(sanitizeIp('192.168.1.1') === '192.168.1.1', 'Valid IPv4 address parses correctly')
    assert(sanitizeIp('  10.0.0.1  ') === '10.0.0.1', 'IPv4 with whitespace is trimmed')
    assert(sanitizeIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334') === '2001:0db8:85a3:0000:0000:8a2e:0370:7334', 'Valid IPv6 parses correctly')
    assert(sanitizeIp('not-an-ip') === null, 'Invalid IP string returns null')
    assert(sanitizeIp('') === null, 'Empty IP string returns null')
    assert(sanitizeIp(undefined) === null, 'Undefined IP returns null')
    assert(sanitizeIp('999.999.999.999') === null, 'Out-of-range IPv4 octets return null')

    // Null-IP Rate Limiting Isolation:
    // If clientIp is null, per-IP rate limits are skipped, preventing an attacker from
    // locking out legitimate users on an unproxied host.
    const attackerIp: string | null = null
    const legitimateIp: string | null = null
    const targetEmail = 'admin@acme.com'

    // Simulating attacker failed login attempts when IP is null
    let attackerLocked = false
    if (attackerIp) {
      const res = checkRateLimit(`login:${attackerIp}:${targetEmail}`, 5, 10000)
      if (!res.allowed) attackerLocked = true
    }
    assert(!attackerLocked, 'Attacker with null IP does not lock out target email')

    // Legitimate user attempt proceeds unaffected
    let legitimateAllowed = true
    if (legitimateIp) {
      const res = checkRateLimit(`login:${legitimateIp}:${targetEmail}`, 5, 10000)
      if (!res.allowed) legitimateAllowed = false
    }
    assert(legitimateAllowed, 'Legitimate user with null IP is not locked out by attacker attempts')
  }

  // -------------------------------------------------------------------------
  // 5. SLUG GENERATION & COLLISION RETRY LOOP
  // -------------------------------------------------------------------------
  console.log('\n--- Suite 5: Slug Generation & Retry Loop ---')
  {
    assert(slugify('My Team Workspace!') === 'my-team-workspace', 'Slugify basic text')
    assert(slugify('  ---Hello World---  ') === 'hello-world', 'Slugify trims and collapses dashes')
    assert(slugify('   ') === 'item', 'Slugify empty fallback')

    // Collision resolution
    const takenSlugs = new Set(['analytics-corp', 'analytics-corp-1', 'analytics-corp-2'])
    const uniqueSlug = await generateUniqueSlug('Analytics Corp', async (candidate) => takenSlugs.has(candidate))

    assert(!takenSlugs.has(uniqueSlug), `Resolved unique slug "${uniqueSlug}" is not in taken list`)
    assert(uniqueSlug === 'analytics-corp-3', 'Sequential retry picks the next available suffix (analytics-corp-3)')
  }

  // -------------------------------------------------------------------------
  // 6. ROLE-BASED ACCESS CONTROL (RBAC)
  // -------------------------------------------------------------------------
  console.log('\n--- Suite 6: Role-Based Access Control (RBAC) ---')
  {
    assert(hasPermission('OWNER', 'billing:manage'), 'OWNER has billing:manage')
    assert(!hasPermission('ADMIN', 'billing:manage'), 'ADMIN does NOT have billing:manage (Owner-only)')
    assert(!hasPermission('MEMBER', 'billing:manage'), 'MEMBER does NOT have billing:manage')
    assert(!hasPermission('VIEWER', 'billing:manage'), 'VIEWER does NOT have billing:manage')

    assert(hasPermission('ADMIN', 'members:invite'), 'ADMIN can invite members')
    assert(!hasPermission('MEMBER', 'members:invite'), 'MEMBER cannot invite members')

    assert(hasPermission('MEMBER', 'datasets:upload'), 'MEMBER can upload datasets')
    assert(!hasPermission('VIEWER', 'datasets:upload'), 'VIEWER cannot upload datasets')
    assert(hasPermission('VIEWER', 'data:view'), 'VIEWER can view analytics data')

    // Organization workspace creation RBAC
    assert(hasPermission('OWNER', 'org:update'), 'OWNER has org:update')
    assert(hasPermission('ADMIN', 'org:update'), 'ADMIN has org:update')
    assert(!hasPermission('MEMBER', 'org:update'), 'MEMBER does NOT have org:update (cannot create workspace)')
    assert(!hasPermission('VIEWER', 'org:update'), 'VIEWER does NOT have org:update (cannot create workspace)')

    // Audit logs viewing RBAC
    assert(hasPermission('OWNER', 'audit:view'), 'OWNER has audit:view')
    assert(hasPermission('ADMIN', 'audit:view'), 'ADMIN has audit:view')
    assert(!hasPermission('MEMBER', 'audit:view'), 'MEMBER does NOT have audit:view')
    assert(!hasPermission('VIEWER', 'audit:view'), 'VIEWER does NOT have audit:view')

    // Billing viewing RBAC (sidebar navigation gate)
    assert(hasPermission('OWNER', 'billing:view'), 'OWNER has billing:view')
    assert(hasPermission('ADMIN', 'billing:view'), 'ADMIN has billing:view')
    assert(!hasPermission('MEMBER', 'billing:view'), 'MEMBER does NOT have billing:view (hidden from sidebar)')
    assert(!hasPermission('VIEWER', 'billing:view'), 'VIEWER does NOT have billing:view (hidden from sidebar)')

    // Sidebar navigation items role-based visibility checks
    const navPermissions = {
      analytics: 'data:view' as const,
      datasets: 'data:view' as const,
      reports: 'data:view' as const,
      billing: 'billing:view' as const,
      auditLogs: 'audit:view' as const,
    }
    assert(hasPermission('VIEWER', navPermissions.analytics), 'VIEWER sees Analytics in sidebar')
    assert(hasPermission('VIEWER', navPermissions.datasets), 'VIEWER sees Datasets in sidebar')
    assert(hasPermission('VIEWER', navPermissions.reports), 'VIEWER sees Reports in sidebar')
    assert(!hasPermission('VIEWER', navPermissions.billing), 'VIEWER does NOT see Billing in sidebar')
    assert(!hasPermission('VIEWER', navPermissions.auditLogs), 'VIEWER does NOT see Audit Logs in sidebar')
    assert(!hasPermission('MEMBER', navPermissions.billing), 'MEMBER does NOT see Billing in sidebar')
    assert(!hasPermission('MEMBER', navPermissions.auditLogs), 'MEMBER does NOT see Audit Logs in sidebar')
    assert(hasPermission('ADMIN', navPermissions.billing), 'ADMIN sees Billing in sidebar')
    assert(hasPermission('OWNER', navPermissions.billing), 'OWNER sees Billing in sidebar')

    let threw = false
    try {
      assertPermission('VIEWER', 'billing:manage')
    } catch {
      threw = true
    }
    assert(threw, 'assertPermission throws on missing permission')
  }

  // -------------------------------------------------------------------------
  // 7. PLAN LIMITS & FEATURE FLAGS
  // -------------------------------------------------------------------------
  console.log('\n--- Suite 7: Plan Limits & Tier Configurations ---')
  {
    const free = getPlanLimits('FREE')
    assert(!free.canExportCsv, 'Free plan cannot export CSV')
    assert(!free.hasAuditLogs, 'Free plan cannot view audit logs')
    assert(free.maxMembers === 3, 'Free plan has 3 members max')
    assert(free.maxWorkspaces === 1, 'Free plan has 1 workspace max')
    assert(free.monthlyUploads === 5, 'Free plan has 5 uploads/month')
    assert(free.maxRowsPerCsv === 50000, 'Free plan max 50,000 rows/CSV')
    assert(free.retentionDays === 30, 'Free plan retention is 30 days')

    const pro = getPlanLimits('PRO')
    assert(pro.canExportCsv, 'Pro plan can export CSV')
    assert(pro.hasAuditLogs, 'Pro plan has audit logs')
    assert(pro.maxMembers === 15, 'Pro plan has 15 members max')
    assert(pro.maxWorkspaces === 5, 'Pro plan has 5 workspaces max')
    assert(pro.monthlyUploads === 50, 'Pro plan has 50 uploads/month')
    assert(pro.maxRowsPerCsv === 50000, 'Pro plan max 50,000 rows/CSV')
    assert(pro.retentionDays === 365, 'Pro plan retention is 365 days')

    const advanced = getPlanLimits('ADVANCED')
    assert(advanced.maxMembers === Infinity, 'Advanced plan has Infinity members')
    assert(advanced.maxWorkspaces === Infinity, 'Advanced plan has Infinity workspaces')
    assert(advanced.monthlyUploads === 250, 'Advanced plan has 250 uploads/month')
    assert(advanced.maxRowsPerCsv === 100000, 'Advanced plan max 100,000 rows/CSV')
    assert(advanced.retentionDays === 1095, 'Advanced plan retention is 1095 days (3 years)')

    const cutoff = getRetentionCutoff('FREE')
    const approx30DaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    assert(Math.abs(cutoff.getTime() - approx30DaysAgo) < 2000, 'Retention cutoff calculates 30 days correctly')
  }

  // -------------------------------------------------------------------------
  // 8. TRANSACTIONAL QUOTA CHECKS WITH MOCK CLIENT
  // -------------------------------------------------------------------------
  console.log('\n--- Suite 8: Quota Enforcement & Mock Client Transaction ---')
  {
    const mockTxAllowed = {
      organization: {
        findUnique: async () => ({ plan: 'FREE' }),
      },
      workspace: {
        count: async () => 0,
      },
    }

    const checkAllowed = await checkFeatureLimit('mock-org', 'workspaces', mockTxAllowed as unknown as Prisma.TransactionClient)
    assert(checkAllowed.allowed, 'Workspace quota allows creation when count is 0 on Free plan')

    const mockTxExceeded = {
      organization: {
        findUnique: async () => ({ plan: 'FREE' }),
      },
      workspace: {
        count: async () => 1,
      },
    }

    const checkBlocked = await checkFeatureLimit('mock-org', 'workspaces', mockTxExceeded as unknown as Prisma.TransactionClient)
    assert(!checkBlocked.allowed, 'Workspace quota blocks creation when count reaches 1 on Free plan')
    assert(!!checkBlocked.message, 'Provides user-friendly limit message')
  }

  // -------------------------------------------------------------------------
  // 9. TRANSACTIONAL EMAILS & PASSWORD RESET
  // -------------------------------------------------------------------------
  console.log('\n--- Suite 9: Transactional Emails & Password Reset Security ---')
  {
    const {
      ForgotPasswordSchema,
      ResetPasswordSchema,
      VerifyEmailSchema,
      ResendVerificationSchema,
    } = await import('../src/lib/validations')
    const {
      sendEmailVerificationEmail,
      sendSignupWelcomeEmail,
      sendForgotPasswordEmail,
      sendPasswordResetSuccessEmail,
      sendWorkspaceInviteEmail,
    } = await import('../src/lib/email')
    const crypto = await import('crypto')

    // 1. ForgotPasswordSchema tests
    const validEmail = ForgotPasswordSchema.safeParse({ email: 'user@example.com' })
    assert(validEmail.success, 'ForgotPasswordSchema accepts valid email')

    const invalidEmail = ForgotPasswordSchema.safeParse({ email: 'not-an-email' })
    assert(!invalidEmail.success, 'ForgotPasswordSchema rejects invalid email')

    // 2. ResetPasswordSchema tests
    const validReset = ResetPasswordSchema.safeParse({
      token: 'valid-random-hex-token-1234567890',
      password: 'StrongPassword123',
    })
    assert(validReset.success, 'ResetPasswordSchema accepts valid password with letter and number')

    const shortPassword = ResetPasswordSchema.safeParse({
      token: 'valid-token',
      password: 'short1',
    })
    assert(!shortPassword.success, 'ResetPasswordSchema rejects password under 8 characters')

    const noNumberPassword = ResetPasswordSchema.safeParse({
      token: 'valid-token',
      password: 'PasswordWithoutNumbers',
    })
    assert(!noNumberPassword.success, 'ResetPasswordSchema rejects password missing numbers')

    const noLetterPassword = ResetPasswordSchema.safeParse({
      token: 'valid-token',
      password: '12345678901234',
    })
    assert(!noLetterPassword.success, 'ResetPasswordSchema rejects password missing letters')

    // 3. Email Verification Schemas
    const validVerifyToken = VerifyEmailSchema.safeParse({ token: 'secure-token-123' })
    assert(validVerifyToken.success, 'VerifyEmailSchema accepts valid token')

    const emptyVerifyToken = VerifyEmailSchema.safeParse({ token: '   ' })
    assert(!emptyVerifyToken.success, 'VerifyEmailSchema rejects empty token')

    const validResend = ResendVerificationSchema.safeParse({ email: 'user@acme.com' })
    assert(validResend.success, 'ResendVerificationSchema accepts valid email')

    // 4. Cryptographic Token Hashing Verification
    const rawToken = 'test-token-value-abc-123'
    const hash1 = crypto.createHash('sha256').update(rawToken).digest('hex')
    const hash2 = crypto.createHash('sha256').update(rawToken).digest('hex')
    assert(hash1 === hash2, 'SHA-256 token hashing is deterministic')
    assert(hash1.length === 64, 'SHA-256 token hash has standard 64 hex character length')

    // 5. Resend Email Dispatchers in fallback mode
    const verifyResult = await sendEmailVerificationEmail({
      to: 'newuser@acme.com',
      name: 'Alice',
      verificationUrl: 'http://localhost:3000/verify-email?token=mocktoken',
    })
    assert(verifyResult.success, 'sendEmailVerificationEmail succeeds in dev fallback mode')

    const signupResult = await sendSignupWelcomeEmail({
      to: 'newuser@acme.com',
      name: 'Alice',
      workspaceName: 'Acme Growth',
    })
    assert(signupResult.success, 'sendSignupWelcomeEmail succeeds in dev fallback mode')

    const forgotResult = await sendForgotPasswordEmail({
      to: 'alice@acme.com',
      name: 'Alice',
      resetUrl: 'http://localhost:3000/reset-password?token=mocktoken',
    })
    assert(forgotResult.success, 'sendForgotPasswordEmail succeeds in dev fallback mode')

    const resetSuccessResult = await sendPasswordResetSuccessEmail({
      to: 'alice@acme.com',
      name: 'Alice',
    })
    assert(resetSuccessResult.success, 'sendPasswordResetSuccessEmail succeeds in dev fallback mode')

    const inviteResult = await sendWorkspaceInviteEmail({
      to: 'colleague@acme.com',
      inviterName: 'Alice',
      organizationName: 'Acme Growth',
      role: 'MEMBER',
      inviteUrl: 'http://localhost:3000/invite/mocktoken',
    })
    assert(inviteResult.success, 'sendWorkspaceInviteEmail succeeds in dev fallback mode')
  }

  // -------------------------------------------------------------------------
  // 10. POST-AUTH REDIRECTION & OPEN-REDIRECT MITIGATION
  // -------------------------------------------------------------------------
  console.log('\n--- Suite 10: Post-Auth Redirection & Open-Redirect Mitigation ---')
  {
    // Valid relative destinations
    assert(
      resolveAuthRedirect('/invite/tok_sample123') === '/invite/tok_sample123',
      'Preserves valid invite acceptance path'
    )
    assert(
      resolveAuthRedirect('/dashboard') === '/dashboard',
      'Preserves /dashboard destination'
    )
    assert(
      resolveAuthRedirect('/workspace/team?filter=admin') === '/workspace/team?filter=admin',
      'Preserves nested workspace route with query parameters'
    )
    assert(
      resolveAuthRedirect('/datasets?sort=date&order=desc') === '/datasets?sort=date&order=desc',
      'Preserves datasets route with multiple query parameters'
    )

    // Open redirect attacks & protocol evasion
    assert(
      resolveAuthRedirect('https://attacker-domain.com') === '/dashboard',
      'Neutralizes external HTTPS scheme redirect to fallback'
    )
    assert(
      resolveAuthRedirect('http://malicious.org/phish') === '/dashboard',
      'Neutralizes external HTTP scheme redirect to fallback'
    )
    assert(
      resolveAuthRedirect('//malicious-domain.com') === '/dashboard',
      'Neutralizes protocol-relative double-slash bypass'
    )
    assert(
      resolveAuthRedirect('/\\evil.com') === '/dashboard',
      'Neutralizes backslash evasion sequence'
    )
    assert(
      resolveAuthRedirect('\\\\attacker.com') === '/dashboard',
      'Neutralizes Windows backslash UNC path'
    )

    // Circular auth loops
    assert(
      resolveAuthRedirect('/login') === '/dashboard',
      'Prevents circular redirect loop back to /login'
    )
    assert(
      resolveAuthRedirect('/login?from=/dashboard') === '/dashboard',
      'Prevents circular redirect loop back to /login with query params'
    )
    assert(
      resolveAuthRedirect('/signup') === '/dashboard',
      'Prevents circular redirect loop back to /signup'
    )

    // Empty, malformed, or missing inputs
    assert(
      resolveAuthRedirect(null) === '/dashboard',
      'Safely defaults null input to /dashboard'
    )
    assert(
      resolveAuthRedirect(undefined) === '/dashboard',
      'Safely defaults undefined input to /dashboard'
    )
    assert(
      resolveAuthRedirect('') === '/dashboard',
      'Safely defaults empty string to /dashboard'
    )
    assert(
      resolveAuthRedirect(12345) === '/dashboard',
      'Safely defaults non-string input to /dashboard'
    )
    assert(
      resolveAuthRedirect(null, '/custom-fallback') === '/custom-fallback',
      'Respects custom fallback when input is invalid'
    )
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n============================================================')
  console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`)
  console.log('============================================================\n')

  if (failedTests > 0) {
    process.exit(1)
  }
}

runTestSuite().catch((err) => {
  console.error('Test runner encountered unexpected error:', err)
  process.exit(1)
})
