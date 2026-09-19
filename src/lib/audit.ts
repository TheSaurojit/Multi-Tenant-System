import { prisma } from './db'
import { AuditAction, Prisma } from '@prisma/client'
import { headers } from 'next/headers'

interface LogAuditParams {
  organizationId: string
  userId?: string | null
  action: AuditAction
  entityType: string
  entityId?: string | null
  details?: Record<string, unknown> | null
}

export async function logAuditEvent({
  organizationId,
  userId,
  action,
  entityType,
  entityId,
  details,
}: LogAuditParams) {
  try {
    let clientIp: string | null = null
    try {
      const headerList = await headers()
      clientIp = headerList.get('x-forwarded-for') || headerList.get('x-real-ip')
    } catch {
      // In background tasks or non-request scopes
    }

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: userId ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        details: (details as Prisma.InputJsonValue) ?? undefined,
        ipAddress: clientIp,
      },
    })
  } catch (error) {
    console.error('Failed to write audit log:', error)
  }
}
