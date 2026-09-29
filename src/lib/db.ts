import "server-only";

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from "../../generated/prisma";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://saas_user:saas_password@localhost:5432/saas_analytics?schema=public'

const adapter = new PrismaPg({ connectionString })

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
