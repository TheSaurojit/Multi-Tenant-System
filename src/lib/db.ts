import "server-only";
import "dotenv/config";

import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from "../../generated/prisma";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; pool?: Pool }

const connectionString = process.env.DATABASE_URL 

const pool =
  globalForPrisma.pool ??
  new Pool({
    connectionString,
    max: 75,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 25000,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.pool = pool

const adapter = new PrismaPg(pool)

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
