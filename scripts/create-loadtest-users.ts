import './mock-server-only.js'
import fs from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'
import { prisma } from '../src/lib/db'
import { createSessionToken } from '../src/lib/auth'

async function createLoadTestUsers() {
  console.log('🚀 Creating 50 dedicated load-test users for Acme Analytics Inc. ...\n')

  // 1. Locate Target Organization & Workspace
  let org = await prisma.organization.findUnique({
    where: { slug: 'acme-analytics' },
    include: { workspaces: true },
  })

  if (!org) {
    org = await prisma.organization.findFirst({
      include: { workspaces: true },
    })
  }

  if (!org) {
    throw new Error('No organization found in database. Run npm run db:seed first.')
  }

  // Ensure organization is on ADVANCED or PRO plan with CSV export enabled
  if (org.plan === 'FREE') {
    console.log('⚡ Upgrading organization to ADVANCED plan to enable CSV export and unlimited members...')
    org = await prisma.organization.update({
      where: { id: org.id },
      data: { plan: 'ADVANCED' },
      include: { workspaces: true },
    })
  }

  const workspace = org.workspaces.find((w) => w.slug === 'sales-ops') || org.workspaces[0]
  if (!workspace) {
    throw new Error(`No workspace found for organization ${org.name}`)
  }

  console.log(`🏢 Organization : ${org.name} (${org.id}) [Plan: ${org.plan}]`)
  console.log(`📁 Workspace    : ${workspace.name} (${workspace.id})\n`)

  const passwordHash = await bcrypt.hash('password123', 10)
  const tokens: string[] = []
  const createdUsers: { id: string; email: string }[] = []

  const TOTAL_USERS = 50

  for (let i = 1; i <= TOTAL_USERS; i++) {
    const email = `loadtest_vu_${i}@acme.com`
    const name = `LoadTest VU ${i}`

    // Upsert user
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        sessionVersion: 1,
      },
      create: {
        email,
        name,
        passwordHash,
        emailVerified: new Date(),
        sessionVersion: 1,
      },
    })

    // Upsert membership with MEMBER role (grants data:export permission)
    await prisma.membership.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: org.id,
        },
      },
      update: {
        role: 'MEMBER',
      },
      create: {
        userId: user.id,
        organizationId: org.id,
        role: 'MEMBER',
      },
    })

    // Generate JWT session token
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      sessionVersion: user.sessionVersion,
    })

    tokens.push(token)
    createdUsers.push({ id: user.id, email: user.email })
  }

  // Verify all tokens are unique
  const uniqueCount = new Set(tokens).size
  if (uniqueCount < TOTAL_USERS) {
    throw new Error(`Expected ${TOTAL_USERS} unique tokens, but got ${uniqueCount}`)
  }

  console.log(`✅ Successfully provisioned ${TOTAL_USERS} users and memberships!`)
  console.log(`🔑 Verified ${uniqueCount} cryptographically unique session tokens.`)

  // Save tokens to JSON files for k6 consumption
  const rootTokensPath = path.join(process.cwd(), 'loadtest-tokens.json')
  const scriptsTokensPath = path.join(process.cwd(), 'scripts', 'loadtest-tokens.json')

  fs.writeFileSync(rootTokensPath, JSON.stringify(tokens, null, 2), 'utf-8')
  fs.writeFileSync(scriptsTokensPath, JSON.stringify(tokens, null, 2), 'utf-8')

  console.log(`\n💾 Saved tokens to:`)
  console.log(`   - ${rootTokensPath}`)
  console.log(`   - ${scriptsTokensPath}`)

  // Write a configuration file for runner scripts
  const configPath = path.join(process.cwd(), 'loadtest-config.json')
  const config = {
    activeOrg: org.id,
    activeWorkspace: workspace.id,
    targetVus: TOTAL_USERS,
    sampleUsers: createdUsers.slice(0, 3),
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  console.log(`   - ${configPath}\n`)

  console.log('🎉 Setup complete! You are ready to run k6 with 50 distinct VUs.')
}

createLoadTestUsers()
  .catch((err) => {
    console.error('❌ Error provisioning load-test users:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
