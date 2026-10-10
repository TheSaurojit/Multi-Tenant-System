import { prisma } from './db'
import { AuditAction, Prisma } from '../../generated/prisma'
import { getClientIp } from './request-ip'

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
    const clientIp = await getClientIp()

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
