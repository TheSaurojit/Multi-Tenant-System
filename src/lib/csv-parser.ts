import Papa from 'papaparse'
import { DatasetType } from '../../generated/prisma'

export interface ParsedDataPoint {
  date: Date
  category: string
  subCategory?: string
  metric1: number // Revenue or Spend
  metric2: number // Cost or Impressions/Clicks
  metric3: number // Units Sold or Conversions
  region?: string
  channel?: string
  metadata?: Record<string, unknown>
}

export interface CsvValidationResult {
  valid: boolean
  detectedType: DatasetType
  rowCount: number
  dataPoints: ParsedDataPoint[]
  errors: string[]
  headers: string[]
  sampleRows: Record<string, any>[]
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

export function detectDatasetType(headers: string[]): DatasetType {
  const norm = headers.map(normalizeHeader)
  const isMarketing =
    norm.some((h) => ['campaign', 'channel', 'impressions', 'clicks', 'adspend', 'spend'].includes(h))
  if (isMarketing) return 'MARKETING'

  const isSales =
    norm.some((h) => ['revenue', 'sales', 'order', 'unitssold', 'product', 'customer'].includes(h))
  if (isSales) return 'SALES'

  return 'CUSTOM'
}

export function parseAndValidateCsv(
  csvText: string,
  maxRows: number = 50000
): CsvValidationResult {
  const parseResult = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  })

  if (parseResult.errors.length > 0) {
    const parseErrors = parseResult.errors
      .slice(0, 5)
      .map((e) => `Row ${e.row ?? 'Unknown'}: ${e.message}`)
    return {
      valid: false,
      detectedType: 'CUSTOM',
      rowCount: 0,
      dataPoints: [],
      errors: parseErrors,
      headers: [],
      sampleRows: [],
    }
  }

  const rows = parseResult.data
  if (!rows || rows.length === 0) {
    return {
      valid: false,
      detectedType: 'CUSTOM',
      rowCount: 0,
      dataPoints: [],
      errors: ['The uploaded CSV file is empty.'],
      headers: [],
      sampleRows: [],
    }
  }

  if (rows.length > maxRows) {
    return {
      valid: false,
      detectedType: 'CUSTOM',
      rowCount: rows.length,
      dataPoints: [],
      errors: [`Row count (${rows.length}) exceeds current plan limit of ${maxRows} rows.`],
      headers: Object.keys(rows[0] || {}),
      sampleRows: rows.slice(0, 5),
    }
  }

  const headers = Object.keys(rows[0])
  const detectedType = detectDatasetType(headers)

  const headerMap: Record<string, string> = {}
  for (const h of headers) {
    headerMap[normalizeHeader(h)] = h
  }

  // Identify column keys
  const dateKey =
    headerMap['date'] ||
    headerMap['timestamp'] ||
    headerMap['createdat'] ||
    headerMap['orderdate'] ||
    headers[0]

  const categoryKey =
    headerMap['category'] ||
    headerMap['productcategory'] ||
    headerMap['campaign'] ||
    headerMap['channel'] ||
    headerMap['segment'] ||
    headers[1]

  const subCategoryKey =
    headerMap['subcategory'] ||
    headerMap['product'] ||
    headerMap['adgroup'] ||
    headerMap['item']

  const metric1Key =
    headerMap['revenue'] ||
    headerMap['sales'] ||
    headerMap['amount'] ||
    headerMap['spend'] ||
    headerMap['cost']

  const metric2Key =
    headerMap['cost'] ||
    headerMap['cogs'] ||
    headerMap['impressions'] ||
    headerMap['clicks']

  const metric3Key =
    headerMap['unitssold'] ||
    headerMap['units'] ||
    headerMap['quantity'] ||
    headerMap['conversions'] ||
    headerMap['orders']

  const regionKey = headerMap['region'] || headerMap['country'] || headerMap['location']
  const channelKey = headerMap['channel'] || headerMap['source'] || headerMap['medium']

  const errors: string[] = []
  const dataPoints: ParsedDataPoint[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2 // 1-based + 1 header line

    // Parse date
    const rawDate = row[dateKey]
    const parsedDate = new Date(rawDate)
    if (isNaN(parsedDate.getTime())) {
      if (errors.length < 5) {
        errors.push(`Line ${rowNum}: Invalid date value "${rawDate}". Expected YYYY-MM-DD or standard date format.`)
      }
      continue
    }

    // Category
    const category = (row[categoryKey] || 'General').trim()

    // Metrics
    const m1Raw = metric1Key ? parseFloat(String(row[metric1Key]).replace(/[^0-9.-]+/g, '')) : 0
    const m2Raw = metric2Key ? parseFloat(String(row[metric2Key]).replace(/[^0-9.-]+/g, '')) : 0
    const m3Raw = metric3Key ? parseFloat(String(row[metric3Key]).replace(/[^0-9.-]+/g, '')) : 0

    const metric1 = isNaN(m1Raw) ? 0 : m1Raw
    const metric2 = isNaN(m2Raw) ? 0 : m2Raw
    const metric3 = isNaN(m3Raw) ? 0 : m3Raw

    dataPoints.push({
      date: parsedDate,
      category,
      subCategory: subCategoryKey ? row[subCategoryKey] : undefined,
      metric1,
      metric2,
      metric3,
      region: regionKey ? row[regionKey] : undefined,
      channel: channelKey ? row[channelKey] : undefined,
      metadata: row,
    })
  }

  if (errors.length > 0) {
    return {
      valid: false,
      detectedType,
      rowCount: rows.length,
      dataPoints: [],
      errors,
      headers,
      sampleRows: rows.slice(0, 5),
    }
  }

  return {
    valid: true,
    detectedType,
    rowCount: dataPoints.length,
    dataPoints,
    errors: [],
    headers,
    sampleRows: rows.slice(0, 5),
  }
}
