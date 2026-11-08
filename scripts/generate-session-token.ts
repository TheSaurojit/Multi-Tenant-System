import { prisma } from '../src/lib/db'
import { createSessionToken } from '../src/lib/auth'

async function getToken() {
  const user = await prisma.user.findUnique({
    where: { email: 'owner@acme.com' },
  })

  if (!user) {
    throw new Error('User owner@acme.com not found')
  }

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    sessionVersion: user.sessionVersion,
  })

  console.log(token)
}

getToken()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
