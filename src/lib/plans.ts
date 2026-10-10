import { Plan } from '../../generated/prisma'

export interface PlanLimits {
  name: string
  priceMonthly: number
  currency: string
  formattedPrice: string
  targetAudience: string
  maxWorkspaces: number
  maxMembers: number
  monthlyUploads: number
  maxRowsPerCsv: number
  maxSavedReports: number
  retentionDays: number
  retentionLabel: string
  canExportCsv: boolean
  hasAuditLogs: boolean
  features: string[]
}

export const PLAN_CONFIGS: Record<Plan, PlanLimits> = {
  FREE: {
    name: 'Free',
    priceMonthly: 0,
    currency: '₹',
    formattedPrice: '₹0',
    targetAudience: 'For small businesses testing the platform',
    maxWorkspaces: 1,
    maxMembers: 3,
    monthlyUploads: 5,
    maxRowsPerCsv: 50000,
    maxSavedReports: 5,
    retentionDays: 30,
    retentionLabel: '30-day data retention',
    canExportCsv: false,
    hasAuditLogs: false,
    features: [
      '1 workspace',
      '3 team members',
      '5 CSV uploads/month (up to 250K data points)',
      'Up to 50,000 rows per CSV',
      '5 saved reports',
      'Real-time KPI dashboard',
      'Trend & distribution charts',
      'Date & category filters',
      '30-day data retention',
    ],
  },
  PRO: {
    name: 'Pro',
    priceMonthly: 1499,
    currency: '₹',
    formattedPrice: '₹1,499',
    targetAudience: 'For growing businesses and teams',
    maxWorkspaces: 5,
    maxMembers: 15,
    monthlyUploads: 50,
    maxRowsPerCsv: 50000,
    maxSavedReports: Infinity,
    retentionDays: 365,
    retentionLabel: '1-year data retention',
    canExportCsv: true,
    hasAuditLogs: true,
    features: [
      'Everything in Free, plus:',
      '5 workspaces',
      '15 team members',
      '50 CSV uploads/month (up to 2.5M data points)',
      'Up to 50,000 rows per CSV',
      'Unlimited saved reports',
      'Full CSV data export',
      '1-year data retention',
      'Team activity audit logs',
      'Team invitations & role delegation',
    ],
  },
  ADVANCED: {
    name: 'Advanced',
    priceMonthly: 4999,
    currency: '₹',
    formattedPrice: '₹4,999',
    targetAudience: 'For larger teams and high-throughput businesses',
    maxWorkspaces: Infinity,
    maxMembers: Infinity,
    monthlyUploads: 250,
    maxRowsPerCsv: 100000,
    maxSavedReports: Infinity,
    retentionDays: 1095,
    retentionLabel: '3-year data retention',
    canExportCsv: true,
    hasAuditLogs: true,
    features: [
      'Everything in Pro, plus:',
      'Unlimited workspaces',
      'Unlimited team members',
      '250 CSV uploads/month (up to 25M data points)',
      'Up to 100,000 rows per CSV',
      'Unlimited saved reports',
      'High-throughput CSV exports',
      '3-year data retention',
      'Complete audit trail history',
    ],
  },
}

export function getPlanLimits(plan: Plan): PlanLimits {
  return PLAN_CONFIGS[plan] ?? PLAN_CONFIGS.FREE
}
