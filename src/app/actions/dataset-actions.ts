'use server'

import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { assertPermission } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { checkFeatureLimit, getPlanLimits } from '@/lib/feature-limits'
import { parseAndValidateCsv } from '@/lib/csv-parser'
import { EntityIdSchema } from '@/lib/validations'
import { revalidatePath } from 'next/cache'
import { Prisma } from '../../../generated/prisma'

export async function uploadCsvAction(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  assertPermission(user.role, 'datasets:upload')

  const file = formData.get('file') as File
  if (!file) {
    return { error: 'Please select a CSV file to upload.' }
  }

  // Hard limits before the file is read into memory
  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10MB
  if (file.size === 0) {
    return { error: 'The selected file is empty.' }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: 'File exceeds the 10MB upload limit. Please split the CSV and try again.' }
  }
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return { error: 'Only .csv files are supported.' }
  }

  const customName = formData.get('name') as string
  const datasetName = (
    customName && customName.trim().length > 0 ? customName.trim() : file.name
  ).slice(0, 200)

  // Get active org plan limits
  const activeMembership = user.memberships.find((m) => m.orgId === user.activeOrgId)
  const planLimits = getPlanLimits(activeMembership?.plan || 'FREE')

  const text = await file.text()
  const validation = parseAndValidateCsv(text, planLimits.maxRowsPerCsv)

  if (!validation.valid) {
    return {
      error: 'CSV validation failed. Please review the errors below.',
      validationErrors: validation.errors,
    }
  }

  // Atomically check quota limit and create dataset record with PROCESSING status
  const datasetResult = await prisma.$transaction(async (tx) => {
    // Lock the organization row to serialize concurrent quota checks
    await tx.$queryRaw`SELECT 1 FROM "Organization" WHERE id = ${user.activeOrgId} FOR UPDATE`

    const uploadLimit = await checkFeatureLimit(user.activeOrgId, 'uploads', tx)
    if (!uploadLimit.allowed) {
      return { error: uploadLimit.message }
    }

    const created = await tx.dataset.create({
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

    return { dataset: created }
  })

  if ('error' in datasetResult && datasetResult.error) {
    return { error: datasetResult.error }
  }

  if (!('dataset' in datasetResult) || !datasetResult.dataset) {
    return { error: 'Failed to initialize dataset.' }
  }

  const dataset = datasetResult.dataset

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
          metadata: p.metadata ? (p.metadata as Prisma.InputJsonValue) : undefined,
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
  } catch (err: unknown) {
    console.error('Ingestion failed:', err)
    // Atomic ingestion guarantee: clean up partial orphan data points so dataset never leaves corrupted data
    try {
      await prisma.dataPoint.deleteMany({
        where: { datasetId: dataset.id },
      })
    } catch (cleanupErr) {
      console.warn('Failed to clean up orphan data points:', cleanupErr)
    }

    const errorMessage = err instanceof Error ? err.message : 'Failed to process CSV records.'
    await prisma.dataset.update({
      where: { id: dataset.id },
      data: {
        status: 'FAILED',
        errorMessage: errorMessage.slice(0, 500),
        rowCount: 0,
      },
    })
    return { error: 'Failed to ingest records into database.' }
  }
}

export async function deleteDatasetAction(datasetId: string) {
  const parsedId = EntityIdSchema.safeParse(datasetId)
  if (!parsedId.success) {
    return { error: 'Invalid dataset ID.' }
  }
  const validDatasetId = parsedId.data

  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  assertPermission(user.role, 'datasets:delete')

  const dataset = await prisma.dataset.findUnique({
    where: { id: validDatasetId },
  })

  if (!dataset || dataset.organizationId !== user.activeOrgId || dataset.workspaceId !== user.activeWorkspaceId) {
    return { error: 'Dataset not found' }
  }

  await prisma.dataset.delete({
    where: { id: validDatasetId },
  })

  await logAuditEvent({
    organizationId: user.activeOrgId,
    userId: user.id,
    action: 'DATASET_DELETED',
    entityType: 'Dataset',
    entityId: validDatasetId,
    details: { fileName: dataset.name, rowCount: dataset.rowCount },
  })

  revalidatePath('/datasets')
  revalidatePath('/dashboard')
  return { success: true }
}
