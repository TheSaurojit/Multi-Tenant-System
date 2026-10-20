import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params
  const now = new Date()

  // Format date as YYYY-MM-DD relative to today
  const formatDate = (daysAgo: number) => {
    const d = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
    return d.toISOString().split('T')[0]
  }

  if (filename === 'sales-data.csv') {
    const csvContent = [
      'Date,Category,Product,Revenue,Cost,UnitsSold,Region',
      `${formatDate(14)},Enterprise Software,Cloud ERP Suite,24500,4200,5,North America`,
      `${formatDate(14)},Hardware Solutions,Workstation Pro X,18200,8900,12,EMEA`,
      `${formatDate(13)},Cloud Services,Managed Kubernetes,12400,2100,24,North America`,
      `${formatDate(12)},Consulting,Architecture Review,8500,1800,2,APAC`,
      `${formatDate(11)},Enterprise Software,Security Shield AI,31200,5100,8,North America`,
      `${formatDate(10)},Hardware Solutions,Edge Computing Gateway,9800,4500,10,EMEA`,
      `${formatDate(9)},Cloud Services,Database Replication Cluster,15600,2800,16,APAC`,
      `${formatDate(8)},Consulting,Compliance Audit,14000,2900,3,North America`,
      `${formatDate(8)},Enterprise Software,DevOps Pipeline Pro,19800,3300,9,EMEA`,
      `${formatDate(7)},Hardware Solutions,High-Speed Fiber Switch,11500,5400,7,North America`,
      `${formatDate(6)},Cloud Services,Serverless Functions Pool,8900,1400,28,APAC`,
      `${formatDate(5)},Enterprise Software,Data Warehouse Connector,27400,4600,6,North America`,
      `${formatDate(5)},Hardware Solutions,Storage Array NVMe,22900,10500,4,EMEA`,
      `${formatDate(4)},Cloud Services,Global CDN Acceleration,13700,2200,19,North America`,
      `${formatDate(3)},Enterprise Software,Cloud ERP Suite,26000,4300,5,APAC`,
      `${formatDate(3)},Hardware Solutions,Workstation Pro X,16500,8100,11,North America`,
      `${formatDate(2)},Consulting,DevOps Transformation,19500,3800,4,EMEA`,
      `${formatDate(1)},Enterprise Software,Security Shield AI,33500,5400,9,North America`,
      `${formatDate(1)},Cloud Services,Managed Kubernetes,14200,2300,26,APAC`,
      `${formatDate(0)},Hardware Solutions,Edge Computing Gateway,10400,4800,11,North America`,
    ].join('\n')

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="sales-data.csv"',
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  }

  if (filename === 'marketing-data.csv') {
    const csvContent = [
      'Date,Campaign,Channel,Spend,Impressions,Clicks,Conversions',
      `${formatDate(14)},Q3 Brand Awareness,Google Search Ads,1200,45000,1850,92`,
      `${formatDate(13)},B2B Enterprise LeadGen,LinkedIn Ads,2400,28000,920,44`,
      `${formatDate(12)},Retargeting Cart Abandoners,Meta Ads,850,52000,2100,118`,
      `${formatDate(11)},Cloud Native Summit Promo,Tech Newsletter,1500,65000,3400,85`,
      `${formatDate(10)},Q3 Brand Awareness,Google Search Ads,1350,48000,1980,105`,
      `${formatDate(9)},B2B Enterprise LeadGen,LinkedIn Ads,2900,31000,1050,58`,
      `${formatDate(8)},Retargeting Cart Abandoners,Meta Ads,920,54000,2250,132`,
      `${formatDate(7)},Product Launch AI Agent,Google Search Ads,1800,62000,2800,140`,
      `${formatDate(6)},Cloud Native Summit Promo,Tech Newsletter,1500,67000,3550,90`,
      `${formatDate(5)},B2B Enterprise LeadGen,LinkedIn Ads,3100,34000,1180,62`,
      `${formatDate(4)},Q3 Brand Awareness,Google Search Ads,1450,51000,2100,112`,
      `${formatDate(3)},Retargeting Cart Abandoners,Meta Ads,980,56000,2400,145`,
      `${formatDate(2)},Product Launch AI Agent,Google Search Ads,2100,71000,3200,168`,
      `${formatDate(1)},B2B Enterprise LeadGen,LinkedIn Ads,3300,36000,1290,71`,
      `${formatDate(0)},Cloud Native Summit Promo,Tech Newsletter,1500,68000,3600,95`,
    ].join('\n')

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="marketing-data.csv"',
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  }

  return NextResponse.json({ error: 'Sample dataset not found' }, { status: 404 })
}
