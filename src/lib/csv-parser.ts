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
  sampleRows: Record<string, string>[]
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

export function detectDatasetType(headers: string[]): DatasetType {
  const norm = headers.map(normalizeHeader)

  const hasMarketing = norm.some((h) =>
    ['adspend', 'spend', 'impressions', 'clicks', 'cpa', 'cpc', 'conversions'].includes(h)
  )
  if (hasMarketing) return 'MARKETING'

  const hasSales = norm.some((h) =>
    ['revenue', 'sales', 'order', 'unitssold', 'cogs', 'product', 'customer'].includes(h)
  )
  if (hasSales) return 'SALES'

  return 'CUSTOM'
}

export function parseRobustDate(raw: string | undefined): Date | null {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  // 1. Full ISO 8601 with time: YYYY-MM-DDTHH:mm:ss... or YYYY-MM-DD HH:mm:ss...
  const isoTimeMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/)
  if (isoTimeMatch) {
    const year = parseInt(isoTimeMatch[1], 10)
    const month = parseInt(isoTimeMatch[2], 10)
    const day = parseInt(isoTimeMatch[3], 10)
    const hours = parseInt(isoTimeMatch[4], 10)
    const minutes = parseInt(isoTimeMatch[5], 10)
    const seconds = isoTimeMatch[6] ? parseInt(isoTimeMatch[6], 10) : 0
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds))
    }
  }

  // 2. Date-only ISO format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10)
    const month = parseInt(isoMatch[2], 10)
    const day = parseInt(isoMatch[3], 10)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
    }
  }

  // 3. Day/Month/Year or Month/Day/Year (DD/MM/YYYY or MM/DD/YYYY)
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (dmyMatch) {
    const first = parseInt(dmyMatch[1], 10)
    const second = parseInt(dmyMatch[2], 10)
    const year = parseInt(dmyMatch[3], 10)

    // If first > 12, it must be DD/MM/YYYY
    if (first > 12 && first <= 31 && second >= 1 && second <= 12) {
      return new Date(Date.UTC(year, second - 1, first, 0, 0, 0))
    }
    // If second > 12, it must be MM/DD/YYYY
    if (second > 12 && second <= 31 && first >= 1 && first <= 12) {
      return new Date(Date.UTC(year, first - 1, second, 0, 0, 0))
    }
    // Default standard DD/MM/YYYY
    if (first >= 1 && first <= 31 && second >= 1 && second <= 12) {
      return new Date(Date.UTC(year, second - 1, first, 0, 0, 0))
    }
  }

  // 4. Text month format e.g. "15 Jan 2026", "Jan 15, 2026"
  const textMonthMatch = trimmed.match(/^(?:(\d{1,2})[\s-]*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,-]*(\d{4})|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,-]*(\d{1,2})[\s,-]*(\d{4}))$/i)
  if (textMonthMatch) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const mStr = (textMonthMatch[2] || textMonthMatch[4]).toLowerCase().slice(0, 3)
    const mIndex = months.indexOf(mStr)
    const day = parseInt(textMonthMatch[1] || textMonthMatch[5], 10)
    const year = parseInt(textMonthMatch[3] || textMonthMatch[6], 10)
    if (mIndex >= 0 && day >= 1 && day <= 31 && year >= 1970) {
      return new Date(Date.UTC(year, mIndex, day, 0, 0, 0))
    }
  }

  return null
}

