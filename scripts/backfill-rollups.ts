import { prisma } from '../src/lib/db'

async function backfill() {
  console.log('🔄 Backfilling Dataset.categories and DailyRollup...')

  // 1. Backfill Dataset categories
  const datasets = await prisma.dataset.findMany({
    include: {
      dataPoints: {
        select: {
          category: true,
          date: true,
          metric1: true,
          metric2: true,
          metric3: true,
        },
      },
    },
  })

  for (const ds of datasets) {
    const categories = Array.from(
      new Set(ds.dataPoints.map((p) => p.category.trim()).filter(Boolean))
    ).sort()

    await prisma.dataset.update({
      where: { id: ds.id },
      data: { categories },
    })
    console.log(`Updated Dataset ${ds.id} (${ds.name}) with ${categories.length} categories:`, categories)

    // Aggregate into daily rollups
    const rollupMap = new Map<
      string,
      {
        date: Date
        category: string
        metric1: number
        metric2: number
        metric3: number
        recordCount: number
      }
    >()

    for (const p of ds.dataPoints) {
      const d = new Date(p.date)
      d.setUTCHours(0, 0, 0, 0)
      const key = `${d.toISOString().split('T')[0]}:${p.category}`
      const existing = rollupMap.get(key)
      const m1 = Number(p.metric1) || 0
      const m2 = Number(p.metric2) || 0
      const m3 = Number(p.metric3) || 0

      if (existing) {
        existing.metric1 += m1
        existing.metric2 += m2
        existing.metric3 += m3
        existing.recordCount += 1
      } else {
        rollupMap.set(key, {
          date: d,
          category: p.category,
          metric1: m1,
          metric2: m2,
          metric3: m3,
          recordCount: 1,
        })
      }
    }

    // Clear any existing rollups for this dataset
    await prisma.dailyRollup.deleteMany({
      where: { datasetId: ds.id },
    })

    const rollups = Array.from(rollupMap.values())
    if (rollups.length > 0) {
      await prisma.dailyRollup.createMany({
        data: rollups.map((r) => ({
          datasetId: ds.id,
          organizationId: ds.organizationId,
          workspaceId: ds.workspaceId,
          date: r.date,
          category: r.category,
          metric1: r.metric1,
          metric2: r.metric2,
          metric3: r.metric3,
          recordCount: r.recordCount,
        })),
      })
      console.log(`Created ${rollups.length} DailyRollup rows for Dataset ${ds.id}`)
    }
  }

  console.log('✅ Backfill complete!')
}

backfill()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
