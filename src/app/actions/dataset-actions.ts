'use server'

import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { assertPermission } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { checkFeatureLimit, getPlanLimits } from '@/lib/feature-limits'
import { parseAndValidateCsv } from '@/lib/csv-parser'
import { revalidatePath } from 'next/cache'

export async function uploadCsvAction(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  assertPermission(user.role, 'datasets:upload')

  // Check upload count limit
  const uploadLimit = await checkFeatureLimit(user.activeOrgId, 'uploads')
  if (!uploadLimit.allowed) {
    return { error: uploadLimit.message }
  }

  const file = formData.get('file') as File
  if (!file) {
    return { error: 'Please select a CSV file to upload.' }
  }

  const customName = formData.get('name') as string
  const datasetName = customName && customName.trim().length > 0 ? customName.trim() : file.name

  // Get active org plan limits
  const activeMembership = user.memberships.find((m) => m.orgId === user.activeOrgId)
  const planLimits = getPlanLimits(activeMembership?.plan  || "FREE")

  const text = await file.text()
  const validation = parseAndValidateCsv(text, planLimits.maxRowsPerCsv)

  if (!validation.valid) {
    return {
      error: 'CSV validation failed. Please review the errors below.',
      validationErrors: validation.errors,
    }
  }

  // Create dataset record with PROCESSING status
  const dataset = await prisma.dataset.create({
    data: {
      name: datasetName,
      type: validation.detectedType,
      fileSize: file.size,
      rowCount: 0,
      status: 'PROCESSING',
      organizationId: user.activeOrgId,
      workspaceId: user.activeWorkspaceId,
      uploadedById: user.id,
    },
  })

  try {
    // Ingest data points in chunks of 500 for optimal performance
    const batchSize = 500
    const points = validation.dataPoints

    for (let i = 0; i < points.length; i += batchSize) {
      const chunk = points.slice(i, i + batchSize)
      await prisma.dataPoint.createMany({
        data: chunk.map((p) => ({
          datasetId: dataset.id,
          organizationId: user.activeOrgId,
          workspaceId: user.activeWorkspaceId,
          date: p.date,
          category: p.category,
          subCategory: p.subCategory,
          metric1: p.metric1,
          metric2: p.metric2,
          metric3: p.metric3,
          region: p.region,
          channel: p.channel,
          metadata: p.metadata ? (p.metadata as any) : undefined,
        })),
      })
    }

    // Mark completed
    await prisma.dataset.update({
      where: { id: dataset.id },
      data: {
        status: 'COMPLETED',
        rowCount: points.length,
      },
    })

    // Audit log
    await logAuditEvent({
      organizationId: user.activeOrgId,
      userId: user.id,
      action: 'DATASET_UPLOADED',
      entityType: 'Dataset',
      entityId: dataset.id,
      details: {
        fileName: datasetName,
        rowCount: points.length,
        type: validation.detectedType,
        fileSize: file.size,
      },
    })

    revalidatePath('/datasets')
    revalidatePath('/dashboard')

    return {
      success: true,
      datasetId: dataset.id,
      rowCount: points.length,
      type: validation.detectedType,
    }
  } catch (err: any) {
    console.error('Ingestion failed:', err)
    await prisma.dataset.update({
      where: { id: dataset.id },
      data: {
        status: 'FAILED',
        errorMessage: err?.message || 'Failed to process CSV records.',
      },
    })
    return { error: 'Failed to ingest records into database.' }
  }
}

export async function deleteDatasetAction(datasetId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  assertPermission(user.role, 'datasets:delete')

  const dataset = await prisma.dataset.findUnique({
    where: { id: datasetId },
  })

  if (!dataset || dataset.organizationId !== user.activeOrgId) {
    throw new Error('Dataset not found')
  }

  await prisma.dataset.delete({
    where: { id: datasetId },
  })

  await logAuditEvent({
    organizationId: user.activeOrgId,
    userId: user.id,
    action: 'DATASET_DELETED',
    entityType: 'Dataset',
    entityId: datasetId,
    details: { fileName: dataset.name, rowCount: dataset.rowCount },
  })

  revalidatePath('/datasets')
  revalidatePath('/dashboard')
  return { success: true }
}