export function parseRobustNumber(raw: unknown): number {
  if (raw === null || raw === undefined) return 0
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw

  let str = String(raw).trim()
  if (!str) return 0

  // Check for accounting negative: (100) or (1,234.56)
  let isNegative = false
  if (/^\(.*\)$/.test(str)) {
    isNegative = true
    str = str.replace(/^\(|\)$/g, '').trim()
  } else if (str.startsWith('-')) {
    isNegative = true
    str = str.slice(1).trim()
  }

  // Remove currency symbols, spaces, quotes
  str = str.replace(/[$€£₹¥\s]/g, '')

  // Determine decimal format:
  const hasDot = str.includes('.')
  const hasComma = str.includes(',')

  if (hasDot && hasComma) {
    const lastDot = str.lastIndexOf('.')
    const lastComma = str.lastIndexOf(',')
    if (lastComma > lastDot) {
      // European: 1.234,56 -> remove dots, replace comma with dot
      str = str.replace(/\./g, '').replace(',', '.')
    } else {
      // US: 1,234.56 -> remove commas
      str = str.replace(/,/g, '')
    }
  } else if (hasComma && !hasDot) {
    // Only comma: check if decimal (e.g. 123,45) or thousands (e.g. 1,000)
    const parts = str.split(',')
    if (parts.length === 2 && parts[1].length <= 2) {
      str = str.replace(',', '.')
    } else {
      str = str.replace(/,/g, '')
    }
  }

  // Strip anything that is not digit or dot
  str = str.replace(/[^0-9.]/g, '')

  const num = parseFloat(str)
  if (isNaN(num)) return 0
  return isNegative ? -num : num
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
      .slice(0, 50)
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

  // Identify date column
  const dateKey =
    headerMap['date'] ||
    headerMap['timestamp'] ||
    headerMap['createdat'] ||
    headerMap['orderdate'] ||
    headers[0]

  // Identify category & channel columns disjointly
  let categoryKey: string | undefined =
    headerMap['category'] ||
    headerMap['productcategory'] ||
    headerMap['campaign'] ||
    headerMap['segment']

  let channelKey: string | undefined =
    headerMap['channel'] ||
    headerMap['source'] ||
    headerMap['medium'] ||
    headerMap['platform']

  if (!categoryKey && channelKey) {
    categoryKey = channelKey
    channelKey = undefined
  } else if (!categoryKey) {
    categoryKey = headers[1] || 'Category'
  }

  // If category and channel resolve to the same header, avoid duplication
  if (categoryKey === channelKey) {
    channelKey = undefined
  }

  const subCategoryKey =
    headerMap['subcategory'] ||
    headerMap['product'] ||
    headerMap['adgroup'] ||
    headerMap['item']

  // Disjoint metric mapping based on detected dataset type
  let metric1Key: string | undefined
  let metric2Key: string | undefined
  let metric3Key: string | undefined

  if (detectedType === 'SALES') {
    // Sales: Revenue, Cost (COGS), Units Sold
    metric1Key = headerMap['revenue'] || headerMap['sales'] || headerMap['amount'] || headerMap['totalrevenue']
    metric2Key = headerMap['cost'] || headerMap['cogs'] || headerMap['expense'] || headerMap['totalcost']
    metric3Key = headerMap['unitssold'] || headerMap['units'] || headerMap['quantity'] || headerMap['orders']
  } else if (detectedType === 'MARKETING') {
    // Marketing: Spend, Impressions/Clicks, Conversions
    metric1Key = headerMap['spend'] || headerMap['adspend'] || headerMap['cost'] || headerMap['budget']
    metric2Key = headerMap['impressions'] || headerMap['clicks'] || headerMap['traffic'] || headerMap['views']
    metric3Key = headerMap['conversions'] || headerMap['leads'] || headerMap['signups'] || headerMap['acquisitions']
  } else {
    // Custom: ensure strict disjoint mapping
    metric1Key = headerMap['metric1'] || headerMap['revenue'] || headerMap['spend'] || headerMap['amount'] || headerMap['value']
    metric2Key = headerMap['metric2'] || headerMap['cost'] || headerMap['impressions'] || headerMap['cogs']
    metric3Key = headerMap['metric3'] || headerMap['unitssold'] || headerMap['conversions'] || headerMap['units']
  }

  // Prevent double-counting the exact same column for both metric1 and metric2
  if (metric1Key && metric2Key && metric1Key === metric2Key) {
    metric2Key = undefined
  }

  const regionKey = headerMap['region'] || headerMap['country'] || headerMap['location'] || headerMap['territory']

  const errors: string[] = []
  const dataPoints: ParsedDataPoint[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2 // 1-based index (+1 header line)

    // Robust timezone-independent date parsing
    const rawDate = row[dateKey]
    const parsedDate = parseRobustDate(rawDate)
    if (!parsedDate) {
      if (errors.length < 50) {
        errors.push(`Line ${rowNum}: Invalid date value "${rawDate}". Expected YYYY-MM-DD or standard date format.`)
      }
      continue
    }

    // Category
    const category = (row[categoryKey] || 'General').trim()

    // Robust number parsing (handles European 1.234,56, accounting (100), currencies)
    const metric1 = metric1Key ? parseRobustNumber(row[metric1Key]) : 0
    const metric2 = metric2Key ? parseRobustNumber(row[metric2Key]) : 0
    const metric3 = metric3Key ? parseRobustNumber(row[metric3Key]) : 0

    dataPoints.push({
      date: parsedDate,
      category,
      subCategory: subCategoryKey ? row[subCategoryKey] : undefined,
      metric1,
      metric2,
      metric3,
      region: regionKey ? row[regionKey] : undefined,
      channel: channelKey ? row[channelKey] : undefined,
      // Optimized storage: do NOT store duplicate full row in JSONB
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
